import { MascotArt } from "./Mascot";
import { useAppStore } from "../codex/store";
import Icon from "./Icon";
import { session } from "../codex/session";
import { errorMessage } from "../codex/transport";

export default function ChatToolbar() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const taskBusy = useAppStore((s) => !!s.activeTurn || s.threadLoading || s.submissionPending);
  const pushToast = useAppStore((s) => s.pushToast);
  return (
    <div className="chat-toolbar" aria-label="Conversation preferences">
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
      {settings.mommyBuilding && <div className="building-note"><Icon name="sparkle" size={13} /><span>{settings.character === "nyx" ? "New builds get goth anime characters, moonlit worlds & violet details." : "New builds get anime mommy characters, cozy worlds & uwu details."}</span></div>}
    </div>
  );
}
