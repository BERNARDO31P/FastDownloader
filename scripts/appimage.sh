#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPO="BERNARDO31P/fastDownloader"
APP_ID="fm.bernardo.fastDownloader"
DIST_DIR="$ROOT/dist"
WORK_DIR="$DIST_DIR/.appimage-release-work"
META_SOURCE="$ROOT/resources/$APP_ID.appdata.xml"

check_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing command: $1" >&2
        exit 1
    fi
}

check_dependencies() {
    if [[ "$(uname -s)" != "Linux" ]]; then
        echo "AppImage releases must be built on Linux (WSL2 is supported)." >&2
        exit 1
    fi

    for command_name in node npx appstreamcli curl gh; do
        check_command "$command_name"
    done

    if [[ ! -f "$META_SOURCE" ]]; then
        echo "AppStream metadata not found: $META_SOURCE" >&2
        exit 1
    fi

    if ! gh auth status >/dev/null 2>&1; then
        echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
        echo "Alternatively, set GH_TOKEN or GITHUB_TOKEN for this session." >&2
        exit 1
    fi
}

MODE="${1:---publish}"
case "$MODE" in
    --check)
        check_dependencies
        echo "AppImage release prerequisites OK."
        exit 0
        ;;
    --publish)
        check_dependencies
        ;;
    --no-upload)
        check_command node
        check_command npx
        check_command appstreamcli
        check_command curl
        if [[ ! -f "$META_SOURCE" ]]; then
            echo "AppStream metadata not found: $META_SOURCE" >&2
            exit 1
        fi
        ;;
    *)
        echo "Usage: bash scripts/appimage.sh [--check|--publish|--no-upload]" >&2
        exit 2
        ;;
esac

VERSION="$(node -p "require(\"./package.json\").version")"
APPIMAGE_NAME="FastDownloader-$VERSION.AppImage"
APPIMAGE_PATH="$DIST_DIR/$APPIMAGE_NAME"
ZSYNC_PATH="$APPIMAGE_PATH.zsync"
MANIFEST_PATH="$DIST_DIR/latest-linux.yml"
TAG="v$VERSION"

mkdir -p "$DIST_DIR"

# Build only AppImage, without publishing the unprocessed binary.
rm -f "$APPIMAGE_PATH" "$ZSYNC_PATH"
echo "Building $APPIMAGE_NAME..."
npx electron-builder build --linux AppImage --x64 --publish never

if [[ ! -s "$APPIMAGE_PATH" ]]; then
    echo "Build did not create $APPIMAGE_PATH" >&2
    exit 1
fi
chmod +x "$APPIMAGE_PATH"

# Reuse a downloaded appimagetool if present, otherwise fetch it once.
if [[ -n "${APPIMAGETOOL:-}" ]]; then
    TOOL="$APPIMAGETOOL"
elif [[ -f "$DIST_DIR/appimagetool-x86_64.AppImage" ]]; then
    TOOL="$DIST_DIR/appimagetool-x86_64.AppImage"
else
    TOOL="$DIST_DIR/.tools/appimagetool-x86_64.AppImage"
    if [[ ! -s "$TOOL" ]]; then
        mkdir -p "$(dirname "$TOOL")"
        echo "Downloading appimagetool..."
        curl -fL --retry 3 \
            "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage" \
            -o "$TOOL"
    fi
fi
if [[ ! -f "$TOOL" ]]; then
    echo "appimagetool not found: $TOOL" >&2
    exit 1
fi
chmod +x "$TOOL"
# appimagetool must remain reachable after changing into the output directory.
TOOL="$(cd "$(dirname "$TOOL")" && pwd)/$(basename "$TOOL")"

# Use a clean extraction directory to avoid leftover files from previous releases.
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
(
    cd "$WORK_DIR"
    "$APPIMAGE_PATH" --appimage-extract
)

APPDIR="$WORK_DIR/squashfs-root"
DESKTOP_FILE="$APP_ID.desktop"
if [[ ! -f "$APPDIR/$DESKTOP_FILE" ]]; then
    echo "Desktop entry not found: $APPDIR/$DESKTOP_FILE" >&2
    exit 1
fi

# appimagetool validates AppStream against the XDG desktop entry location.
mkdir -p "$APPDIR/usr/share/applications" "$APPDIR/usr/share/metainfo"
cp -L "$APPDIR/$DESKTOP_FILE" "$APPDIR/usr/share/applications/$DESKTOP_FILE"
cp "$META_SOURCE" "$APPDIR/usr/share/metainfo/$APP_ID.appdata.xml"

appstreamcli validate --no-net "$APPDIR/usr/share/metainfo/$APP_ID.appdata.xml"

# Repackage with AppImageUpdate information; appimagetool creates the .zsync.
UPDATE_INFO="gh-releases-zsync|BERNARDO31P|fastDownloader|latest|FastDownloader-*.AppImage.zsync"
# appimagetool runs zsyncmake without an output path. It writes the .zsync
# into the process working directory, not next to the destination AppImage.
# Run from WORK_DIR so both artifacts land where the script expects them.
(
    cd "$WORK_DIR"
    ARCH=x86_64 "$TOOL" \
        -u "$UPDATE_INFO" \
        "$APPDIR" \
        "$WORK_DIR/$APPIMAGE_NAME"
)

if [[ ! -s "$WORK_DIR/$APPIMAGE_NAME" || ! -s "$WORK_DIR/$APPIMAGE_NAME.zsync" ]]; then
    echo "Repackaging failed to produce an AppImage and a .zsync file." >&2
    exit 1
fi

# Repacking changes the checksum. Generate metadata for the FINAL binary.
# Do not reuse electron-builder's old latest-linux.yml or embedded blockMapSize.
APPIMAGE_FILE="$WORK_DIR/$APPIMAGE_NAME" \
MANIFEST_FILE="$WORK_DIR/latest-linux.yml" \
RELEASE_VERSION="$VERSION" node <<"NODE"
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const file = process.env.APPIMAGE_FILE;
const manifest = process.env.MANIFEST_FILE;
const version = process.env.RELEASE_VERSION;
const name = path.basename(file);
const size = fs.statSync(file).size;
const hash = crypto.createHash("sha512");

const stream = fs.createReadStream(file);
stream.on("data", chunk => hash.update(chunk));
stream.on("error", error => {
    console.error(error);
    process.exitCode = 1;
});
stream.on("end", () => {
    const sha512 = hash.digest("base64");
    const contents = [
        `version: ${version}`,
        "files:",
        `  - url: ${name}`,
        `    sha512: ${sha512}`,
        `    size: ${size}`,
        `path: ${name}`,
        `sha512: ${sha512}`,
        `releaseDate: ${new Date().toISOString()}`,
        ""
    ].join("\n");
    fs.writeFileSync(manifest, contents);
});
NODE

# Replace the unprocessed output only after all generation steps succeeded.
mv -f "$WORK_DIR/$APPIMAGE_NAME" "$APPIMAGE_PATH"
mv -f "$WORK_DIR/$APPIMAGE_NAME.zsync" "$ZSYNC_PATH"
mv -f "$WORK_DIR/latest-linux.yml" "$MANIFEST_PATH"

# Verify update information exists in the final binary.
ACTUAL_UPDATE_INFO="$("$APPIMAGE_PATH" --appimage-updateinformation)"
if [[ "$ACTUAL_UPDATE_INFO" != "$UPDATE_INFO" ]]; then
    echo "Embedded update information does not match the expected value." >&2
    echo "Expected: $UPDATE_INFO" >&2
    echo "Actual:   $ACTUAL_UPDATE_INFO" >&2
    exit 1
fi

if [[ "$MODE" == "--publish" ]]; then
    if ! gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
        echo "GitHub Release $TAG does not exist. The normal deploy step must run first." >&2
        exit 1
    fi

    # Upload LAST: no further electron-builder process can overwrite latest-linux.yml.
    gh release upload "$TAG" \
        "$APPIMAGE_PATH" \
        "$ZSYNC_PATH" \
        "$MANIFEST_PATH" \
        --repo "$REPO" \
        --clobber
fi

rm -rf "$WORK_DIR"
echo "AppImage ready: $APPIMAGE_PATH"
echo "Update file ready: $ZSYNC_PATH"
echo "Updater manifest ready: $MANIFEST_PATH"
if [[ "$MODE" == "--publish" ]]; then
    echo "Uploaded to GitHub Release $TAG."
fi