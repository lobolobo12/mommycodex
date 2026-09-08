import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { useAppStore } from "../codex/store";
import * as transport from "../codex/transport";
import type { Turn } from "../protocol";
import { SpeechController, useSpeechStore } from "./controller";
import { speechText } from "./text";

const reply = (id: string, text: string, phase: string | null = "final_answer") => ({ id, type: "agentMessage", text, phase });
const completed = (id: string, items = [reply("reply", "There we go, darling. The build passed.")]) => ({ id, status: "completed", items, error: null } as unknown as Turn);

beforeEach(() => {
  vi.restoreAllMocks();
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS }, activeThreadId: "thread", activeTurn: null, items: {}, itemsByThread: {}, toasts: [] });
  useSpeechStore.setState({ activeKey: null, source: null, status: null });
});

describe("Readable speech text", () => {
  it("keeps affectionate prose and link labels while skipping code, URLs, and faces", () => {
    const text = "There we go, **darling**~ ♡\n\n[The guide](https://example.com) explains it.\n\n```js\nconst secret = 'not spoken';\n```\n\nAll 48 tests passed. (｡♥‿♥｡)";
    expect(speechText(text)).toBe("There we go, darling\n\nThe guide explains it.\n\nAll 48 tests passed.");
  });
  it("does not read code-only replies, hidden HTML, or image references", () => {
    expect(speechText("```sh\nrm -rf example\n```\n\n![diagram](file.png)\n\n<!-- internal -->")).toBe("");
  });
  it("separates list items and preserves numbers", () => {
    expect(speechText("- Fixed 2 bugs.\n- All 48 tests passed.")).toBe("Fixed 2 bugs.\nAll 48 tests passed.");
  });
});

describe("Speech playback", () => {
  it("uses the selected Fish tier and speed and tracks generation through playback", async () => {
    let finish!: () => void;
    const rpc = vi.spyOn(transport, "speakText").mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    useAppStore.getState().updateSettings({ ttsSpeed: 0.85, ttsFishModel: "s2.1-pro" });
    const controller = new SpeechController();
    const pending = controller.play("thread/reply", "Hello, darling~");
    expect(rpc.mock.calls[0].slice(1, 4)).toEqual(["Hello, darling", 0.85, "s2.1-pro"]);
    expect(useSpeechStore.getState()).toMatchObject({ activeKey: "thread/reply", status: "loading" });
    rpc.mock.calls[0][4]();
    expect(useSpeechStore.getState().status).toBe("playing");
    finish(); await pending;
    expect(useSpeechStore.getState().activeKey).toBeNull();
  });

  it("routes manual and automatic speech to the selected companion", async () => {
    const rpc = vi.spyOn(transport, "speakText").mockResolvedValue();
    const controller = new SpeechController();
    useAppStore.getState().updateSettings({ character: "nyx", ttsAutoRead: true });
    await controller.play("preview", "Hello, darling.", "preview");
    expect(rpc.mock.calls[0][5]).toBe("nyx");
    controller.completed("thread", completed("nyx-auto"));
    expect(rpc.mock.calls[1][5]).toBe("nyx");
    useAppStore.getState().updateSettings({ character: "mommy" });
    await controller.play("reply", "Hello again.");
    expect(rpc.mock.calls[2][5]).toBe("mommy");
  });

  it("allows Keychain dialogs only for explicit playback, never automatic speech", async () => {
    const rpc = vi.spyOn(transport, "speakText").mockResolvedValue();
    const controller = new SpeechController();
    await controller.play("manual", "Hello.", "manual");
    await controller.play("preview", "Hello.", "preview");
    await controller.play("auto", "Hello.", "auto");
    await controller.play("reaction", "Hello.", "reaction");
    expect(rpc.mock.calls.map(call => call[6])).toEqual([true, true, false, false]);
  });

  it("stops an in-flight generation and ignores its late events or errors", async () => {
    let fail!: (error: Error) => void;
    const rpc = vi.spyOn(transport, "speakText").mockImplementation(() => new Promise<void>((_, reject) => { fail = reject; }));
    const stop = vi.spyOn(transport, "stopSpeech").mockResolvedValue();
    const controller = new SpeechController();
    const pending = controller.play("old", "An old reply.");
    await controller.stop();
    expect(stop.mock.calls[0][0]).toBeGreaterThan(rpc.mock.calls[0][0]);
    rpc.mock.calls[0][4]();
    fail(new Error("Download canceled")); await pending;
    expect(useSpeechStore.getState().activeKey).toBeNull();
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it("does not let an old completion clear a newer reply", async () => {
    const finishes: (() => void)[] = [];
    const rpc = vi.spyOn(transport, "speakText").mockImplementation(() => new Promise<void>((resolve) => finishes.push(resolve)));
    const controller = new SpeechController();
    const first = controller.play("first", "First reply.");
    const second = controller.play("second", "Second reply.");
    rpc.mock.calls[0][4]();
    expect(useSpeechStore.getState()).toMatchObject({ activeKey: "second", status: "loading" });
    finishes[0](); await first;
    expect(useSpeechStore.getState().activeKey).toBe("second");
    finishes[1](); await second;
  });

  it("reports an actionable error and clears the playback state", async () => {
    vi.spyOn(transport, "speakText").mockRejectedValue(new Error("Add your Fish API key in Settings"));
    await new SpeechController().play("reply", "Hello.");
    expect(useAppStore.getState().toasts[0].text).toContain("Fish API key");
    expect(useSpeechStore.getState().activeKey).toBeNull();
  });
});

describe("Auto-read", () => {
  it("is opt-in and reads the final reply once, without commentary or tool output", async () => {
    const rpc = vi.spyOn(transport, "speakText").mockResolvedValue();
    const controller = new SpeechController();
    controller.completed("thread", completed("before-opt-in"));
    expect(rpc).not.toHaveBeenCalled();
    useAppStore.getState().updateSettings({ ttsAutoRead: true });
    controller.completed("thread", completed("before-opt-in"));
    expect(rpc).not.toHaveBeenCalled();
    const turn = completed("new", [reply("progress", "Checking the files", "commentary"), reply("final", "All done, darling.")]);
    controller.completed("thread", turn);
    controller.completed("thread", turn);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toBe("All done, darling.");
    await Promise.resolve();
  });

  it("does not speak failed, interrupted, background, or nested review completions", () => {
    const rpc = vi.spyOn(transport, "speakText");
    useAppStore.getState().updateSettings({ ttsAutoRead: true });
    const controller = new SpeechController();
    controller.completed("other", completed("background"));
    controller.completed("thread", { ...completed("failed"), status: "failed" });
    controller.completed("thread", { ...completed("stopped"), status: "interrupted" });
    useAppStore.setState({ activeTurn: { threadId: "thread", turnId: "inner", reviewRootTurnId: "root", status: "inProgress" } });
    controller.completed("thread", completed("inner"));
    expect(rpc).not.toHaveBeenCalled();
  });
});
