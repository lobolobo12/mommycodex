# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MommyCodex is a macOS and Windows Tauri 2 desktop app that wraps the **OpenAI Codex CLI**. It supplies its own
chat UI, an anime "mommy" persona layer, an approval flow, and a project workbench (live preview,
build verification, task queue, project memory, undo). Codex itself is the engine — this repo never
reimplements agent behavior, it drives `codex app-server` over JSON-RPC.

## Commands

Uses **pnpm** (see `pnpm-lock.yaml`), not npm.

```sh
pnpm install
MOMMYCODEX_CWD=/path/to/project pnpm tauri dev   # the app operates ON a project dir; dev needs one
pnpm typecheck                                    # tsc --noEmit — the ONLY static gate (no ESLint config exists)
pnpm test                                         # vitest, matches src/**/*.test.{ts,mjs}
pnpm exec vitest run src/uwu/uwuify.test.ts       # single file
pnpm exec vitest run -t "name of the test"        # single test
pnpm test:rust                                    # cargo test --manifest-path src-tauri/Cargo.toml
pnpm build                                        # prepare-browser + tsc --noEmit + vite build
pnpm run install:app                              # release .app → ~/Applications, shim → ~/.local/bin/mommycodex
```

Opt-in tests that hit real, external resources (never run these without asking — they invoke the
user's authenticated Codex or launch a real browser):

```sh
MOMMYCODEX_LIVE_TEST=1 pnpm exec vitest run src/codex/review.live.test.mjs
MOMMYCODEX_BUILDING_LIVE_TEST=1 pnpm exec vitest run src/codex/building.live.test.mjs
node --test scripts/browser.test.mjs             # real isolated Chrome + local HTTP fixture
```

`pnpm gen:protocol` regenerates `src/protocol/generated` from the **installed** Codex CLI. The CLI
version those types came from is pinned in `src/protocol/version.ts` (currently 0.153.4). Never
hand-edit generated files; re-export what the app needs through `src/protocol/index.ts`.

Note: README documents `cargo test -- --ignored` as a "real app-server smoke test", but no
`#[ignore]` test currently exists, so that command runs zero tests.

## Architecture

```
React webview ── invoke / Channel ──▶ Rust bridge ── stdio JSON-RPC ──▶ codex app-server
```

**The Rust side is deliberately protocol-ignorant.** `src-tauri/src/codex_client.rs` only does
JSON-RPC framing: it classifies each inbound line as response / server-request / notification and
forwards everything to the webview through a *single ordered* Tauri `Channel`. All protocol
knowledge lives in TypeScript. Don't add protocol logic to Rust.

Three TS↔Rust `invoke` boundaries, and only these files may call `invoke`:
- `src/codex/transport.ts` — Codex bridge + speech (TTS/Keychain)
- `src/harness/api.ts` — workbench: project memory, checkpoints, browser
- `src/speech/dictation.ts` — microphone capture

### Codex session layer (`src/codex/`)

- `session.ts` — the `session` singleton. Owns boot handshake, threads, turns, crash/restart backoff,
  and dispatch. UI components only call methods here and read the store.
- `store.ts` — one Zustand store; `applyNotification` is a synchronous reducer over server
  notifications, kept pure enough that tests replay notification sequences against it.
- `approvals.ts` — routes server→client requests.

Two invariants worth knowing before you touch this layer:

1. **Every server→client request must be answered**, or the app-server blocks forever. Unknown
   methods get a JSON-RPC `-32601` error rather than silence (`routeServerRequest`).
2. **Delta batching must not reorder events.** Streaming deltas (`agentMessage/delta`,
   `outputDelta`, `summaryTextDelta`, `plan/delta`) are coalesced per animation frame; every
   non-delta notification and every request calls `flushDeltas()` first. Preserve those flushes.

### Persona injection (`src/persona/`, `persona/*.md`)

Four markdown files imported with `?raw`: two companions (`mommy-chan.md`, `nyx.md`) × building
theme on/off (`mommy-building.md`, `nyx-building.md`). `buildPersonaInstructions()` composes them
into `developerInstructions` on `thread/start` / `thread/resume`.

Non-obvious: **an already-loaded thread ignores resume-time instruction overrides**, so `session.ts`
tracks an `appliedPersona` map and, when the composed instructions differ, appends them via
`thread/inject_items` as a developer message — which updates preferences without creating a user
message or a turn. Preference changes therefore apply to the *next* task, never to a running one.

### Harness / workbench (`src/harness/`)

The workbench hooks into the turn lifecycle through the `SessionExtensions` interface
(`extensions.ts`) rather than by editing `session.ts`. `HarnessController` is the single
implementation, wired in via `installHarness()` from `App.tsx`. `session.ts` calls
`prepare / instructions / beforeTask / completed / failed / tool / disconnected` at the right
points; add workbench behavior by extending that interface, not by threading feature logic through
the session.

The controller drives four things off those hooks: checkpoint capture (before/after every task),
the task queue (sequential, project-bound, one conversation each), bounded build verification
(max 3 attempts), and project memory injection into instructions.

### Shared browser (`mommy_preview`)

One Chrome instance is shared by the UI preview panel and the coding agent. Path:

```
agent tool call (item/tool/call) → HarnessController.tool()
  → invoke browser_action → src-tauri/src/browser.rs
  → node src-tauri/resources/browser/bridge.cjs (playwright-core) → Chrome
```

Security posture, preserve it when editing: the bridge's HTTP endpoint is bearer-token-gated and
**only accepts a fixed allowlist of browser actions** — it explicitly cannot run shell commands or
manage processes. `HarnessController.tool()` additionally rejects any call whose `threadId` isn't
the currently active turn. The preview browser has no app IPC and no existing browser cookies, and
page content/console output is treated as untrusted project output, not instructions.

### Rust modules (`src-tauri/src/`)

Each module owns a group of Tauri commands, all registered in `lib.rs`'s `invoke_handler`.

- `binary.rs` — resolves the Codex binary, preferring the **native** binary inside the npm package
  over the Node launcher (`bin/codex.js`), so there's no extra `node` hop and `kill` hits the real
  process. `MOMMYCODEX_CODEX_BIN` overrides everything.
- `workspace.rs` — project memory + task-local file snapshots (undo). Snapshots **never touch the
  Git index**; a restore is refused entirely if any affected file changed since the task completed.
  Limits: 20,000 files / 256 MB. Stored under Tauri app data, keyed by hex-encoded canonical
  project path, split into ≤120-byte components to stay under `NAME_MAX`.
- `speech.rs` — Fish Audio TTS + ASR. The API key lives **only in the macOS Keychain or Windows Credential Manager**; it must never reach settings, localStorage, or Codex prompts.
- `microphone.rs` + `native/Microphone.swift` — `build.rs` compiles the Swift AVFoundation helper
  with `xcrun swiftc` into `resources/native/microphone` (gitignored build artifact).
- `main.rs` — calls `fix_path_env::fix()` before anything spawns a child, because Finder-launched
  GUI apps get a minimal PATH without `/opt/homebrew/bin`.

`scripts/prepare-browser.mjs` copies `playwright-core` into
`src-tauri/resources/browser/node_modules/` (gitignored); it runs automatically before `dev` and
`build`. Both resource dirs are bundled via `tauri.conf.json`.

### Uwuifier (`src/uwu/`)

`uwuify.ts` is **pure and deterministic** — variant choice comes from a hash of the input plus a
seed, never `Math.random()`, so a message always renders identically. `remarkUwu.ts` applies it only
to mdast `text` nodes and skips a fixed ancestor set (code, links, images, html, math, yaml).

The product rule this enforces: **code, diffs, commands, paths, identifiers, and commit messages are
never uwuified — only chat prose.** Intensity drops to 0 for serious mode, the Nyx companion, and
the per-message "show original" toggle.

## Persistence

| What | Where |
|---|---|
| UI settings | `localStorage` key `mommycodex.settings.v1` (`src/settings.ts`) |
| Task queue | `localStorage` key `mommycodex.harness.v1`; tasks `running` at load become `interrupted` and the queue starts paused, so uncertain work is never silently repeated |
| Project memory, checkpoints | Tauri app data dir, per canonical project path (`workspace.rs`) |
| Fish API key | macOS Keychain / Windows Credential Manager |

Codex's own global settings and any `AGENTS.md` are never modified by this app.

## Conventions

- **Code style is not uniform, and that's intentional-by-history.** `src/codex/`, `src/uwu/` and
  `src-tauri/` use conventional formatting with module-level doc comments explaining *why*.
  `src/harness/` and parts of `src/speech/` use a deliberately dense single-line style. Match the
  file you're editing rather than reformatting it.
- Comments in this codebase explain non-obvious constraints (protocol quirks, ordering, security
  guards). Keep that bar; don't add narration.
- Platform overlays select Mac app/DMG or Windows NSIS installers. `windows.rs` owns Windows key storage and isolated audio helper modes; the Mac install script is Mac-only. Keep Windows commands and process cleanup portable.

## Project status

`HARNESS-UPGRADE.md` tracks the six workbench features and the evidence gathered for each. One item
is still open: **native microphone capture + Fish transcription has never been verified end-to-end**
— it requires explicit user authorization to grant mic access and send a clip to Fish. Don't claim
that path works, and don't attempt indirect capture to work around the missing approval.
