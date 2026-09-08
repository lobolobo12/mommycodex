import { useCommandUI } from "../commands";
import { useState } from "react";
import { session } from "../codex/session";
import { useAppStore } from "../codex/store";
import type { ReviewerSetting, SandboxSetting } from "../settings";
import Icon from "./Icon";
import { MascotArt } from "./Mascot";
import SpeechSettings from "./SpeechSettings";
import { speech, useSpeechStore } from "../speech/controller";

export default function TopBar() {
  const connection = useAppStore((s) => s.connection);
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const [restarting, setRestarting] = useState(false);
  const reading = useSpeechStore((s) => s.activeKey !== null);

  const model = session.currentModel();
  const settingsOpen = useCommandUI(s=>s.settingsOpen);
  const effortValue = settings.effort ?? model?.defaultReasoningEffort ?? "";

  const reapplyPersona = () => {
    if (activeThreadId) session.openThread(activeThreadId).catch(() => undefined);
  };

  const restart = async () => {
    setRestarting(true);
    try {
      await session.restart();
    } finally {
      setRestarting(false);
    }
  };

  const connLabel =
    connection.state === "ready"
      ? "connected"
      : connection.state === "starting"
        ? connection.message
        : connection.message;

  return (
    <header className="topbar">
      <div className="brand">
        <MascotArt avatar />
        <span>Mommy<span className="brand-accent">Codex</span><small>Your cozy coding space</small></span>
      </div>
      <div className="spacer" />
      <span className="model-status" title="Use /model and /effort to change these">{model?.displayName || settings.model || "Codex"} · {effortValue || "default"}</span>

      <div className={`conn ${connection.state}`} title={connLabel}>
        <span className="dot" />
        <span>{connection.state === "ready" ? "connected" : connection.state}</span>
      </div>

      <button className="btn btn-ghost icon-button" onClick={() => void restart().catch(() => undefined)} disabled={restarting} title="Reconnect to Codex" aria-label="Reconnect to Codex">
        <Icon name="refresh" className={restarting ? "ui-icon spinning" : "ui-icon"} />
      </button>

      {reading && <button className="btn btn-ghost icon-button speech-stop" onClick={() => void speech.stop()} title="Stop reading (Esc)" aria-label="Stop reading"><Icon name="stop" /></button>}
      <details className="settings-pop" open={settingsOpen} onToggle={e=>useCommandUI.setState({settingsOpen:e.currentTarget.open})}>
        <summary className="btn btn-ghost icon-button" title="Settings" aria-label="Settings">
          <Icon name="settings" />
        </summary>
        <div className="settings-panel card">
          <div className="settings-heading">Make yourself at home</div>
          <SpeechSettings />
          <label>
            approvals reviewer
            <select
              className="select"
              value={settings.reviewer}
              onChange={(e) => {
                update({ reviewer: e.target.value as ReviewerSetting });
                reapplyPersona();
              }}
            >
              <option value="user">ask me (user)</option>
              <option value="auto_review">auto review (Codex decides)</option>
            </select>
          </label>
          <label>
            sandbox
            <select
              className="select"
              value={settings.sandbox}
              onChange={(e) => {
                update({ sandbox: e.target.value as SandboxSetting });
                reapplyPersona();
              }}
            >
              <option value="read-only">read-only (ask before edits)</option>
              <option value="workspace-write">workspace-write (auto-edit in project)</option>
              <option value="danger-full-access">danger: full access</option>
            </select>
            <span className="hint">Applies to new threads and when re-opening a thread.</span>
          </label>
          <label>
            codex binary path (optional)
            <input
              className="input"
              placeholder="auto-detect"
              value={settings.codexBinaryPath}
              onChange={(e) => update({ codexBinaryPath: e.target.value })}
            />
            <span className="hint">
              Using: <code>{connection.state === "ready" ? connection.binary : "…"}</code>. Press restart to apply.
            </span>
          </label>
        </div>
      </details>
    </header>
  );
}
