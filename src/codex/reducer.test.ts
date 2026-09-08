import { beforeEach, describe, expect, it } from "vitest";
import { itemKey, selectActiveItems, selectMood, useAppStore } from "./store";

const T = "thread-1";
const TURN = "turn-1";

function reset() {
  useAppStore.setState({
    connection: { state: "ready", binary: "/bin/codex" },
    threads: {},
    activeThreadId: T,
    itemsByThread: { [T]: [] },
    items: {},
    activeTurn: null,
    pendingRequests: [],
    toasts: [],
    transientMood: null,
    lastTurnStatus: null,
  });
}

describe("store reducer", () => {
  beforeEach(reset);

  it("replays a full turn with streamed text and command output", () => {
    const s = useAppStore.getState();
    const clientId = "c-1";
    const localKey = s.addLocalUserMessage(T, clientId, "hi mommy");
    expect(selectActiveItems(useAppStore.getState()).map((i) => i.key)).toEqual([localKey]);

    s.applyNotification("turn/started", { threadId: T, turn: { id: TURN, status: "inProgress", items: [], error: null } });
    expect(selectMood(useAppStore.getState())).toBe("thinking");

    // The server echoes the user message; it must replace the local one in place.
    s.applyNotification("item/started", {
      threadId: T, turnId: TURN, startedAtMs: 1,
      item: { type: "userMessage", id: "u1", clientId, content: [{ type: "text", text: "hi mommy", text_elements: [] }] },
    });
    let keys = selectActiveItems(useAppStore.getState()).map((i) => i.key);
    expect(keys).toEqual([itemKey(T, "u1")]);

    s.applyNotification("item/started", {
      threadId: T, turnId: TURN, startedAtMs: 2,
      item: { type: "agentMessage", id: "a1", text: "", phase: null, memoryCitation: null, delivery: null, questions: null },
    });
    s.applyNotification("item/agentMessage/delta", { threadId: T, turnId: TURN, itemId: "a1", delta: "Hewwo " });
    s.applyNotification("item/agentMessage/delta", { threadId: T, turnId: TURN, itemId: "a1", delta: "sweetie~" });
    expect(useAppStore.getState().items[itemKey(T, "a1")].liveText).toBe("Hewwo sweetie~");

    s.applyNotification("item/started", {
      threadId: T, turnId: TURN, startedAtMs: 3,
      item: {
        type: "commandExecution", id: "c1", pluginId: null, scriptPath: null, command: "ls", cwd: "/tmp",
        processId: null, source: "agent", status: "inProgress", commandActions: [], aggregatedOutput: null, exitCode: null, durationMs: null,
      },
    });
    expect(selectMood(useAppStore.getState())).toBe("working");
    s.applyNotification("item/commandExecution/outputDelta", { threadId: T, turnId: TURN, itemId: "c1", delta: "a.txt\n" });
    s.applyNotification("item/commandExecution/outputDelta", { threadId: T, turnId: TURN, itemId: "c1", delta: "b.txt\n" });
    s.applyNotification("item/completed", {
      threadId: T, turnId: TURN, completedAtMs: 4,
      item: {
        type: "commandExecution", id: "c1", pluginId: null, scriptPath: null, command: "ls", cwd: "/tmp",
        processId: null, source: "agent", status: "completed", commandActions: [], aggregatedOutput: "a.txt\nb.txt\n", exitCode: 0, durationMs: 5,
      },
    });
    const cmd = useAppStore.getState().items[itemKey(T, "c1")];
    expect(cmd.done).toBe(true);
    expect(cmd.liveOutput).toBe("a.txt\nb.txt\n");
    expect(selectMood(useAppStore.getState())).toBe("thinking");

    s.applyNotification("item/completed", {
      threadId: T, turnId: TURN, completedAtMs: 5,
      item: { type: "agentMessage", id: "a1", text: "Hewwo sweetie~ done!", phase: null, memoryCitation: null, delivery: null, questions: null },
    });
    expect(useAppStore.getState().items[itemKey(T, "a1")].liveText).toBe("Hewwo sweetie~ done!");

    s.applyNotification("turn/completed", { threadId: T, turn: { id: TURN, status: "completed", items: [], error: null } });
    const after = useAppStore.getState();
    expect(after.activeTurn).toBeNull();
    expect(selectMood(after)).toBe("happy");
    keys = selectActiveItems(after).map((i) => i.key);
    expect(keys).toEqual([itemKey(T, "u1"), itemKey(T, "a1"), itemKey(T, "c1")]);
  });

  it("creates a placeholder when a delta arrives before item/started", () => {
    const s = useAppStore.getState();
    s.applyNotification("item/agentMessage/delta", { threadId: T, turnId: TURN, itemId: "ghost", delta: "boo" });
    const it = useAppStore.getState().items[itemKey(T, "ghost")];
    expect(it.item.type).toBe("agentMessage");
    expect(it.liveText).toBe("boo");
    expect(selectActiveItems(useAppStore.getState()).map((i) => i.key)).toEqual([itemKey(T, "ghost")]);
  });

  it("goes pouty on failed turns and removes resolved requests", () => {
    const s = useAppStore.getState();
    s.enqueueRequest({ id: 7, method: "item/commandExecution/requestApproval", params: {}, receivedAt: 0 });
    expect(selectMood(useAppStore.getState())).toBe("thinking");
    s.applyNotification("serverRequest/resolved", { threadId: T, requestId: 7 });
    expect(useAppStore.getState().pendingRequests).toHaveLength(0);

    s.applyNotification("turn/started", { threadId: T, turn: { id: TURN, status: "inProgress", items: [], error: null } });
    s.applyNotification("turn/completed", { threadId: T, turn: { id: TURN, status: "failed", items: [], error: { message: "boom", codexErrorInfo: null, additionalDetails: null, misalignment: null } } });
    const st = useAppStore.getState();
    expect(selectMood(st)).toBe("pouty");
    expect(st.toasts.some((t) => t.text === "boom")).toBe(true);
  });

  it("accumulates reasoning summaries by index", () => {
    const s = useAppStore.getState();
    s.applyNotification("item/started", { threadId: T, turnId: TURN, startedAtMs: 1, item: { type: "reasoning", id: "r1", summary: [], content: [] } });
    s.applyNotification("item/reasoning/summaryTextDelta", { threadId: T, turnId: TURN, itemId: "r1", delta: "Think", summaryIndex: 0 });
    s.applyNotification("item/reasoning/summaryTextDelta", { threadId: T, turnId: TURN, itemId: "r1", delta: "ing", summaryIndex: 0 });
    s.applyNotification("item/reasoning/summaryTextDelta", { threadId: T, turnId: TURN, itemId: "r1", delta: "Next", summaryIndex: 1 });
    expect(useAppStore.getState().items[itemKey(T, "r1")].liveSummary).toEqual(["Thinking", "Next"]);
  });
});
