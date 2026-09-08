/**
 * The only module that talks to Tauri's `invoke`. Everything else goes
 * through these typed helpers.
 */
import { Channel, invoke } from "@tauri-apps/api/core";
import type { BridgeMessage, RequestId } from "../protocol";

export interface StartOptions {
  binaryOverride?: string | null;
  configOverrides?: string[];
  extraArgs?: string[];
}

export interface StartInfo {
  binary: string;
  pid: number | null;
  generation: number;
  alreadyRunning: boolean;
}

export interface LaunchInfo {
  initialCwd: string | null;
  home: string | null;
  appVersion: string;
}

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export function isRpcError(e: unknown): e is RpcError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as RpcError).code === "number" &&
    typeof (e as RpcError).message === "string"
  );
}

export function errorMessage(e: unknown): string {
  if (isRpcError(e)) return e.message;
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function getLaunchInfo(): Promise<LaunchInfo> {
  return invoke<LaunchInfo>("get_launch_info");
}

export function resolveCodexBinary(overridePath?: string | null): Promise<string> {
  return invoke<string>("resolve_codex_binary", { overridePath: overridePath ?? null });
}

export async function startBridge(
  opts: StartOptions,
  onMessage: (m: BridgeMessage) => void,
): Promise<StartInfo> {
  const channel = new Channel<BridgeMessage>();
  channel.onmessage = onMessage;
  return invoke<StartInfo>("codex_start", { opts, onMessage: channel });
}

export function rpc<T = unknown>(method: string, params: unknown = {}): Promise<T> {
  return invoke<T>("codex_request", { method, params: params ?? {} });
}

export function notify(method: string, params: unknown = {}): Promise<void> {
  return invoke<void>("codex_notify", { method, params: params ?? {} });
}

export function respond(id: RequestId, result: unknown): Promise<void> {
  return invoke<void>("codex_respond", { id, result: result ?? null, error: null });
}

export function respondError(id: RequestId, code: number, message: string): Promise<void> {
  return invoke<void>("codex_respond", { id, result: null, error: { code, message } });
}

export function stopBridge(): Promise<void> {
  return invoke<void>("codex_stop");
}

export function stderrTail(): Promise<string[]> {
  return invoke<string[]>("codex_stderr_tail");
}

export function speechKeyStatus(): Promise<boolean> { return invoke("speech_key_status"); }
export function saveSpeechKey(apiKey: string): Promise<void> { return invoke("speech_save_key", { apiKey }); }
export function removeSpeechKey(): Promise<void> { return invoke("speech_remove_key"); }
export function speakText(requestId: number, text: string, speed: number, model: string, onPlaying: () => void, character: "mommy" | "nyx" = "mommy"): Promise<void> {
  const onEvent = new Channel<string>();
  onEvent.onmessage = (event) => { if (event === "playing") onPlaying(); };
  return invoke("speech_speak", { requestId, text, speed, model, character, onEvent });
}
export function stopSpeech(requestId: number): Promise<void> { return invoke("speech_stop", { requestId }); }
