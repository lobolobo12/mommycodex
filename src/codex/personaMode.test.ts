import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../settings";
import { buildPersonaInstructions } from "../persona";
import { CodexSession } from "./session";
import { useAppStore } from "./store";
import * as transport from "./transport";

const thread = { id: "persona-test", cwd: "/tmp/project", createdAt: 1, updatedAt: 1, preview: "", turns: [] };

describe("Mommy mode across turns", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      cwd: "/tmp/project", models: [], threads: {}, activeThreadId: null,
      items: {}, itemsByThread: {}, activeTurn: null, threadLoading: false,
      pendingRequests: [], transientMood: null, toasts: [], submissionPending: false,
    });
  });

  function mockRpc() {
    return vi.spyOn(transport, "rpc").mockImplementation(async (method) => {
      if (method === "thread/start" || method === "thread/resume") return { thread } as never;
      if (method === "turn/start") return { turn: null } as never;
      if (method === "thread/inject_items") return {} as never;
      throw new Error(`Unexpected RPC: ${method}`);
    });
  }

  it("switches an existing conversation to Nyx and back before the next turn", async () => {
    const rpc = mockRpc();
    const session = new CodexSession();
    await session.send("hello");
    rpc.mockClear();
    useAppStore.getState().updateSettings({ character: "nyx", mommyBuilding: true });
    await session.send("build something");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items", "turn/start"]);
    const prompt = (rpc.mock.calls[0][1] as { developerInstructions: string }).developerInstructions;
    expect(prompt).toContain("You are Nyx");
    expect(prompt).toContain("dominant goth mommy vibe");
    expect(prompt).toContain("Nyx goth theme");
    expect(prompt).not.toContain("maximum Mommy mode");
    rpc.mockClear();
    useAppStore.getState().updateSettings({ character: "mommy", mommyBuilding: false });
    await session.send("back to sweet");
    expect((rpc.mock.calls[0][1] as { developerInstructions: string }).developerInstructions).toContain("maximum Mommy mode");
  });

  it("keeps Nyx's build preference separate from serious chat mode", () => {
    const prompt = buildPersonaInstructions({ character: "nyx", serious: true, mommyBuilding: true });
    expect(prompt).toContain("plain, professional prose");
    expect(prompt).not.toContain("You are Nyx");
    expect(prompt).toContain("Nyx goth theme");
  });

  it("changes the existing thread's instructions before sending after a mode switch", async () => {
    const rpc = mockRpc();
    const session = new CodexSession();
    await session.send("hello");
    const onPrompt = (rpc.mock.calls.find(([method]) => method === "thread/start")![1] as { developerInstructions: string }).developerInstructions;
    expect(onPrompt).toContain("maximum Mommy mode");

    rpc.mockClear();
    useAppStore.getState().updateSettings({ seriousMode: true });
    expect(rpc).not.toHaveBeenCalled();
    await session.send("plain answer please");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items", "turn/start"]);
    const offPrompt = (rpc.mock.calls[0][1] as { developerInstructions: string }).developerInstructions;
    expect(offPrompt).toContain("plain, professional prose");
    expect(offPrompt).not.toContain("sweetheart");

    rpc.mockClear();
    useAppStore.getState().updateSettings({ seriousMode: false });
    await session.send("back to Mommy");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items", "turn/start"]);
    expect((rpc.mock.calls[0][1] as { developerInstructions: string }).developerInstructions).toBe(onPrompt);
  });

  it("leaves a running turn alone and avoids resuming when the voice is unchanged", async () => {
    const rpc = mockRpc();
    const session = new CodexSession();
    await session.send("hello");
    rpc.mockClear();
    const activeTurn = { threadId: thread.id, turnId: "running", status: "inProgress" as const };
    useAppStore.setState({ activeTurn });
    useAppStore.getState().updateSettings({ seriousMode: true });
    expect(useAppStore.getState().activeTurn).toEqual(activeTurn);
    expect(rpc).not.toHaveBeenCalled();

    // If the user switches back before the next turn, nothing needs to be reapplied.
    useAppStore.getState().updateSettings({ seriousMode: false });
    useAppStore.setState({ activeTurn: null });
    await session.send("same voice");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["turn/start"]);
  });

  it("does not send with the old persona if applying the new mode fails", async () => {
    const rpc = mockRpc();
    const session = new CodexSession();
    await session.send("hello");
    rpc.mockClear();
    useAppStore.getState().updateSettings({ seriousMode: true });
    rpc.mockRejectedValueOnce(new Error("Reconnect needed"));
    await expect(session.send("plain answer")).rejects.toThrow("Reconnect needed");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume"]);
    expect(useAppStore.getState().threadLoading).toBe(false);
  });

  it.each([false, true])("applies and removes the build theme in an existing thread with serious mode %s", async (seriousMode) => {
    const rpc = mockRpc();
    const session = new CodexSession();
    useAppStore.getState().updateSettings({ seriousMode });
    await session.send("hello");
    rpc.mockClear();

    useAppStore.getState().updateSettings({ mommyBuilding: true });
    expect(useAppStore.getState().settings.seriousMode).toBe(seriousMode);
    expect(rpc).not.toHaveBeenCalled();
    await session.send("build a game");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items", "turn/start"]);
    const enabled = (rpc.mock.calls[0][1] as { developerInstructions: string }).developerInstructions;
    expect(enabled).toContain("# Mommy building: ON");
    expect(enabled).toContain("real, playable mechanics");
    expect(enabled).toContain("user-facing strings in project files");
    expect(enabled).toContain(seriousMode ? "plain, professional prose" : "maximum Mommy mode");
    expect(rpc.mock.calls[1][1]).toMatchObject({ items: [{ role: "developer", content: [{ type: "input_text", text: expect.stringContaining("# Mommy building: ON") }] }] });
    expect(rpc.mock.calls[2][1]).toMatchObject({ input: [{ type: "text", text: "build a game" }] });

    rpc.mockClear();
    useAppStore.getState().updateSettings({ mommyBuilding: false });
    await session.send("build another game");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items", "turn/start"]);
    const disabled = (rpc.mock.calls[0][1] as { developerInstructions: string }).developerInstructions;
    expect(disabled).toContain("# Mommy building: OFF");
    expect(disabled).not.toContain("# Mommy building: ON");
    expect(disabled).toContain("does not undo existing artwork or styling");
    expect(rpc.mock.calls[1][1]).toMatchObject({ items: [{ role: "developer", content: [{ text: expect.stringContaining("# Mommy building: OFF") }] }] });
  });

  it("includes the selected build preference when starting and reopening threads", async () => {
    const rpc = mockRpc();
    const session = new CodexSession();
    useAppStore.getState().updateSettings({ mommyBuilding: true });
    await session.newThread();
    await session.openThread(thread.id);
    const expected = buildPersonaInstructions({ mommyBuilding: true });
    for (const [, params] of rpc.mock.calls) {
      expect(params).toMatchObject({ developerInstructions: expected, sandbox: DEFAULT_SETTINGS.sandbox });
    }
  });

  it("retains the running task's theme for follow-ups and applies changes to the next task", async () => {
    const rpc = mockRpc();
    const session = new CodexSession();
    useAppStore.getState().updateSettings({ mommyBuilding: true });
    await session.send("build a game");
    rpc.mockClear();
    useAppStore.setState({ activeTurn: { threadId: thread.id, turnId: "running", status: "inProgress" } });
    useAppStore.getState().updateSettings({ mommyBuilding: false });
    rpc.mockResolvedValueOnce({ turnId: "running" });
    await session.send("add restart");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["turn/steer"]);
    rpc.mockClear();
    useAppStore.setState({ activeTurn: null });
    await session.send("build another game");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items", "turn/start"]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ developerInstructions: buildPersonaInstructions({ mommyBuilding: false }) });
  });

  it("defaults older settings to build mode off and remembers it independently from voice", () => {
    const values = new Map<string, string>([["mommycodex.settings.v1", JSON.stringify({ seriousMode: true, model: "chosen-model" })]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    try {
      expect(loadSettings()).toMatchObject({ mommyBuilding: false, seriousMode: true, model: "chosen-model" });
      saveSettings({ ...loadSettings(), mommyBuilding: true });
      expect(loadSettings()).toMatchObject({ mommyBuilding: true, seriousMode: true, model: "chosen-model" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retries a rejected instruction update before allowing the next message", async () => {
    const rpc = mockRpc();
    const session = new CodexSession();
    await session.send("hello");
    useAppStore.getState().updateSettings({ mommyBuilding: true });
    rpc.mockClear();
    rpc.mockResolvedValueOnce({ thread }).mockRejectedValueOnce(new Error("Could not update instructions"));
    await expect(session.send("build a game")).rejects.toThrow("Could not update instructions");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items"]);
    expect(useAppStore.getState().submissionPending).toBe(false);
    rpc.mockClear();
    await session.send("build a game");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items", "turn/start"]);
  });

  it("defers instruction updates when reopening a running conversation", async () => {
    const rpc = mockRpc();
    const session = new CodexSession();
    useAppStore.getState().updateSettings({ mommyBuilding: true });
    rpc.mockResolvedValueOnce({ thread: { ...thread, turns: [{ id: "running", status: "inProgress", items: [] }] } });
    await session.openThread(thread.id);
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume"]);
    expect(useAppStore.getState().activeTurn?.turnId).toBe("running");
    useAppStore.setState({ activeTurn: null });
    rpc.mockClear();
    await session.send("next task");
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["thread/resume", "thread/inject_items", "turn/start"]);
  });
});

it('allows explicitly requested styled Markdown while keeping technical tokens exact',()=>{
 const prompt=buildPersonaInstructions({character:'mommy'});
 expect(prompt).toContain('/mommy-md');expect(prompt).toContain('exception to the prose-only default');
 expect(prompt).toContain('Keep all technical tokens exact');expect(prompt).toContain('affectionate stutters');
});
