#!/usr/bin/env node
"use strict";

// Prepare the upstream Windows x64 N-API addon while building on Linux.
// Do not call node-gyp or prebuild-install: the upstream release publishes
// the exact binary we need. Verify its published SHA-256 before extraction.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const {spawnSync} = require("node:child_process");

const root = path.resolve(__dirname, "..");

function dependencyDirectory(name, from) {
    let directory = fs.realpathSync(from);

    for (;;) {
        const candidate = path.join(directory, "node_modules", ...name.split("/"));
        const manifest = path.join(candidate, "package.json");

        if (fs.existsSync(manifest)) {
            const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
            if (pkg.name === name) {
                return fs.realpathSync(candidate);
            }
        }

        const parent = path.dirname(directory);
        if (parent === directory) {
            break;
        }
        directory = parent;
    }

    throw new Error("Missing " + name + " below " + from + ". Run npm install first.");
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        ...options
    });

    if (result.error) {
        return {ok: false, message: result.error.message};
    }

    return {
        ok: result.status === 0,
        message: (result.stderr || result.stdout || "exit status " + result.status).trim(),
        stdout: result.stdout
    };
}

function verifyWindowsX64Binary(data, filename) {
    if (!Buffer.isBuffer(data) || data.length < 0x40 || data.toString("ascii", 0, 2) !== "MZ") {
        throw new Error("Not a Windows PE binary: " + filename);
    }

    const offset = data.readUInt32LE(0x3c);
    if (offset + 6 > data.length ||
        data.toString("ascii", offset, offset + 4) !== "PE\u0000\u0000" ||
        data.readUInt16LE(offset + 4) !== 0x8664) {
        throw new Error("Not a Windows x64 binary: " + filename);
    }
}

const launcher = dependencyDirectory("@httptoolkit/browser-launcher", root);
const detector = dependencyDirectory("win-detect-browsers", launcher);
const registry = dependencyDirectory("registry-js", detector);
const versionInfo = dependencyDirectory("win-version-info", detector);
const pkg = JSON.parse(fs.readFileSync(path.join(registry, "package.json"), "utf8"));

// Pinned against the upstream GitHub release asset, not the npm tarball.
// https://github.com/desktop/registry-js/releases/expanded_assets/v1.16.1
const releases = {
    "1.16.1": {
        filename: "registry-js-v1.16.1-napi-v3-win32-x64.tar.gz",
        sha256: "2d77e772f48656fbad465ffe12d7155bd2ace9312beb82bffc26e010ccc82808"
    }
};

const release = releases[pkg.version];
if (!release) {
    throw new Error("registry-js@" + pkg.version + " is not verified. Update the pinned upstream asset and SHA-256 before deploying.");
}

const napi = pkg.binary?.napi_versions;
if (!Array.isArray(napi) || !napi.includes(3)) {
    throw new Error("Expected registry-js N-API 3 binary; installed package is incompatible.");
}

const target = path.join(registry, "build", "Release", "registry.node");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fastdownloader-registry-win32-"));
const archive = path.join(tempDir, release.filename);

try {
    console.log("Preparing registry-js@" + pkg.version + " Windows x64 (N-API 3)");

    // gh is already required by scripts/deploy.js for GitHub releases.
    const download = run("gh", [
        "release", "download", "v" + pkg.version,
        "--repo", "desktop/registry-js",
        "--pattern", release.filename,
        "--dir", tempDir
    ]);

    if (!download.ok || !fs.existsSync(archive)) {
        console.warn("GitHub CLI download failed; retrying the public release URL using curl.");
        const url = "https://github.com/desktop/registry-js/releases/download/v" + pkg.version + "/" + release.filename;
        const fallback = run("curl", ["--fail", "--location", "--show-error", "--silent", "--retry", "3", "--output", archive, url]);
        if (!fallback.ok || !fs.existsSync(archive)) {
            throw new Error("Cannot download the published registry-js asset. gh: " + download.message + "; curl: " + fallback.message);
        }
    }

    const archiveBytes = fs.readFileSync(archive);
    const actual = crypto.createHash("sha256").update(archiveBytes).digest("hex");
    if (actual !== release.sha256) {
        throw new Error("registry-js asset SHA-256 mismatch. Expected " + release.sha256 + ", got " + actual);
    }
    console.log("Upstream registry-js asset SHA-256 PASS");

    const entries = run("tar", ["-tzf", archive]);
    if (!entries.ok) {
        throw new Error("Cannot list registry-js archive: " + entries.message);
    }

    const matched = entries.stdout.split(/\r?\n/).filter(entry =>
        /(?:^|\/)registry\.node$/.test(entry) &&
        !entry.split("/").includes("..")
    );
    if (matched.length !== 1) {
        throw new Error("Expected exactly one registry.node in the verified archive; found " + matched.length);
    }

    const extracted = spawnSync("tar", ["-xOzf", archive, matched[0]], {
        cwd: root,
        maxBuffer: 16 * 1024 * 1024
    });
    if (extracted.error || extracted.status !== 0) {
        throw new Error("Cannot extract registry.node: " + (extracted.error?.message || String(extracted.stderr)));
    }

    verifyWindowsX64Binary(extracted.stdout, matched[0]);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    const staging = target + ".fastdownloader.tmp";
    try {
        fs.writeFileSync(staging, extracted.stdout);
        fs.renameSync(staging, target);
    } finally {
        fs.rmSync(staging, {force: true});
    }
    console.log("Windows x64 registry.node verified:", path.relative(root, target));

    // win-version-info ships its official Windows x64 N-API prebuild in npm.
    // node-gyp-build prefers build/Release/*.node over prebuilds, so a Linux
    // native addon left behind by npm install would otherwise be loaded on
    // Windows (ERROR_BAD_EXE_FORMAT / Windows error 193).
    const windowsVersionInfo = path.join(versionInfo, "prebuilds", "win32-x64", "node.napi.node");
    if (!fs.existsSync(windowsVersionInfo)) {
        throw new Error("win-version-info is missing the official prebuilds/win32-x64/node.napi.node.");
    }
    verifyWindowsX64Binary(fs.readFileSync(windowsVersionInfo), windowsVersionInfo);
    console.log("win-version-info Windows x64 N-API prebuild verified:", path.relative(root, windowsVersionInfo));

    // Remove the host (Linux) compiled artifacts. On Windows, node-gyp-build
    // must select prebuilds/win32-x64/node.napi.node, not build/Release/VersionInfo.node.
    const hostBuild = path.join(versionInfo, "build");
    if (fs.existsSync(hostBuild)) {
        fs.rmSync(hostBuild, {recursive: true, force: true});
        console.log("Removed stale host build:", path.relative(root, hostBuild));
    }

    // Check the real package loader, without loading the Windows native addon
    // into Linux. node-gyp-build reads these target overrides at module load.
    const originalPlatform = process.env.npm_config_platform;
    const originalArch = process.env.npm_config_arch;
    const originalPrebuildsOnly = process.env.PREBUILDS_ONLY;
    try {
        process.env.npm_config_platform = "win32";
        process.env.npm_config_arch = "x64";
        delete process.env.PREBUILDS_ONLY;

        const loaderFile = require.resolve("node-gyp-build", {paths: [versionInfo]});
        const loader = require(loaderFile);
        const selected = loader.path(versionInfo);
        if (fs.realpathSync(selected) !== fs.realpathSync(windowsVersionInfo)) {
            throw new Error("win-version-info would load an incorrect native addon: " + selected);
        }
        console.log("win-version-info native loader target PASS:", path.relative(root, selected));
    } finally {
        if (originalPlatform === undefined) delete process.env.npm_config_platform;
        else process.env.npm_config_platform = originalPlatform;
        if (originalArch === undefined) delete process.env.npm_config_arch;
        else process.env.npm_config_arch = originalArch;
        if (originalPrebuildsOnly === undefined) delete process.env.PREBUILDS_ONLY;
        else process.env.PREBUILDS_ONLY = originalPrebuildsOnly;
    }

    console.log("Windows browser detection assets ready; proceeding with Linux -> Windows packaging.");
} finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
}
