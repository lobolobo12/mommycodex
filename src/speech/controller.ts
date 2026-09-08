import { create } from "zustand";
import { useAppStore } from "../codex/store";
import { errorMessage, speakText, stopSpeech } from "../codex/transport";
import type { Turn } from "../protocol";
import { speechText } from "./text";

type SpeechSource = "manual" | "auto" | "preview" | "reaction";
export const useSpeechStore = create<{ activeKey: string | null; source: SpeechSource | null; status: "loading" | "playing" | null }>(() => ({ activeKey: null, source: null, status: null }));

export class SpeechController {
  private latest = 0;
  private seen = new Set<string>();
  private nextId(): number { return this.latest = Math.max(Date.now(), this.latest + 1); }

  async play(key: string, markdown: string, source: SpeechSource = "manual"): Promise<void> {
    const text = speechText(markdown);
    if (!text) return;
    const id = this.nextId();
    const { ttsSpeed, ttsFishModel, character } = useAppStore.getState().settings;
    useSpeechStore.setState({ activeKey: key, source, status: "loading" });
    try {
      await speakText(id, text, ttsSpeed, ttsFishModel, () => {
        if (id === this.latest) useSpeechStore.setState({ status: "playing" });
      }, character);
    } catch (error) {
      if (id === this.latest) useAppStore.getState().pushToast("error", `Read aloud: ${errorMessage(error)}`);
    } finally {
      if (id === this.latest) useSpeechStore.setState({ activeKey: null, source: null, status: null });
    }
  }

  async stop(): Promise<void> {
    const id = this.nextId();
    useSpeechStore.setState({ activeKey: null, source: null, status: null });
    try { await stopSpeech(id); }
    catch (error) { if (id === this.latest) useAppStore.getState().pushToast("error", `Could not stop reading: ${errorMessage(error)}`); }
  }

  completed(threadId: string, turn: Turn): void {
    const key = `${threadId}/${turn.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value!);
    const state = useAppStore.getState();
    if (!state.settings.ttsAutoRead || state.activeThreadId !== threadId || turn.status !== "completed" || state.activeTurn?.threadId === threadId) return;
    const items = turn.items?.length ? turn.items : (state.itemsByThread[threadId] ?? [])
      .map((id) => state.items[id]).filter((item) => item && item.turnId === turn.id).map((item) => item.item);
    const replies = items.filter((item) => item.type === "agentMessage" && item.phase !== "commentary");
    const last = replies[replies.length - 1];
    if (last?.type === "agentMessage") void this.play(`${threadId}/${last.id}`, last.text, "auto");
  }
}

export const speech = new SpeechController();
