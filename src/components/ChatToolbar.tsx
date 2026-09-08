import { MascotArt } from "./Mascot";
import { useHarnessStore } from "../harness/state";
import { useAppStore } from "../codex/store";
import Icon from "./Icon";
import { session } from "../codex/session";
import { errorMessage } from "../codex/transport";

export default function ChatToolbar() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const canReview = useAppStore((s) => s.connection.state === "ready" && !!s.cwd && !s.activeTurn && !s.threadLoading && !s.submissionPending);
  const taskBusy = useAppStore((s) => !!s.activeTurn || s.threadLoading || s.submissionPending);
  const pushToast = useAppStore((s) => s.pushToast);
  return (
    <div className="chat-toolbar" aria-label="Conversation preferences">
      <button className="toggle" onClick={() => useHarnessStore.setState(s => ({open: !s.open}))}><Icon name="terminal" size={14} /> Workbench</button>
      <div className="companion-switcher" role="group" aria-label="Choose your companion">
        {(["mommy","nyx"] as const).map(character=><button key={character} className={`companion-choice ${settings.character===character?'selected':''}`} aria-label={`Switch to ${character==='nyx'?'Nyx':'Mommy-chan'}`} aria-pressed={settings.character===character} disabled={taskBusy} onClick={()=>void session.switchCompanion(character).catch(e=>pushToast('error',errorMessage(e)))}>
          <MascotArt avatar character={character}/><span><b>{character==='nyx'?'Nyx':'Mommy-chan'}</b><small>{character==='nyx'?'Goth · commanding':'Sweet · caring'}</small></span><span className="companion-selected" aria-hidden="true">{settings.character===character?'●':''}</span>
        </button>)}
      </div>
      <button
        className={`toggle mode-toggle ${!settings.seriousMode ? "on" : ""}`}
        title="Selected companion personality when on; plain professional replies when off. Applies to your next message."
        role="switch"
        aria-label="Mommy mode"
        aria-checked={!settings.seriousMode}
        onClick={() => update({ seriousMode: !settings.seriousMode })}
      >
        <Icon name="heart" size={14} />
        Mommy mode
        <span className="switch-track" aria-hidden="true" />
        <span className="switch-label">{settings.seriousMode ? "Off" : "On"}</span>
      </button>
      <button
        className={`toggle mode-toggle building-toggle ${settings.mommyBuilding ? "on" : ""}`}
        title={taskBusy ? "Finish or stop the current task to change its build theme." : "Give new games, sites, and apps an uwu anime mommy theme. Separate from Mommy's chat voice."}
        role="switch"
        aria-label="Mommy building"
        aria-checked={settings.mommyBuilding}
        disabled={taskBusy}
        onClick={() => update({ mommyBuilding: !settings.mommyBuilding })}
      >
        <Icon name="sparkle" size={14} />
        Mommy building
        <span className="switch-track" aria-hidden="true" />
        <span className="switch-label">{settings.mommyBuilding ? "On" : "Off"}</span>
      </button>
      <label className="toggle"><input type="checkbox" checked={settings.reviewBeforeKeeping} disabled={taskBusy} onChange={e => update({reviewBeforeKeeping:e.target.checked})}/> Review before keeping</label>
      <button className="toggle review-button" disabled={!canReview} title="Ask Codex to review staged, unstaged, and untracked changes in this project" onClick={() => session.reviewChanges().catch((e) => pushToast("error", errorMessage(e)))}>
        <Icon name="code" size={14} /> Review changes
      </button>
      <button className={`toggle reasoning-toggle ${settings.showReasoning ? "on" : ""}`} title="Show reasoning summaries" aria-pressed={settings.showReasoning} onClick={() => update({ showReasoning: !settings.showReasoning })}>
        <Icon name="activity" size={14} /> Reasoning
      </button>
      {settings.mommyBuilding && <div className="building-note"><Icon name="sparkle" size={13} /><span>{settings.character === "nyx" ? "New builds get goth anime characters, moonlit worlds & violet details." : "New builds get anime mommy characters, cozy worlds & uwu details."}</span></div>}
    </div>
  );
}
