#!/usr/bin/env node
"use strict";

// Download the Windows N-API build of registry-js on any host OS. No Wine,
// MSVC, or node-gyp compilation is required. Fail before deployment if the
// correct native assets are unavailable.
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const root = path.resolve(__dirname, "..");

function dependencyDirectory(name, parent) {
    try {
        return path.dirname(require.resolve(name + "/package.json", {paths: [parent]}));
    } catch (error) {
        throw new Error("Missing dependency " + name + " below " + parent + ". Run npm install first.", {cause: error});
    }
}

function verifyWindowsX64Binary(filename) {
    if (!fs.existsSync(filename)) {
        throw new Error("Required Windows binary is missing: " + filename);
    }

    const file = fs.readFileSync(filename);
    if (file.length < 0x40 || file.toString("ascii", 0, 2) !== "MZ") {
        throw new Error("Not a Windows PE binary: " + filename);
    }

    const peOffset = file.readUInt32LE(0x3c);
    if (peOffset + 6 > file.length ||
        file.toString("ascii", peOffset, peOffset + 4) !== "PE\u0000\u0000" ||
        file.readUInt16LE(peOffset + 4) !== 0x8664) {
        throw new Error("Not a Windows x64 PE binary: " + filename);
    }

    console.log("Verified Windows x64 native addon:", path.relative(root, filename));
}

const launcher = dependencyDirectory("@httptoolkit/browser-launcher", root);
const winDetect = dependencyDirectory("win-detect-browsers", launcher);
const registry = dependencyDirectory("registry-js", winDetect);
const versionInfo = dependencyDirectory("win-version-info", winDetect);
const pkg = require(path.join(registry, "package.json"));

// registry-js uses N-API. This ABI is stable across supported Node/Electron
// versions; never try to build for the Electron 45 Node ABI instead.
const napiVersion = pkg.binary?.napi_versions?.[0] ?? 3;
const prebuildInstaller = require.resolve("prebuild-install/bin.js", {paths: [registry]});

console.log("Preparing", pkg.name + "@" + pkg.version, "for Windows x64 (N-API", napiVersion + ")");
const result = spawnSync(process.execPath, [
    prebuildInstaller,
    "--platform=win32",
    "--arch=x64",
    "--runtime=napi",
    "--target=" + napiVersion
], {
    cwd: registry,
    stdio: "inherit",
    env: {
        ...process.env,
        npm_config_platform: "win32",
        npm_config_arch: "x64",
        npm_config_runtime: "napi",
        npm_config_target: String(napiVersion)
    }
});

if (result.error) throw result.error;
if (result.status !== 0) {
    throw new Error("Could not retrieve the Windows x64 N-API prebuild for registry-js. Aborting deployment.");
}

verifyWindowsX64Binary(path.join(registry, "build", "Release", "registry.node"));

// win-version-info distributes platform-specific prebuildify binaries inside
// its npm package, rather than downloading them during the rebuild step.
const prebuildDir = path.join(versionInfo, "prebuilds", "win32-x64");
if (!fs.existsSync(prebuildDir)) {
    throw new Error("win-version-info does not contain prebuilds/win32-x64. Aborting deployment.");
}

const nativeFiles = fs.readdirSync(prebuildDir)
    .filter(name => name.endsWith(".node"))
    .map(name => path.join(prebuildDir, name));
if (!nativeFiles.length) {
    throw new Error("win-version-info is missing its Windows x64 .node binary. Aborting deployment.");
}
for (const file of nativeFiles) verifyWindowsX64Binary(file);

console.log("Windows browser-detection native assets are ready for packaging.");
