import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../codex/store";
import { errorMessage, removeSpeechKey, saveSpeechKey, speechKeyStatus } from "../codex/transport";
import { speech, useSpeechStore } from "../speech/controller";
import Icon from "./Icon";

const VOICES = { mommy: { name: "Mommy", id: "60bd8f0f5bbc462a8fa1686dd81af336", description: "Soft, affectionate & nurturing", preview: "There you are, darling. Mommy’s here to help you build something lovely. Let’s take it one step at a time." }, nyx: { name: "Nyx", id: "857b089972de4840baf7830a089d98da", description: "Calm, authoritative & measured", preview: "Good. You’re here, darling. Tell me what we’re building. I’ll take it from here." } } as const;
const KEY_URL = "https://fish.audio/app/api-keys/";

export default function SpeechSettings() {
  const settings = useAppStore((s) => s.settings);
  const voice = VOICES[settings.character];
  const update = useAppStore((s) => s.updateSettings);
  const pushToast = useAppStore((s) => s.pushToast);
  const reading = useSpeechStore((s) => s.activeKey !== null);
  const speechStatus = useSpeechStore((s) => s.status);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = () => {
    setError("");
    speechKeyStatus().then(setConfigured).catch((e) => setError(errorMessage(e)));
  };
  useEffect(refresh, []);
  const open = (url: string) => { void openUrl(url).catch((e) => pushToast("error", errorMessage(e))); };
  const save = async () => {
    if (!key.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await saveSpeechKey(key.trim());
      setKey(""); setConfigured(true);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError("");
    try {
      await speech.stop();
      await removeSpeechKey();
      setConfigured(false); setKey(""); update({ ttsAutoRead: false });
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <section className="speech-settings" aria-label="Companion voice">
      <div className="speech-heading"><Icon name="speaker" size={17} /><b>{voice.name}’s voice</b><span>Fish Audio</span></div>
      <div className="speech-preset"><span><b>{voice.name}</b><small>{voice.description}</small></span><button className="btn btn-ghost btn-sm" onClick={() => open(`https://fish.audio/m/${voice.id}/`)}>Hear sample ↗</button></div>
      <label htmlFor="fish-api-key">Fish Audio API key</label>
      <div className="speech-key-row">
        <input id="fish-api-key" className="input" type="password" autoComplete="off" spellCheck={false} disabled={busy} value={key} placeholder={configured ? "Key saved · enter to replace" : "Paste your Fish API key"} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }} />
        <button className="btn btn-primary btn-sm" disabled={busy || !key.trim()} onClick={() => void save()}>{busy ? "…" : "Save"}</button>
      </div>
      <div className="speech-key-actions"><span>{configured ? "Saved securely on this device" : configured === false ? "No key saved" : "Checking saved key…"}</span><button onClick={() => open(KEY_URL)}>Get API key ↗</button>{configured && <button disabled={busy} onClick={() => void remove()}>Remove</button>}</div>
      {error && <div className="speech-error" role="alert">{error} <button onClick={refresh}>Retry</button></div>}
      <div className="speech-options">
        <label>Speech tier<select className="select" value={settings.ttsFishModel} onChange={(e) => update({ ttsFishModel: e.target.value as typeof settings.ttsFishModel })}><option value="s2.1-pro-free">Free trial · if available</option><option value="s2.1-pro">Standard · uses credits</option></select></label>
        <label>Speed<select className="select" value={settings.ttsSpeed} onChange={(e) => update({ ttsSpeed: Number(e.target.value) })}><option value={0.85}>Relaxed</option><option value={1}>Normal</option><option value={1.15}>Quick</option></select></label>
      </div>
      <p className="hint">Use /voice on or /voice off for automatic reading.</p>
      <button className={`btn ${reading ? "btn-danger" : "btn-primary"} voice-preview`} disabled={!reading && (!configured || busy)} onClick={() => reading ? void speech.stop() : void speech.play("voice-preview", voice.preview, "preview")}><Icon name={reading ? "stop" : "speaker"} size={14} />{reading ? speechStatus === "loading" ? "Cancel voice generation" : "Stop reading" : `Try ${voice.name}’s voice`}</button>
      <p className="hint">Voice follows the selected companion. Reads original reply text, skipping code. Spoken text is sent to Fish Audio. Auto-read starts off. API credits are separate from Fish subscriptions; free-trial availability varies.</p>
    </section>
  );
}
