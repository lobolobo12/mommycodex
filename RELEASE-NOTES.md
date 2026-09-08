# MommyCodex 0.2.0

Six new workflows for the desktop companion:

- Pick a GitHub issue, build on a clean branch, review selected files and test evidence, then commit, push, and open a draft PR. Optional preview screenshots are committed with the branch and linked in the PR.
- Explain, fix, or retry failed commands from the chat or build-check panel.
- Open recent projects from a launchpad with saved thumbnails, companion choices, and a one-click local preview.
- Point at a preview and send a change request with its screenshot and coordinates.
- Resume from saved task results, decisions, and unfinished plan steps, including interrupted work.
- Download the packaged macOS app below.

## Download and install

`MommyCodex-0.2.0-macos-arm64.zip` is for **Apple Silicon Macs**, macOS 12 or newer. Extract it and move MommyCodex.app to Applications. The SHA-256 checksum is provided alongside the archive.

This build is ad-hoc signed and is not Apple-notarized. macOS may require an explicit Open Anyway approval in System Settings → Privacy & Security.

Install and authenticate the Codex CLI separately. Node.js is required by the preview service; Chrome is required for browser previews. GitHub workflows require Git and the GitHub CLI (`gh auth login`). Fish speech is optional and uses your own API key stored in macOS Keychain.

Source builds remain available for Intel Macs. Native microphone recording/transcription remains unverified end to end; the release does not claim that path is tested.
