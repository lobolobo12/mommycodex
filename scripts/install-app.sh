#!/bin/sh
# Build the release .app bundle, copy it to ~/Applications, and install the
# `mommycodex` shell shim into ~/.local/bin.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT"
if ! command -v cargo >/dev/null 2>&1; then
  # rustup installs here; GUI/login shells may not have sourced it yet.
  [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
fi
pnpm tauri build --bundles app
BUNDLE="$ROOT/src-tauri/target/release/bundle/macos/MommyCodex.app"
[ -d "$BUNDLE" ] || { echo "install-app: bundle not found at $BUNDLE" >&2; exit 1; }
mkdir -p "$HOME/Applications" "$HOME/.local/bin"
rm -rf "$HOME/Applications/MommyCodex.app"
ditto "$BUNDLE" "$HOME/Applications/MommyCodex.app"
install -m 755 "$ROOT/scripts/mommycodex" "$HOME/.local/bin/mommycodex"
echo "Installed ~/Applications/MommyCodex.app and ~/.local/bin/mommycodex"
