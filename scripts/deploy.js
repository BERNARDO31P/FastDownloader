#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
process.chdir(root);

const targets = process.argv.slice(2);
if (!targets.length || targets.some(target => !["--win", "--linux"].includes(target))) {
    console.error("Usage: node scripts/deploy.js --win [--linux] | --linux");
    process.exit(2);
}

function run(command, args, env = process.env) {
    const executable = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
    const result = spawnSync(executable, args, {
        cwd: root,
        env,
        stdio: "inherit",
        shell: process.platform === "win32" && command === "npx"
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}

const pkg = require(path.join(root, "package.json"));
const providers = Array.isArray(pkg.build.publish) ? pkg.build.publish : [pkg.build.publish];
const github = providers.find(provider => provider && typeof provider === "object" && provider.provider === "github");
if (!github || !github.owner || !github.repo) {
    throw new Error("Expected a GitHub publish provider with owner and repo in package.json");
}

const repo = `${github.owner}/${github.repo}`;
const tag = `v${pkg.version}`;

// Validate the Linux AppImage prerequisites before uploading other packages.
if (targets.includes("--linux")) run("bash", ["scripts/appimage.sh", "--check"]);

const release = spawnSync("gh", ["release", "view", tag, "--repo", repo, "--json", "isDraft,isPrerelease"], {
    cwd: root,
    encoding: "utf8"
});
if (release.error) throw release.error;

let releaseType = "draft";
if (release.status === 0) {
    const info = JSON.parse(release.stdout);
    releaseType = info.isDraft ? "draft" : info.isPrerelease ? "prerelease" : "release";
} else if (!/not found|\b404\b|no release found/i.test(release.stderr || "")) {
    throw new Error(`Could not determine status of GitHub release ${tag}: ${release.stderr || release.stdout}`);
}

let configFile = null;
const env = { ...process.env };
const args = ["electron-builder", "build", ...targets];
if (releaseType !== "draft") {
    fs.mkdirSync(path.join(root, "dist"), { recursive: true });
    configFile = path.join(root, "dist", ".fastdownloader-release-config.json");
    const buildConfig = structuredClone(pkg.build);
    const publishers = Array.isArray(buildConfig.publish) ? buildConfig.publish : [buildConfig.publish];
    buildConfig.publish = publishers.map(provider =>
        provider && typeof provider === "object" && provider.provider === "github"
            ? { ...provider, releaseType }
            : provider
    );
    fs.writeFileSync(configFile, JSON.stringify(buildConfig, null, 2));
    args.push("--config", configFile);
    env.EP_GH_IGNORE_TIME = "true";
    delete env.EP_DRAFT;
    delete env.EP_PRE_RELEASE;
    delete env.EP_PRELEASE;
}
args.push("--publish", "always");

try {
    console.log(`GitHub release ${tag}: ${releaseType}${release.status === 0 ? " (existing)" : " (new draft)"}`);
    run("npx", args, env);
    if (targets.includes("--linux")) run("bash", ["scripts/appimage.sh"], env);
} finally {
    if (configFile) fs.rmSync(configFile, { force: true });
}
