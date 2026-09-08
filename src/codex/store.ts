/**
 * Single Zustand store for the whole UI. `applyNotification` is the reducer
 * for server notifications; it is synchronous and pure enough to be replayed
 * in tests.
 */
import { create } from "zustand";
import type {
  Model,
  RequestId,
  Thread,
  ThreadItem,
  ThreadStatus,
  Turn,
  TurnStatus,
  UserInput,
  TurnPlanStep,
  ThreadTokenUsage,
} from "../protocol";
import { loadSettings, saveSettings, type Settings } from "../settings";
import type { LaunchInfo } from "./transport";

export type Mood = "idle" | "thinking" | "working" | "happy" | "pouty";

export type Connection =
  | { state: "starting"; message: string }
  | { state: "ready"; binary: string }
  | { state: "crashed"; message: string; stderrTail: string[] }
  | { state: "error"; message: string };

export interface ThreadMeta {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  model: string | null;
  status: ThreadStatus | null;
}

export interface ItemState {
  key: string;
  threadId: string;
  turnId: string | null;
  item: ThreadItem;
  /** Streaming agent text (deltas), authoritative `item.text` once completed. */
  liveText: string;
  /** Streaming command output. */
  liveOutput: string;
  /** Streaming reasoning summaries, by summary index. */
  liveSummary: string[];
  done: boolean;
  failed: boolean;
  startedAtMs: number | null;
  completedAtMs: number | null;
  /** Optimistic user message not yet echoed back by the server. */
  local?: boolean;
  clientId?: string | null;
}

export interface ServerRequestEnvelope {
  id: RequestId;
  method: string;
  params: unknown;
  receivedAt: number;
}

export interface Toast {
  id: number;
  kind: "error" | "warning" | "info";
  text: string;
}

export interface ActiveTurn {
  threadId: string;
  turnId: string;
  status: TurnStatus;
  /** Reviews forward inner task events but finish under the outer review id. */
  reviewRootTurnId?: string;
}

export interface TurnActivity {
  turnId: string;
  explanation: string | null;
  plan: TurnPlanStep[];
  diff: string;
}

export const WORKING_ITEM_TYPES = new Set<string>([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "webSearch",
  "collabAgentToolCall",
]);

export const HAPPY_MS = 4000;

export function itemKey(threadId: string, itemId: string): string {
  return `${threadId}/${itemId}`;
}

export function threadMetaFrom(t: Thread, previousPreview = ""): ThreadMeta {
  const firstMessage = t.turns?.flatMap((turn) => turn.items ?? []).find((item) => item.type === "userMessage");
  const firstText = firstMessage?.type === "userMessage" ? firstMessage.content.find((part) => part.type === "text")?.text : "";
  return {
    id: t.id,
    name: t.name ?? null,
    preview: t.preview || firstText || previousPreview,
    cwd: String(t.cwd ?? ""),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    model: t.model ?? null,
    status: t.status ?? null,
  };
}

function fromItem(
  threadId: string,
  turnId: string | null,
  item: ThreadItem,
  done: boolean,
  startedAtMs: number | null,
  completedAtMs: number | null,
): ItemState {
  const anyItem = item as { text?: string; aggregatedOutput?: string | null; summary?: string[]; status?: string; clientId?: string | null };
  return {
    key: itemKey(threadId, item.id),
    threadId,
    turnId,
    item,
    liveText: typeof anyItem.text === "string" ? anyItem.text : "",
    liveOutput: typeof anyItem.aggregatedOutput === "string" ? anyItem.aggregatedOutput : "",
    liveSummary: Array.isArray(anyItem.summary) ? [...anyItem.summary] : [],
    done,
    failed: anyItem.status === "failed" || anyItem.status === "declined",
    startedAtMs,
    completedAtMs,
    clientId: anyItem.clientId ?? null,
  };
}

let toastSeq = 1;
let moodTimer: ReturnType<typeof setTimeout> | null = null;

export interface AppState {
  connection: Connection;
  launch: LaunchInfo | null;
  cwd: string | null;
  models: Model[];
  threads: Record<string, ThreadMeta>;
  activeThreadId: string | null;
  threadLoading: boolean;
  itemsByThread: Record<string, string[]>;
  items: Record<string, ItemState>;
  activeTurn: ActiveTurn | null;
  submissionPending: boolean;
  activityByThread: Record<string, TurnActivity>;
  tokenUsageByThread: Record<string, ThreadTokenUsage>;
  lastTurnStatus: TurnStatus | null;
  transientMood: Mood | null;
  pendingRequests: ServerRequestEnvelope[];
  toasts: Toast[];
  stderr: string[];
  settings: Settings;
  showOriginal: Record<string, boolean>;

  switchCharacter: (character: Settings["character"]) => void;
  claimThread: (id: string) => void;
  setConnection: (c: Connection) => void;
  setLaunch: (l: LaunchInfo) => void;
  setCwd: (cwd: string | null) => void;
  setModels: (m: Model[]) => void;
  upsertThreads: (threads: Thread[]) => void;
  upsertThread: (thread: Thread) => void;
  removeThread: (threadId: string) => void;
  setActiveThread: (threadId: string | null) => void;
  setThreadLoading: (loading: boolean) => void;
  hydrateThread: (threadId: string, turns: Turn[]) => void;
  addLocalUserMessage: (threadId: string, clientId: string, input: string | UserInput[]) => string;
  markLocalFailed: (key: string) => void;
  applyNotification: (method: string, params: unknown) => void;
  enqueueRequest: (env: ServerRequestEnvelope) => void;
  removeRequest: (id: RequestId) => void;
  clearRequests: () => void;
  pushToast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
  pushStderr: (line: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleShowOriginal: (key: string) => void;
  setTransientMood: (mood: Mood | null) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = any;

export const useAppStore = create<AppState>()((set, get) => ({
  connection: { state: "starting", message: "Waking up Mommy-chan~" },
  launch: null,
  cwd: null,
  models: [],
  threads: {},
  activeThreadId: null,
  threadLoading: false,
  itemsByThread: {},
  items: {},
  activeTurn: null,
  submissionPending: false,
  activityByThread: {},
  tokenUsageByThread: {},
  lastTurnStatus: null,
  transientMood: null,
  pendingRequests: [],
  toasts: [],
  stderr: [],
  settings: loadSettings(),
  showOriginal: {},

  setConnection: (connection) => set({ connection }),
  setLaunch: (launch) => set({ launch }),
  setCwd: (cwd) => {
    set({ cwd });
    if (cwd) get().updateSettings({ lastCwd: cwd });
  },
  setModels: (models) => set({ models }),

  upsertThreads: (threads) =>
    set((s) => {
      const next = { ...s.threads };
      for (const t of threads) next[t.id] = threadMetaFrom(t, s.threads[t.id]?.preview);
      return { threads: next };
    }),
  upsertThread: (thread) =>
    set((s) => ({ threads: { ...s.threads, [thread.id]: threadMetaFrom(thread, s.threads[thread.id]?.preview) } })),
  removeThread: (threadId) =>
    set((s) => {
      const threads = { ...s.threads };
      delete threads[threadId];
      return {
        threads,
        activeThreadId: s.activeThreadId === threadId ? null : s.activeThreadId,
      };
    }),
  setActiveThread: (activeThreadId) =>
    set((s) => ({
      activeThreadId,
      itemsByThread:
        activeThreadId && !s.itemsByThread[activeThreadId]
          ? { ...s.itemsByThread, [activeThreadId]: [] }
          : s.itemsByThread,
    })),
  setThreadLoading: (threadLoading) => set({ threadLoading }),

  hydrateThread: (threadId, turns) =>
    set((s) => {
      const keys: string[] = [];
      const items = { ...s.items };
      for (const turn of turns) {
        for (const item of turn.items ?? []) {
          const st = fromItem(threadId, turn.id, item, true, null, null);
          items[st.key] = st;
          keys.push(st.key);
        }
      }
      return { items, itemsByThread: { ...s.itemsByThread, [threadId]: keys } };
    }),

  addLocalUserMessage: (threadId, clientId, input) => {
    const key = itemKey(threadId, `local-${clientId}`);
    set((s) => {
      const item: ThreadItem = {
        type: "userMessage",
        id: `local-${clientId}`,
        clientId,
        content: typeof input === "string" ? [{ type: "text", text: input, text_elements: [] }] : input,
      };
      const st: ItemState = {
        ...fromItem(threadId, null, item, true, Date.now(), null),
        local: true,
        clientId,
      };
      const thread = s.threads[threadId];
      const preview = typeof input === "string" ? input : input.find((part) => part.type === "text")?.text || "Image attachment";
      return {
        threads: thread ? { ...s.threads, [threadId]: { ...thread, preview: thread.preview || preview.slice(0, 240), updatedAt: Math.floor(Date.now() / 1000) } } : s.threads,
        items: { ...s.items, [key]: st },
        itemsByThread: {
          ...s.itemsByThread,
          [threadId]: [...(s.itemsByThread[threadId] ?? []), key],
        },
      };
    });
    return key;
  },
  markLocalFailed: (key) =>
    set((s) => {
      const it = s.items[key];
      if (!it) return {};
      return { items: { ...s.items, [key]: { ...it, failed: true, local: false } } };
    }),

  applyNotification: (method, rawParams) => {
    const params: AnyParams = rawParams ?? {};
    if ((method === "item/started" || method === "item/completed") && params.item?.type === "enteredReviewMode" && params.turnId) {
      set({ activeTurn: { threadId: params.threadId, turnId: params.turnId, status: "inProgress", reviewRootTurnId: params.turnId } });
    }
    switch (method) {
      case "thread/started": {
        if (params.thread) get().upsertThread(params.thread as Thread);
        return;
      }
      case "thread/status/changed": {
        set((s) => {
          const t = s.threads[params.threadId];
          if (!t) return {};
          return { threads: { ...s.threads, [t.id]: { ...t, status: params.status } } };
        });
        return;
      }
      case "thread/name/updated": {
        set((s) => {
          const t = s.threads[params.threadId];
          if (!t) return {};
          const name = params.threadName ?? params.name ?? null;
          return { threads: { ...s.threads, [t.id]: { ...t, name } } };
        });
        return;
      }
      case "thread/archived":
      case "thread/deleted": {
        if (params.threadId) get().removeThread(params.threadId);
        return;
      }
      case "turn/started": {
        const turn = params.turn as Turn;
        set((s) => ({
          activeTurn: { threadId: params.threadId, turnId: turn.id, status: turn.status,
            ...(s.activeTurn && s.activeTurn.threadId === params.threadId && s.activeTurn.reviewRootTurnId ? { reviewRootTurnId: s.activeTurn.reviewRootTurnId } : {}),
          },
          transientMood: null,
          activityByThread: { ...s.activityByThread, [params.threadId]: s.activityByThread[params.threadId]?.turnId === turn.id
            ? s.activityByThread[params.threadId]
            : { turnId: turn.id, explanation: null, plan: [], diff: "" } },
        }));
        return;
      }
      case "turn/plan/updated":
      case "turn/diff/updated": {
        set((s) => {
          const previous = s.activityByThread[params.threadId];
          const activity = previous?.turnId === params.turnId ? previous : { turnId: params.turnId, explanation: null, plan: [], diff: "" };
          return { activityByThread: { ...s.activityByThread, [params.threadId]: {
            ...activity,
            ...(method === "turn/plan/updated" ? { plan: params.plan ?? [], explanation: params.explanation ?? null } : { diff: params.diff ?? "" }),
          } } };
        });
        return;
      }
      case "thread/tokenUsage/updated": {
        set((s) => ({ tokenUsageByThread: { ...s.tokenUsageByThread, [params.threadId]: params.tokenUsage } }));
        return;
      }
      case "turn/completed": {
        const turn = params.turn as Turn;
        const running = get().activeTurn;
        if (running && running.threadId === params.threadId && running.reviewRootTurnId && running.reviewRootTurnId !== turn.id) return;
        const status = turn.status;
        const mood: Mood = status === "completed" ? "happy" : "pouty";
        set((s) => ({
          activeTurn:
            s.activeTurn && s.activeTurn.threadId === params.threadId && (s.activeTurn.reviewRootTurnId ?? s.activeTurn.turnId) === turn.id ? null : s.activeTurn,
          lastTurnStatus: status,
          items: Object.fromEntries(Object.entries(s.items).map(([key, item]) => [key,
            item.threadId === params.threadId && (item.turnId === turn.id || (s.activeTurn?.reviewRootTurnId === turn.id && item.turnId === s.activeTurn.turnId)) && !item.done
              ? { ...item, done: true, completedAtMs: Date.now() }
              : item,
          ])),
        }));
        get().setTransientMood(mood);
        if (turn.error?.message && status === "failed") {
          get().pushToast("error", turn.error.message);
        }
        return;
      }
      case "item/started": {
        const item = params.item as ThreadItem;
        const threadId: string = params.threadId;
        set((s) => {
          const key = itemKey(threadId, item.id);
          const existing = s.items[key];
          const st: ItemState = existing
            ? { ...existing, item, turnId: params.turnId ?? existing.turnId, startedAtMs: params.startedAtMs ?? existing.startedAtMs }
            : fromItem(threadId, params.turnId ?? null, item, false, params.startedAtMs ?? null, null);
          const list = [...(s.itemsByThread[threadId] ?? [])];
          const items = { ...s.items, [key]: st };
          // Replace the optimistic local echo of this user message, if any.
          const clientId = (item as { clientId?: string | null }).clientId;
          if (item.type === "userMessage" && clientId) {
            const localKey = itemKey(threadId, `local-${clientId}`);
            const idx = list.indexOf(localKey);
            if (idx >= 0) {
              list.splice(idx, 1, key);
              delete items[localKey];
            } else if (!list.includes(key)) {
              list.push(key);
            }
          } else if (!list.includes(key)) {
            list.push(key);
          }
          return { items, itemsByThread: { ...s.itemsByThread, [threadId]: list } };
        });
        return;
      }
      case "item/completed": {
        const item = params.item as ThreadItem;
        const threadId: string = params.threadId;
        set((s) => {
          const key = itemKey(threadId, item.id);
          const existing = s.items[key];
          const fresh = fromItem(threadId, params.turnId ?? existing?.turnId ?? null, item, true, existing?.startedAtMs ?? null, params.completedAtMs ?? null);
          // Keep streamed text if the completed item somehow carries less.
          if (existing && item.type === "agentMessage" && fresh.liveText.length < existing.liveText.length) {
            fresh.liveText = existing.liveText;
          }
          if (existing && item.type === "commandExecution" && !fresh.liveOutput) {
            fresh.liveOutput = existing.liveOutput;
          }
          if (existing && item.type === "reasoning" && fresh.liveSummary.length === 0) {
            fresh.liveSummary = existing.liveSummary;
          }
          const list = [...(s.itemsByThread[threadId] ?? [])];
          if (!list.includes(key)) list.push(key);
          return { items: { ...s.items, [key]: fresh }, itemsByThread: { ...s.itemsByThread, [threadId]: list } };
        });
        return;
      }
      case "item/agentMessage/delta": {
        appendLive(set, params.threadId, params.turnId, params.itemId, "agentMessage", (st) => ({
          ...st,
          liveText: st.liveText + (params.delta ?? ""),
        }));
        return;
      }
      case "item/plan/delta": {
        appendLive(set, params.threadId, params.turnId, params.itemId, "plan", (st) => ({
          ...st,
          liveText: st.liveText + (params.delta ?? ""),
        }));
        return;
      }
      case "item/commandExecution/outputDelta": {
        appendLive(set, params.threadId, params.turnId, params.itemId, "commandExecution", (st) => ({
          ...st,
          liveOutput: st.liveOutput + (params.delta ?? ""),
        }));
        return;
      }
      case "item/reasoning/summaryTextDelta": {
        const idx: number = params.summaryIndex ?? 0;
        appendLive(set, params.threadId, params.turnId, params.itemId, "reasoning", (st) => {
          const liveSummary = [...st.liveSummary];
          while (liveSummary.length <= idx) liveSummary.push("");
          liveSummary[idx] += params.delta ?? "";
          return { ...st, liveSummary };
        });
        return;
      }
      case "item/fileChange/patchUpdated": {
        if (!Array.isArray(params.changes)) return;
        set((s) => {
          const key = itemKey(params.threadId, params.itemId);
          const st = s.items[key];
          if (!st || st.item.type !== "fileChange") return {};
          return { items: { ...s.items, [key]: { ...st, item: { ...st.item, changes: params.changes } } } };
        });
        return;
      }
      case "serverRequest/resolved": {
        if (params.requestId !== undefined) get().removeRequest(params.requestId);
        return;
      }
      case "error": {
        const message: string = params.error?.message ?? "Unknown error";
        get().pushToast(params.willRetry ? "warning" : "error", params.willRetry ? `${message} (retrying)` : message);
        if (!params.willRetry) get().setTransientMood("pouty");
        return;
      }
      case "warning":
      case "configWarning":
      case "guardianWarning":
      case "deprecationNotice": {
        const text = params.message ?? params.summary ?? params.details ?? JSON.stringify(params);
        get().pushToast("warning", String(text));
        return;
      }
      default:
        return;
    }
  },

  enqueueRequest: (env) => set((s) => ({ pendingRequests: [...s.pendingRequests, env] })),
  removeRequest: (id) =>
    set((s) => ({ pendingRequests: s.pendingRequests.filter((r) => String(r.id) !== String(id)) })),
  clearRequests: () => set({ pendingRequests: [] }),

  pushToast: (kind, text) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-5) }));
    setTimeout(() => get().dismissToast(id), kind === "error" ? 12000 : 6000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  pushStderr: (line) => set((s) => ({ stderr: [...s.stderr, line].slice(-300) })),

  claimThread: (id) => get().updateSettings({ threadCharacters: { ...get().settings.threadCharacters, [id]: get().settings.character } }),
  switchCharacter: (character) => {
    const s = get();
    if (s.activeTurn || s.submissionPending || s.threadLoading || character === s.settings.character) return;
    const { seriousMode, mommyBuilding, ttsAutoRead, ttsSpeed, ttsFishModel, reactionVoice, companionNotes } = s.settings;
    const companionPreferences = { ...s.settings.companionPreferences, [s.settings.character]: { seriousMode, mommyBuilding, ttsAutoRead, ttsSpeed, ttsFishModel, reactionVoice, companionNotes } };
    const next = companionPreferences[character] ?? { seriousMode: false, mommyBuilding: false, ttsAutoRead: false, ttsSpeed: 1, ttsFishModel, reactionVoice: false, companionNotes: "" };
    get().updateSettings({ ...next, character, companionPreferences, lastCompanionThread: {...s.settings.lastCompanionThread, ...(s.activeThreadId ? {[s.settings.character]:s.activeThreadId} : {})} });
    set({ activeThreadId: null, transientMood: null });
  },
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
  },
  toggleShowOriginal: (key) =>
    set((s) => ({ showOriginal: { ...s.showOriginal, [key]: !s.showOriginal[key] } })),

  setTransientMood: (mood) => {
    if (moodTimer) {
      clearTimeout(moodTimer);
      moodTimer = null;
    }
    set({ transientMood: mood });
    if (mood) {
      moodTimer = setTimeout(() => {
        moodTimer = null;
        set({ transientMood: null });
      }, HAPPY_MS);
    }
  },
}));

type SetFn = (fn: (s: AppState) => Partial<AppState>) => void;

function appendLive(
  set: SetFn,
  threadId: string,
  turnId: string | null,
  itemId: string,
  placeholderType: "agentMessage" | "commandExecution" | "reasoning" | "plan",
  update: (st: ItemState) => ItemState,
) {
  set((s) => {
    const key = itemKey(threadId, itemId);
    let st = s.items[key];
    let list = s.itemsByThread[threadId] ?? [];
    if (!st) {
      // We missed item/started (e.g. reconnect): create a placeholder.
      const placeholder = makePlaceholder(placeholderType, itemId);
      st = fromItem(threadId, turnId, placeholder, false, Date.now(), null);
      list = [...list, key];
    }
    return {
      items: { ...s.items, [key]: update(st) },
      itemsByThread: list === s.itemsByThread[threadId] ? s.itemsByThread : { ...s.itemsByThread, [threadId]: list },
    };
  });
}

function makePlaceholder(type: "agentMessage" | "commandExecution" | "reasoning" | "plan", id: string): ThreadItem {
  switch (type) {
    case "agentMessage":
      return { type: "agentMessage", id, text: "", phase: null, memoryCitation: null, delivery: null, questions: null };
    case "plan":
      return { type: "plan", id, text: "" };
    case "reasoning":
      return { type: "reasoning", id, summary: [], content: [] };
    case "commandExecution":
      return {
        type: "commandExecution",
        id,
        pluginId: null,
        scriptPath: null,
        command: "",
        cwd: "",
        processId: null,
        source: "agent" as never,
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null,
      };
  }
}

/** Derive the mascot mood from state. */
export function selectMood(s: AppState): Mood {
  if (s.connection.state === "crashed" || s.connection.state === "error") return "pouty";
  if (s.connection.state === "starting" || s.threadLoading || (s.submissionPending && !s.activeTurn)) return "thinking";
  if (s.pendingRequests.length > 0) return "thinking";
  if (s.activeTurn) {
    const keys = s.itemsByThread[s.activeTurn.threadId] ?? [];
    for (let i = keys.length - 1; i >= 0; i--) {
      const it = s.items[keys[i]];
      if (it && it.turnId === s.activeTurn.turnId && !it.done && WORKING_ITEM_TYPES.has(it.item.type)) return "working";
    }
    return "thinking";
  }
  if (s.transientMood) return s.transientMood;
  return "idle";
}

export function selectActiveItems(s: AppState): ItemState[] {
  if (!s.activeThreadId) return [];
  const keys = s.itemsByThread[s.activeThreadId] ?? [];
  const out: ItemState[] = [];
  for (const k of keys) {
    const it = s.items[k];
    if (it) out.push(it);
  }
  return out;
}

export function selectSortedThreads(s: AppState): ThreadMeta[] {
  return Object.values(s.threads)
    .filter((t) => (s.settings.threadCharacters[t.id] ?? "mommy") === s.settings.character)
    .filter((t) => s.settings.listAllProjects || !s.cwd || t.cwd === s.cwd)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
