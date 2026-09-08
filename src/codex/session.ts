import { btw } from './btw';
/**
 * Owns the Codex protocol conversation: boot handshake, threads, turns,
 * approvals routing, delta batching and crash recovery. UI components only
 * call methods on the exported `session` singleton and read the store.
 */
import type { SessionExtensions } from "../harness/extensions";
import type { DynamicToolCallParams } from "../protocol";
import { buildPersonaInstructions } from "../persona";
import { speech } from "../speech/controller";
import type {
  BridgeMessage,
  InitializeParams,
  Model,
  ModelListResponse,
  RequestId,
  ThreadListResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadInjectItemsParams,
  ThreadStartParams,
  ThreadStartResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  ReviewStartParams,
  ReviewStartResponse,
  UserInput,
  Turn,
} from "../protocol";
import { routeServerRequest } from "./approvals";
import { useAppStore } from "./store";
import * as transport from "./transport";
import { errorMessage } from "./transport";

const DELTA_METHODS = new Set([
  "item/agentMessage/delta",
  "item/commandExecution/outputDelta",
  "item/reasoning/summaryTextDelta",
  "item/plan/delta",
]);

const OPT_OUT_NOTIFICATIONS = [
  "item/reasoning/textDelta",
  "rawResponseItem/completed",
  "rawResponse/completed",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = any;

function scheduleFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
  else setTimeout(fn, 16);
}

export class CodexSession {
  extensions?: SessionExtensions;
  private deltaQueue = new Map<string, { method: string; params: AnyParams }>();
  private flushScheduled = false;
  private crashTimes: number[] = [];
  private stoppingByUs = false;
  private booting: Promise<void> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private appliedPersona = new Map<string, string>();
  private lastCompletedTurnId: string | null = null;

  private get store() {
    return useAppStore.getState();
  }

  // ---------------------------------------------------------------- boot

  boot(): Promise<void> {
    if (this.booting) return this.booting;
    this.booting = this.doBoot().finally(() => {
      this.booting = null;
    });
    return this.booting;
  }

  private async doBoot(): Promise<void> {
    const store = this.store;
    store.setConnection({ state: "starting", message: "Waking up Mommy-chan~" });
    try {
      const launch = await transport.getLaunchInfo();
      store.setLaunch(launch);
      if (!store.cwd) {
        const cwd = launch.initialCwd ?? store.settings.lastCwd ?? launch.home ?? null;
        store.setCwd(cwd);
      }

      const info = await transport.startBridge(
        { binaryOverride: store.settings.codexBinaryPath || null },
        (m) => this.dispatch(m),
      );

      if (!info.alreadyRunning) {
        const params: InitializeParams = {
          clientInfo: { name: "mommycodex", title: "MommyCodex", version: launch.appVersion },
          capabilities: {
            experimentalApi: !!this.extensions,
            requestAttestation: false,
            optOutNotificationMethods: OPT_OUT_NOTIFICATIONS,
          },
        };
        await transport.rpc("initialize", params);
        await transport.notify("initialized", {});
      }

      const models = await transport.rpc<ModelListResponse>("model/list", {});
      store.setModels(models.data ?? []);
      await this.refreshThreads();
      store.setConnection({ state: "ready", binary: info.binary });
    } catch (e) {
      store.setConnection({ state: "error", message: errorMessage(e) });
      throw e;
    }
  }

  async restart(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.stoppingByUs = true;
    try {
      await transport.stopBridge();
    } catch {
      // ignore: nothing was running
    } finally {
      this.stoppingByUs = false;
    }
    this.crashTimes = [];
    this.store.clearRequests();
    await this.boot();
    const active = this.store.activeThreadId;
    if (active && !active.startsWith("local")) {
      await this.openThread(active).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------- helpers

  currentModel(): Model | null {
    const { models, settings } = this.store;
    return (
      models.find((m) => m.model === settings.model || m.id === settings.model) ??
      models.find((m) => m.isDefault) ??
      models[0] ??
      null
    );
  }

  private threadOverrides(cwd = this.store.cwd ?? ""): Pick<
    ThreadStartParams,
    "model" | "approvalPolicy" | "approvalsReviewer" | "sandbox" | "developerInstructions" | "personality"
  > {
    const { settings } = this.store;
    const model = this.currentModel();
    const overrides: ReturnType<CodexSession["threadOverrides"]> = {
      approvalPolicy: "on-request",
      approvalsReviewer: settings.reviewer,
      sandbox: settings.sandbox,
      developerInstructions: this.currentInstructions(cwd),
    };
    if (settings.model) overrides.model = settings.model;
    if (model?.supportsPersonality) overrides.personality = settings.seriousMode ? "pragmatic" : "friendly";
    return overrides;
  }

  private currentInstructions(cwd = this.store.cwd ?? ""): string {
    const { settings } = this.store;
    return buildPersonaInstructions({ character: settings.character, serious: settings.seriousMode, mommyBuilding: settings.mommyBuilding }) + (this.extensions?.instructions(cwd) ?? "");
  }

  // ------------------------------------------------------------- threads

  async refreshThreads(): Promise<void> {
    const { cwd, settings } = this.store;
    const params: Record<string, unknown> = { limit: 60, sortKey: "updated_at" };
    if (!settings.listAllProjects && cwd) params.cwd = cwd;
    const res = await transport.rpc<ThreadListResponse>("thread/list", params);
    this.store.upsertThreads(res.data ?? []);
  }

  async setCwd(cwd: string): Promise<void> {
    this.store.setCwd(cwd);
    this.store.setActiveThread(null);
    await this.refreshThreads().catch((e) => this.store.pushToast("error", errorMessage(e)));
  }

  async switchCompanion(character: "mommy" | "nyx"): Promise<void> {
    if (this.store.activeTurn || this.store.submissionPending || this.store.threadLoading || this.store.settings.character === character) return;
    this.store.switchCharacter(character);
    const id = this.store.settings.lastCompanionThread[character];
    if (id && this.store.threads[id]?.cwd === this.store.cwd && (this.store.settings.threadCharacters[id] ?? "mommy") === character) await this.openThread(id);
  }

  async newThread(): Promise<string> {
    const store = this.store;
    const cwd = store.cwd;
    if (!cwd) throw new Error("Pick a project folder first, sweetie~");
    store.setThreadLoading(true);
    try {
      await this.extensions?.prepare(cwd);
      const overrides = this.threadOverrides();
      const params: ThreadStartParams & { dynamicTools?: SessionExtensions["tools"] } = {
        cwd,
        serviceName: "mommycodex",
        ...(this.extensions ? { dynamicTools: this.extensions.tools } : {}),
        ...overrides,
      };
      const res = await transport.rpc<ThreadStartResponse>("thread/start", params);
      this.appliedPersona.set(res.thread.id, overrides.developerInstructions ?? "");
      store.upsertThread(res.thread);
      store.claimThread(res.thread.id);
      store.setActiveThread(res.thread.id);
      return res.thread.id;
    } finally {
      store.setThreadLoading(false);
    }
  }

  async openThread(threadId: string): Promise<void> {
    const store = this.store;
    store.setThreadLoading(true);
    try {
      const cwd = store.threads[threadId]?.cwd ?? store.cwd;
      if (cwd) await this.extensions?.prepare(cwd);
      const overrides = this.threadOverrides(cwd ?? "");
      const params: ThreadResumeParams = { threadId, ...overrides };
      const res = await transport.rpc<ThreadResumeResponse>("thread/resume", params);
      store.upsertThread(res.thread);
      store.hydrateThread(threadId, res.thread.turns ?? []);
      if (res.thread.cwd) store.setCwd(res.thread.cwd);
      store.setActiveThread(threadId);
      const live = (res.thread.turns ?? []).find((t) => t.status === "inProgress");
      if (live) {
        useAppStore.setState({ activeTurn: { threadId, turnId: live.id, status: live.status } });
      } else {
        const instructions = overrides.developerInstructions ?? "";
        if (this.appliedPersona.get(threadId) !== instructions) {
          // Loaded threads can ignore developerInstructions on resume. Append the
          // current preferences explicitly, without creating a user message or turn.
          const update: ThreadInjectItemsParams = {
            threadId,
            items: [{ type: "message", role: "developer", content: [{
              type: "input_text",
              text: `Current MommyCodex app preferences. These replace any earlier app voice and build-theme preferences for subsequent tasks.\n\n${instructions}`,
            }] }],
          };
          await transport.rpc("thread/inject_items", update);
          this.appliedPersona.set(threadId, instructions);
        }
      }
    } finally {
      store.setThreadLoading(false);
    }
  }

  async renameThread(threadId: string, name: string): Promise<void> {
    await transport.rpc("thread/name/set", { threadId, name });
    const t = this.store.threads[threadId];
    if (t) useAppStore.setState((s) => ({ threads: { ...s.threads, [threadId]: { ...t, name } } }));
  }

  async archiveThread(threadId: string): Promise<void> {
    await transport.rpc("thread/archive", { threadId });
    this.store.removeThread(threadId);
  }

  // --------------------------------------------------------------- turns

  async send(text: string, attachments: UserInput[] = []): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed && !attachments.length) return;
    if (this.store.submissionPending || this.store.threadLoading) throw new Error("Please wait for the current request to finish.");
    if (this.store.activeTurn?.reviewRootTurnId) throw new Error("Finish or stop the review before sending a new message.");
    if (this.store.activeTurn && this.store.activeTurn.threadId !== this.store.activeThreadId) throw new Error("Open the running conversation to send a follow-up, or stop it first.");
    useAppStore.setState({ submissionPending: true });
    let key: string | null = null;
    let submittedThread: string | null = null;
    let isNewTask = false;
    try {
      if (this.store.cwd) await this.extensions?.prepare(this.store.cwd);
      let threadId = this.store.activeThreadId;
      if (!threadId) threadId = await this.newThread();
      submittedThread = threadId;
      const running = this.store.activeTurn;
      // Follow-ups keep the running turn's model, permissions, and persona.
      if (!running) {
        const persona = this.currentInstructions();
        if (this.appliedPersona.get(threadId) !== persona) await this.openThread(threadId);
      }
      const input: UserInput[] = [...(trimmed ? [{ type: "text" as const, text: trimmed, text_elements: [] }] : []), ...attachments];
      const clientId = crypto.randomUUID();
      key = this.store.addLocalUserMessage(threadId, clientId, input);
      if (running) {
        const params: TurnSteerParams = { threadId, expectedTurnId: running.turnId, clientUserMessageId: clientId, input };
        await transport.rpc("turn/steer", params);
        return;
      }
      const { settings } = this.store;
      const model = this.currentModel();
      const params: TurnStartParams = { threadId, clientUserMessageId: clientId, input };
      if (settings.effort) params.effort = settings.effort;
      if (settings.model) params.model = settings.model;
      if (model?.supportsPersonality) params.personality = settings.seriousMode ? "pragmatic" : "friendly";
      isNewTask = true;
      await this.extensions?.beforeTask(this.store.threads[threadId]?.cwd ?? this.store.cwd!, threadId, trimmed);
      const res = await transport.rpc<TurnStartResponse>("turn/start", params);
      if (res.turn?.status === "inProgress" && !this.store.activeTurn && this.lastCompletedTurnId !== res.turn.id) {
        useAppStore.setState({ activeTurn: { threadId, turnId: res.turn.id, status: res.turn.status } });
      }
    } catch (e) {
      if (key) this.store.markLocalFailed(key);
      if (isNewTask) await this.extensions?.failed(submittedThread, e);
      this.store.setTransientMood("pouty");
      throw e;
    } finally {
      useAppStore.setState({ submissionPending: false });
    }
  }

  async reviewChanges(): Promise<void> {
    if (this.store.activeTurn || this.store.submissionPending || this.store.threadLoading) throw new Error("Finish or stop the current task before starting a review.");
    useAppStore.setState({ submissionPending: true });
    try {
      const threadId = this.store.activeThreadId ?? await this.newThread();
      const persona = this.currentInstructions();
      if (this.appliedPersona.get(threadId) !== persona) await this.openThread(threadId);
      const params: ReviewStartParams = { threadId, target: { type: "uncommittedChanges" }, delivery: "inline" };
      const res = await transport.rpc<ReviewStartResponse>("review/start", params);
      if (res.turn.status === "inProgress" && this.lastCompletedTurnId !== res.turn.id) {
        const active = useAppStore.getState().activeTurn;
        useAppStore.setState({ activeTurn: {
          threadId: res.reviewThreadId,
          turnId: active?.threadId === res.reviewThreadId ? active.turnId : res.turn.id,
          status: res.turn.status,
          reviewRootTurnId: res.turn.id,
        } });
      }
    } finally {
      useAppStore.setState({ submissionPending: false });
    }
  }

  async interrupt(): Promise<void> {
    const turn = this.store.activeTurn;
    if (!turn) return;
    try {
      await transport.rpc("turn/interrupt", { threadId: turn.threadId, turnId: turn.reviewRootTurnId ?? turn.turnId });
    } catch (e) {
      this.store.pushToast("warning", errorMessage(e));
    }
  }

  // ----------------------------------------------------------- approvals

  async respondToRequest(id: RequestId, result: unknown): Promise<void> {
    try {
      await transport.respond(id, result);
    } catch (e) {
      this.store.pushToast("error", errorMessage(e));
    } finally {
      this.store.removeRequest(id);
    }
  }

  async rejectRequest(id: RequestId, message = "declined by user"): Promise<void> {
    try {
      await transport.respondError(id, -32000, message);
    } finally {
      this.store.removeRequest(id);
    }
  }

  // ------------------------------------------------------------ dispatch

  dispatch(msg: BridgeMessage): void {
    if (btw.handle(msg)) return;
    switch (msg.type) {
      case "notification": {
        if (msg.method === "turn/completed") this.lastCompletedTurnId = (msg.params as { turn: { id: string } }).turn.id;
        if (DELTA_METHODS.has(msg.method)) {
          this.queueDelta(msg.method, msg.params as AnyParams);
        } else {
          this.flushDeltas();
          this.store.applyNotification(msg.method, msg.params);
          if (msg.method === "turn/completed") {
            const { threadId, turn } = msg.params as { threadId: string; turn: Turn };
            speech.completed(threadId, turn);
            if (!this.store.activeTurn) void this.extensions?.completed(threadId, turn).catch(e => this.store.pushToast("error", errorMessage(e)));
            void this.refreshThreads().catch(() => undefined);
          }
        }
        return;
      }
      case "request": {
        this.flushDeltas();
        if (msg.method === "item/tool/call" && this.extensions) {
          void this.extensions.tool(msg.params as DynamicToolCallParams).then(result => transport.respond(msg.id, result)).catch(e => transport.respond(msg.id, { success: false, contentItems: [{ type: "inputText", text: errorMessage(e) }] }));
          return;
        }
        const route = routeServerRequest(msg.method);
        if (route.kind === "queue") {
          this.store.enqueueRequest({ id: msg.id, method: msg.method, params: msg.params, receivedAt: Date.now() });
        } else if (route.kind === "auto") {
          void transport.respond(msg.id, route.result);
        } else {
          void transport.respondError(msg.id, route.code, route.message);
        }
        return;
      }
      case "exited": {
        btw.disconnected();
        this.flushDeltas();
        this.deltaQueue.clear();
        this.store.clearRequests();
        this.extensions?.disconnected();
        useAppStore.setState({ activeTurn: null });
        if (this.stoppingByUs) return;
        const tail = msg.stderrTail ?? [];
        const reason = tail.length ? tail[tail.length - 1] : `exit code ${msg.code ?? "?"}`;
        this.store.setConnection({
          state: "crashed",
          message: `Codex app-server exited (${reason})`,
          stderrTail: tail,
        });
        this.scheduleRestart();
        return;
      }
      case "stderr":
      case "stdout":
        this.store.pushStderr(msg.line);
        return;
      case "orphanResponse":
        this.store.pushStderr(`[orphan response] ${JSON.stringify(msg.message)}`);
        return;
    }
  }

  private queueDelta(method: string, params: AnyParams): void {
    const key = `${method}|${params.threadId}|${params.itemId}|${params.summaryIndex ?? ""}`;
    const existing = this.deltaQueue.get(key);
    if (existing) {
      existing.params = { ...existing.params, delta: `${existing.params.delta ?? ""}${params.delta ?? ""}` };
    } else {
      this.deltaQueue.set(key, { method, params: { ...params } });
    }
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      scheduleFrame(() => {
        this.flushScheduled = false;
        this.flushDeltas();
      });
    }
  }

  flushDeltas(): void {
    if (this.deltaQueue.size === 0) return;
    const entries = [...this.deltaQueue.values()];
    this.deltaQueue.clear();
    const store = this.store;
    for (const { method, params } of entries) store.applyNotification(method, params);
  }

  private scheduleRestart(): void {
    const now = Date.now();
    this.crashTimes = this.crashTimes.filter((t) => now - t < 60_000);
    if (this.crashTimes.length >= 3) {
      this.store.setConnection({
        state: "error",
        message: "Codex crashed three times in a minute. Check the log and press Restart.",
      });
      return;
    }
    const delay = 1000 * 2 ** this.crashTimes.length;
    this.crashTimes.push(now);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      const active = this.store.activeThreadId;
      this.boot()
        .then(() => (active ? this.openThread(active) : undefined))
        .catch((e) => this.store.pushToast("error", errorMessage(e)));
    }, delay);
  }
}

export const session = new CodexSession();
