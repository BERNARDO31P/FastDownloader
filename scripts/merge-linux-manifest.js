#!/usr/bin/env node
"use strict";

// Preserve electron-builder's existing Linux update entries, replacing only
// the repackaged AppImage entry. When the published manifest was previously
// overwritten, reconstruct missing DEB/RPM/Pacman entries from release assets.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

function fatal(message) {
    throw new Error(message);
}

function getOptions() {
    const values = {};
    for (let i = 2; i < process.argv.length; i += 2) {
        const key = process.argv[i];
        const value = process.argv[i + 1];
        if (!key?.startsWith("--") || value === undefined) {
            fatal("Expected --name value arguments");
        }
        values[key.slice(2)] = value;
    }
    for (const key of ["base", "output", "version", "appimage-name"]) {
        if (!values[key]) fatal(`Missing --${key}`);
    }
    return values;
}

function gh(args) {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function decodeScalar(raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
        return JSON.parse(trimmed);
    }
    if (trimmed.startsWith("\u0027") && trimmed.endsWith("\u0027")) {
        return trimmed.slice(1, -1).replace(/\u0027\u0027/g, "\u0027");
    }
    return trimmed;
}

function parseManifest(data, version) {
    if (!data.trim()) {
        return { prefix: [`version: ${version}`, "files:"], entries: [], suffix: [`releaseDate: ${new Date().toISOString()}`] };
    }
    if (/^\s*signatures?:\s*/m.test(data)) {
        fatal("The existing update manifest is signed; merging would invalidate its signature. Re-sign it instead.");
    }
    const lines = data.replace(/\r\n/g, "\n").trimEnd().split("\n");
    const versionLine = lines.find(line => /^version:\s*/.test(line));
    if (!versionLine || decodeScalar(versionLine.replace(/^version:\s*/, "")) !== version) {
        fatal(`Expected manifest version ${version}, found ${versionLine || "none"}`);
    }
    const start = lines.findIndex(line => /^files:\s*$/.test(line));
    if (start < 0) fatal("Existing manifest has no top-level files array");
    let end = start + 1;
    while (end < lines.length && (lines[end].trim() === "" || /^\s/.test(lines[end]) || /^#/.test(lines[end]))) {
        end++;
    }
    const region = lines.slice(start + 1, end);
    const entryStarts = [];
    for (let i = 0; i < region.length; ++i) {
        if (/^ {2}- url:\s*/.test(region[i])) entryStarts.push(i);
        else if (region[i].trim() && !/^ {4,}/.test(region[i]) && !/^\s*#/.test(region[i])) {
            fatal(`Unexpected YAML layout in files: ${region[i]}`);
        }
    }
    const entries = entryStarts.map((index, i) => {
        const block = region.slice(index, entryStarts[i + 1] ?? region.length);
        const name = decodeScalar(block[0].replace(/^ {2}- url:\s*/, ""));
        if (!name || name.includes("/") || name.includes("\\")) fatal(`Unexpected asset URL: ${name}`);
        return { name, lines: block };
    });
    if (entries.length !== new Set(entries.map(e => e.name)).size) fatal("Duplicate file URLs in existing manifest");
    return { prefix: lines.slice(0, start + 1), entries, suffix: lines.slice(end) };
}

async function digestFile(filename) {
    const hash = crypto.createHash("sha512");
    for await (const part of fs.createReadStream(filename)) hash.update(part);
    return { sha512: hash.digest("base64"), size: fs.statSync(filename).size };
}

function makeEntry(name, sha512, size) {
    return {
        name,
        lines: [`  - url: ${name}`, `    sha512: ${sha512}`, `    size: ${size}`]
    };
}

function updateTopLevel(lines, key, value) {
    const replacement = `${key}: ${value}`;
    const index = lines.findIndex(line => new RegExp(`^${key}:`).test(line));
    if (index >= 0) lines[index] = replacement;
    else lines.push(replacement);
}

async function main() {
    const options = getOptions();
    const version = options.version;
    const name = options["appimage-name"];
    const base = fs.existsSync(options.base) ? fs.readFileSync(options.base, "utf8") : "";
    const manifest = parseManifest(base, version);
    let appEntry;

    if (options.appimage) {
        if (path.basename(options.appimage) !== name) fatal("AppImage filename does not match --appimage-name");
        const { sha512, size } = await digestFile(options.appimage);
        appEntry = makeEntry(name, sha512, size);
    } else {
        appEntry = manifest.entries.find(entry => entry.name === name);
        if (!appEntry) fatal(`Cannot repair: published manifest does not contain ${name}`);
    }
    manifest.entries = manifest.entries.filter(entry => !entry.name.endsWith(".AppImage"));

    if (options.repo && options.tag) {
        const response = JSON.parse(gh(["release", "view", options.tag, "--repo", options.repo, "--json", "assets"]));
        const releaseAssets = (response.assets || []).map(asset => asset.name);
        const updatable = releaseAssets.filter(filename =>
            filename.includes(version) && /\.(?:deb|rpm|pacman)$/.test(filename)
        );
        for (const assetName of updatable) {
            if (manifest.entries.some(entry => entry.name === assetName)) continue;
            // Obtain the EXACT published bytes so the hashes remain correct, even
            // if the local dist contains a different build with the same filename.
            const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fd-manifest-"));
            try {
                process.stderr.write(`Restoring missing manifest entry from release: ${assetName}\n`);
                gh(["release", "download", options.tag, "--repo", options.repo,
                    "--pattern", assetName, "--dir", temp]);
                const assetPath = path.join(temp, assetName);
                if (!fs.statSync(assetPath).isFile()) fatal(`Downloaded asset missing: ${assetName}`);
                const { sha512, size } = await digestFile(assetPath);
                manifest.entries.push(makeEntry(assetName, sha512, size));
            } finally {
                fs.rmSync(temp, { recursive: true, force: true });
            }
        }
        if (updatable.length !== updatable.filter(filename =>
            manifest.entries.some(entry => entry.name === filename)
        ).length) fatal("Manifest would omit a published updatable Linux package");
    }

    manifest.entries.push(appEntry);
    if (!manifest.entries.length) fatal("No update entries");
    const appSha = appEntry.lines.find(line => /^ {4}sha512:\s*/.test(line));
    if (!appSha) fatal("Missing AppImage sha512");
    updateTopLevel(manifest.suffix, "path", name);
    updateTopLevel(manifest.suffix, "sha512", appSha.replace(/^ {4}sha512:\s*/, ""));
    const result = [...manifest.prefix, ...manifest.entries.flatMap(entry => entry.lines), ...manifest.suffix].join("\n") + "\n";
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, result);
    process.stdout.write(`Merged Linux updater manifest (${manifest.entries.length} entries):\n`);
    for (const entry of manifest.entries) process.stdout.write(`  ${entry.name}\n`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
