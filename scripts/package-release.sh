#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export pnpm_config_verify_deps_before_run=false
pnpm tauri build --bundles app
VERSION=$(node -p 'JSON.parse(require("fs").readFileSync("package.json","utf8")).version')
ARCH=$(uname -m)
DEST="output/releases"
mkdir -p "$DEST"
BUNDLE="src-tauri/target/release/bundle/macos/MommyCodex.app"
codesign --verify --deep --strict "$BUNDLE"
ditto -c -k --sequesterRsrc --keepParent "$BUNDLE" "$DEST/MommyCodex-$VERSION-macos-$ARCH.zip"
(cd "$DEST" && shasum -a 256 "MommyCodex-$VERSION-macos-$ARCH.zip" > "MommyCodex-$VERSION-macos-$ARCH.zip.sha256")
printf 'Release archive: %s/MommyCodex-%s-macos-%s.zip\n' "$DEST" "$VERSION" "$ARCH"
