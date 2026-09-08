import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { CodexSession } from "./session";
import { itemKey, selectMood, selectSortedThreads, useAppStore } from "./store";
import * as transport from "./transport";
import { attachmentKind, FILE_PREFIX, MAX_IMAGE_BYTES, MAX_TEXT_BYTES, readAttachment } from "./attachments";

const thread = { id: "features", cwd: "/tmp/project", createdAt: 1, updatedAt: 1, preview: "", turns: [] };
const input = { type: "image" as const, url: "data:image/png;base64,aGVsbG8=" };
const running = { threadId: thread.id, turnId: "turn-1", status: "inProgress" as const };

beforeEach(() => {
  vi.restoreAllMocks();
  useAppStore.getState().setTransientMood(null);
  useAppStore.setState({ connection: { state: "ready", binary: "/bin/codex" }, settings: { ...DEFAULT_SETTINGS }, cwd: thread.cwd,
    models: [], threads: {}, activeThreadId: thread.id, items: {}, itemsByThread: {}, activeTurn: null, threadLoading: false,
    submissionPending: false, activityByThread: {}, tokenUsageByThread: {}, pendingRequests: [], transientMood: null, toasts: [],
  });
});
afterEach(() => useAppStore.getState().setTransientMood(null));

describe("Codex message and review actions", () => {
  it("sends image-only messages and replaces the optimistic attachment without duplicating it", async () => {
    const rpc = vi.spyOn(transport, "rpc").mockImplementation(async (method) => method === "thread/resume" ? { thread } as never : { turn: null } as never);
    await new CodexSession().send("", [input]);
    const params = rpc.mock.calls.find(([method]) => method === "turn/start")![1] as { input: unknown[]; clientUserMessageId: string };
    expect(params.input).toEqual([input]);
    const local = Object.values(useAppStore.getState().items)[0];
    expect(local.item).toMatchObject({ content: [input] });
    useAppStore.getState().applyNotification("item/started", { threadId: thread.id, turnId: "turn-1", item: { type: "userMessage", id: "echo", clientId: params.clientUserMessageId, content: [input] } });
    expect(useAppStore.getState().itemsByThread[thread.id]).toEqual([itemKey(thread.id, "echo")]);
    expect(useAppStore.getState().items[local.key]).toBeUndefined();
  });

  it("steers the exact running turn without reapplying a changed persona", async () => {
    const rpc = vi.spyOn(transport, "rpc").mockResolvedValue({ turnId: running.turnId });
    useAppStore.setState({ activeTurn: running, settings: { ...DEFAULT_SETTINGS, seriousMode: true } });
    await new CodexSession().send("Use blue instead", [input]);
    expect(rpc.mock.calls.map(([method]) => method)).toEqual(["turn/steer"]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ threadId: thread.id, expectedTurnId: running.turnId, input: [{ type: "text", text: "Use blue instead" }, input] });
    expect(useAppStore.getState().activeTurn).toEqual(running);
  });

  it("reports rejected follow-ups for draft recovery, keeping the running turn intact", async () => {
    vi.spyOn(transport, "rpc").mockRejectedValue(new Error("Turn already completed"));
    useAppStore.setState({ activeTurn: running });
    await expect(new CodexSession().send("Another detail", [input])).rejects.toThrow("Turn already completed");
    const state = useAppStore.getState();
    expect(Object.values(state.items)[0]).toMatchObject({ failed: true, local: false });
    expect(state.activeTurn).toEqual(running);
    expect(state.submissionPending).toBe(false);
  });

  it("blocks duplicate sends and messages to a different conversation while one is running", async () => {
    const rpc = vi.spyOn(transport, "rpc");
    useAppStore.setState({ activeTurn: { ...running, threadId: "other" } });
    await expect(new CodexSession().send("wrong thread")).rejects.toThrow("Open the running conversation");
    useAppStore.setState({ activeTurn: null, submissionPending: true });
    await expect(new CodexSession().send("duplicate")).rejects.toThrow("Please wait");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("starts an inline review of uncommitted changes and blocks review during another task", async () => {
    const rpc = vi.spyOn(transport, "rpc").mockImplementation(async (method) => method === "thread/resume" ? { thread } as never : { reviewThreadId: thread.id, turn: { id: "review", status: "inProgress" } } as never);
    const session = new CodexSession();
    await session.reviewChanges();
    expect(rpc.mock.calls[rpc.mock.calls.length - 1]).toEqual(["review/start", { threadId: thread.id, target: { type: "uncommittedChanges" }, delivery: "inline" }]);
    expect(useAppStore.getState().activeTurn?.turnId).toBe("review");
    rpc.mockClear();
    await expect(session.reviewChanges()).rejects.toThrow("Finish or stop");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not resurrect a turn when completion arrives before its start response", async () => {
    const session = new CodexSession();
    vi.spyOn(transport, "rpc").mockImplementation(async (method) => {
      if (method === "thread/resume") return { thread } as never;
      if (method === "thread/list") return { data: [] } as never;
      if (method === "thread/inject_items") return {} as never;
      session.dispatch({ type: "notification", method: "turn/completed", params: { threadId: thread.id, turn: { id: running.turnId, status: "completed" } } });
      return { turn: { id: running.turnId, status: "inProgress" } } as never;
    });
    await session.send("hello");
    expect(useAppStore.getState().activeTurn).toBeNull();
    expect(selectMood(useAppStore.getState())).toBe("happy");
  });
});

describe("Live task details", () => {
  it("keeps a review active across inner events, then finishes using its outer turn id", () => {
    const notify = useAppStore.getState().applyNotification;
    notify("item/started", { threadId: thread.id, turnId: "review-root", item: { type: "enteredReviewMode", id: "review-entry", review: "uncommitted changes" } });
    notify("turn/started", { threadId: thread.id, turn: { id: "review-inner", status: "inProgress" } });
    expect(useAppStore.getState().activeTurn).toMatchObject({ turnId: "review-inner", reviewRootTurnId: "review-root" });
    notify("turn/completed", { threadId: thread.id, turn: { id: "review-inner", status: "completed" } });
    expect(useAppStore.getState().activeTurn).not.toBeNull();
    notify("turn/completed", { threadId: thread.id, turn: { id: "review-root", status: "completed" } });
    expect(useAppStore.getState().activeTurn).toBeNull();
    expect(selectMood(useAppStore.getState())).toBe("happy");
  });

  it("keeps plans, diffs, and usage with their conversation and resets activity for a new turn", () => {
    const notify = useAppStore.getState().applyNotification;
    const plan = [{ step: "Inspect", status: "completed" }, { step: "Fix", status: "inProgress" }];
    notify("turn/plan/updated", { threadId: thread.id, turnId: running.turnId, explanation: "Found the issue", plan });
    notify("turn/diff/updated", { threadId: thread.id, turnId: running.turnId, diff: "-old\n+new" });
    notify("turn/plan/updated", { threadId: "other", turnId: "other-turn", plan: [{ step: "Other work", status: "pending" }] });
    notify("thread/tokenUsage/updated", { threadId: thread.id, tokenUsage: { last: { totalTokens: 42 }, total: { totalTokens: 84 } } });
    expect(useAppStore.getState().activityByThread[thread.id]).toMatchObject({ plan, diff: "-old\n+new" });
    expect(useAppStore.getState().tokenUsageByThread[thread.id].last.totalTokens).toBe(42);
    notify("turn/started", { threadId: thread.id, turn: { id: "turn-2", status: "inProgress" } });
    expect(useAppStore.getState().activityByThread[thread.id]).toEqual({ turnId: "turn-2", plan: [], explanation: null, diff: "" });
    expect(useAppStore.getState().activityByThread.other.plan[0].step).toBe("Other work");
  });

  it("does not carry a stopped tool's working state into the next turn", () => {
    const notify = useAppStore.getState().applyNotification;
    notify("turn/started", { threadId: thread.id, turn: { id: running.turnId, status: "inProgress" } });
    notify("item/started", { threadId: thread.id, turnId: running.turnId, item: { id: "sleep", type: "commandExecution", status: "inProgress" } });
    notify("turn/completed", { threadId: thread.id, turn: { id: running.turnId, status: "interrupted" } });
    expect(useAppStore.getState().items[itemKey(thread.id, "sleep")].done).toBe(true);
    notify("turn/started", { threadId: thread.id, turn: { id: "next", status: "inProgress" } });
    expect(selectMood(useAppStore.getState())).toBe("thinking");
  });

  it("keeps the conversation list scoped to the selected project", () => {
    useAppStore.getState().upsertThreads([thread, { ...thread, id: "other", cwd: "/tmp/elsewhere" }] as never);
    expect(selectSortedThreads(useAppStore.getState()).map((t) => t.id)).toEqual([thread.id]);
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, listAllProjects: true } });
    expect(selectSortedThreads(useAppStore.getState())).toHaveLength(2);
  });

  it("makes a new conversation searchable immediately and preserves its preview across sparse metadata updates", () => {
    useAppStore.getState().upsertThread(thread as never);
    useAppStore.getState().addLocalUserMessage(thread.id, "first", "Help me fix the shopping cart");
    useAppStore.getState().upsertThreads([thread] as never);
    expect(selectSortedThreads(useAppStore.getState())[0].preview).toBe("Help me fix the shopping cart");
  });
});

describe("Attachments", () => {
  it("preserves code file contents exactly", async () => {
    const code = 'const greeting = "Hello, world!";\n';
    const attachment = await readAttachment(new File([code], "hello.ts", { type: "text/plain" }));
    expect(attachment.input).toEqual({ type: "text", text: `${FILE_PREFIX}hello.ts\n\n${code}`, text_elements: [] });
  });
  it("rejects unsupported and oversized files before loading them", () => {
    expect(() => attachmentKind({ name: "large.png", type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toThrow("8 MB");
    expect(() => attachmentKind({ name: "large.ts", type: "text/plain", size: MAX_TEXT_BYTES + 1 })).toThrow("256 KB");
    expect(() => attachmentKind({ name: "archive.zip", type: "application/zip", size: 10 })).toThrow("choose a");
    expect(attachmentKind({ name: "photo.PNG", type: "", size: 100 })).toBe("image");
  });
  it("does not send binary contents disguised as text", async () => {
    await expect(readAttachment(new File(["abc\0def"], "fake.txt"))).rejects.toThrow("binary file");
  });
});
