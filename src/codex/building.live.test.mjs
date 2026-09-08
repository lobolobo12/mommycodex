import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { Script } from "node:vm";
import { expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { CodexSession } from "./session";
import { useAppStore } from "./store";
import * as transport from "./transport";

// Opt in: compare real generated artifacts with the toggle on and off in the same thread.
it.skipIf(env.MOMMYCODEX_BUILDING_LIVE_TEST !== "1")("themes game output and stops theming after switching off", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "mommycodex-building-"));
  writeFileSync(join(cwd, "AGENTS.md"), "Text-only prompt verification. Do not use tools, read files, scan directories, or edit files. Return requested code in your reply.\n");
  const child = spawn("codex", ["app-server"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  const session = new CodexSession();
  const pending = new Map();
  const completed = [];
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
        send({ id: message.id, error: { code: -32000, message: "Text-only fixture: interactive requests declined." } });
      } else if (message.method) {
        session.dispatch({ type: "notification", method: message.method, params: message.params });
        if (message.method === "turn/started") console.log("Game sample started");
        if (message.method === "item/started") console.log(`Sample item: ${message.params.item.type}`);
        if (message.method === "turn/completed") completed.push(message.params.turn);
      }
    }
  });
  child.on("exit", () => { for (const request of pending.values()) request.reject(new Error("Codex exited")); pending.clear(); });
  // Use an ordinary thread: the installed server cannot resume ephemeral threads.
  vi.spyOn(transport, "rpc").mockImplementation(rpc);
  useAppStore.getState().setTransientMood(null);
  useAppStore.setState({ connection: { state: "ready", binary: "codex" }, settings: { ...DEFAULT_SETTINGS, effort: "medium", sandbox: "read-only", seriousMode: true, mommyBuilding: true },
    cwd, models: [], threads: {}, activeThreadId: null, activeTurn: null, threadLoading: false, submissionPending: false,
    items: {}, itemsByThread: {}, activityByThread: {}, tokenUsageByThread: {}, pendingRequests: [], lastTurnStatus: null,
  });
  try {
    await rpc("initialize", { clientInfo: { name: "mommycodex_building_test", version: "0.1.0" }, capabilities: { experimentalApi: false } });
    send({ method: "initialized", params: {} });
    const request = "Create a tiny clicker game as one self-contained HTML file in a single html code fence. Include a small original inline SVG illustration, score, and restart button. Keep the entire file under 50 short lines, with no external dependencies. Return code only. Do not use tools, inspect files, or write files.";
    for (const enabled of [true, false]) {
      useAppStore.getState().updateSettings({ mommyBuilding: enabled });
      const count = completed.length;
      await session.send(enabled ? request : `This is a separate new project, unrelated to the previous game. ${request}`);
      await vi.waitFor(() => expect(completed).toHaveLength(count + 1), { timeout: 180_000, interval: 200 });
      const turn = completed.at(-1);
      expect(turn.status).toBe("completed");
      const reply = turn.items.filter((item) => item.type === "agentMessage").map((item) => item.text).join("\n");
      const html = reply.match(/```html\s*\n([\s\S]*?)```/i)?.[1] ?? reply;
      writeFileSync(join(cwd, enabled ? "on.html" : "off.html"), html);
      expect(html).toMatch(/<svg\b/i);
      expect(html).toMatch(/<button\b/i);
      const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
      expect(scripts.length).toBeGreaterThan(0);
      for (const [, source] of scripts) expect(() => new Script(source)).not.toThrow();
      if (enabled) {
        expect(html).toMatch(/mommy|mama/i);
        expect(html).toMatch(/anime|uwu|sweetheart|darling/i);
      } else expect(html).not.toMatch(/mommy|mama|uwu|ara ara/i);
      expect(useAppStore.getState().activeTurn).toBeNull();
    }
    console.log(`Building mode comparison: ${cwd}/on.html and ${cwd}/off.html`);
  } finally {
    child.kill();
    useAppStore.getState().setTransientMood(null);
    vi.restoreAllMocks();
  }
}, 400_000);
