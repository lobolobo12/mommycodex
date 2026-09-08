import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { CodexSession } from "./session";
import { useAppStore } from "./store";
import * as transport from "./transport";

// Opt in because this invokes the installed, authenticated Codex against a disposable repository.
it.skipIf(env.MOMMYCODEX_LIVE_TEST !== "1")("finishes a real nested Codex review and enables the next message", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "mommycodex-review-"));
  writeFileSync(join(cwd, "cart.js"), "export const total = (price, quantity) => price * quantity;\n");
  writeFileSync(join(cwd, "AGENTS.md"), "This is a tiny arithmetic test fixture. Inspect only cart.js and its git diff. Do not scan parent directories. Reviews must not edit files.\n");
  execFileSync("git", ["init", "-q", cwd]);
  execFileSync("git", ["-C", cwd, "add", "."]);
  execFileSync("git", ["-C", cwd, "-c", "user.name=MommyCodex Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Fixture baseline"]);
  writeFileSync(join(cwd, "cart.js"), "export const total = (price, quantity) => price + quantity;\n");
  const child = spawn("codex", ["app-server"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  const session = new CodexSession();
  const pending = new Map();
  const events = [];
  let sequence = 0;
  let buffer = "";
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    send({ id, method, params });
  });
  child.stderr.on("data", () => {});
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.id != null && !message.method) {
        const request = pending.get(message.id); pending.delete(message.id);
        if (message.error) request?.reject(new Error(message.error.message));
        else request?.resolve(message.result);
      } else if (message.id != null) {
        send({ id: message.id, error: { code: -32000, message: "Read-only fixture: interactive requests declined." } });
      } else if (message.method) {
        events.push(message.method);
        session.dispatch({ type: "notification", method: message.method, params: message.params });
      }
    }
  });
  child.on("exit", () => { for (const request of pending.values()) request.reject(new Error("Codex exited")); pending.clear(); });
  vi.spyOn(transport, "rpc").mockImplementation(rpc);
  useAppStore.getState().setTransientMood(null);
  useAppStore.setState({ connection: { state: "ready", binary: "codex" }, settings: { ...DEFAULT_SETTINGS, sandbox: "read-only", seriousMode: true },
    cwd, models: [], threads: {}, activeThreadId: null, activeTurn: null, threadLoading: false, submissionPending: false,
    items: {}, itemsByThread: {}, activityByThread: {}, tokenUsageByThread: {}, pendingRequests: [], lastTurnStatus: null,
  });
  try {
    await rpc("initialize", { clientInfo: { name: "mommycodex_review_test", version: "0.1.0" }, capabilities: { experimentalApi: false } });
    send({ method: "initialized", params: {} });
    await session.reviewChanges();
    await vi.waitFor(() => {
      expect(events).toContain("turn/completed");
      expect(useAppStore.getState().activeTurn).toBeNull();
      expect(useAppStore.getState().lastTurnStatus).toBe("completed");
    }, { timeout: 100_000, interval: 200 });
    expect(useAppStore.getState().submissionPending).toBe(false);
    const reviewItems = Object.values(useAppStore.getState().items);
    expect(reviewItems.some((item) => item.item.type === "exitedReviewMode")).toBe(true);
    expect(reviewItems.some((item) => item.liveText.includes("quantity") || item.liveText.includes("multiplication"))).toBe(true);
  } finally {
    child.kill();
    useAppStore.getState().setTransientMood(null);
    vi.restoreAllMocks();
  }
}, 120_000);
