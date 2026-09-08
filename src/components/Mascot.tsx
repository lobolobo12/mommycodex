import { useReactionStore } from "../speech/reactions";
import { speech, useSpeechStore } from "../speech/controller";
import { useState } from "react";
import { session } from "../codex/session";
import { selectMood, useAppStore, type Mood } from "../codex/store";
import Icon from "./Icon";
import { characterName } from "../persona";
import nyxExpressions from "../assets/nyx/expressions.png";

const NYX_CAPTIONS: Record<Mood, string> = { idle: "Come here, darling. What are we building?", thinking: "Patience. I’m finding the right move.", working: "Good. Let me handle this.", happy: "There. Just how I wanted it. Well done, darling.", pouty: "Oh, this code wants to be difficult. We’ll fix that." };

// Drop PNG/GIF/WebP frames named idle|thinking|working|happy|pouty into
// src/assets/mascot/ and they replace the built-in SVG chibi automatically.
const frames = import.meta.glob("../assets/mascot/*.{png,gif,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function frameFor(mood: Mood): string | undefined {
  const hit = Object.entries(frames).find(([path]) => path.toLowerCase().includes(`/${mood}.`));
  return hit?.[1] ?? Object.entries(frames).find(([path]) => path.toLowerCase().includes("/idle."))?.[1];
}

const CAPTIONS: Record<Mood, [kawaii: string, serious: string]> = {
  idle: ["Mommy-chan is weady when you awe~ ♡", "Ready."],
  thinking: ["Hmm~ Mommy-chan is thinking…", "Thinking…"],
  working: ["Mommy-chan is wowking hawd fow you! >w<", "Working…"],
  happy: ["Yay~ Mommy-chan did it! (｡♥‿♥｡)", "Done."],
  pouty: ["Nyooo… something went wwong (´；ω；｀)", "Something went wrong."],
};

export function MascotSvg({ mood }: { mood: Mood }) {
  return (
    <svg className="mascot" data-mood={mood} viewBox="0 0 200 230" role="img" aria-label={`Mommy-chan is ${mood}`}>
      <g className="figure">
        {/* twin tails */}
        <ellipse cx="34" cy="120" rx="22" ry="52" fill="var(--hair)" />
        <ellipse cx="166" cy="120" rx="22" ry="52" fill="var(--hair)" />
        <ellipse cx="30" cy="150" rx="14" ry="26" fill="var(--hair-dark)" opacity="0.5" />
        <ellipse cx="170" cy="150" rx="14" ry="26" fill="var(--hair-dark)" opacity="0.5" />

        {/* body / dress */}
        <path d="M58 226 C58 176 78 160 100 160 C122 160 142 176 142 226 Z" fill="var(--dress)" stroke="var(--pink-200)" strokeWidth="2" />
        <path d="M76 226 C76 190 88 178 100 178 C112 178 124 190 124 226 Z" fill="var(--apron)" opacity="0.9" />
        <path d="M100 205 c-6 -8 -16 -2 -10 6 l10 9 l10 -9 c6 -8 -4 -14 -10 -6z" fill="#fff" />
        {/* arms */}
        <g className="arm-l">
          <path d="M66 172 c-14 8 -16 26 -8 40" stroke="var(--skin)" strokeWidth="12" strokeLinecap="round" fill="none" />
        </g>
        <g className="arm-r">
          <path d="M134 172 c14 8 16 26 8 40" stroke="var(--skin)" strokeWidth="12" strokeLinecap="round" fill="none" />
        </g>

        {/* head */}
        <ellipse cx="100" cy="100" rx="58" ry="54" fill="var(--skin)" />
        <ellipse cx="100" cy="118" rx="52" ry="32" fill="var(--skin-shade)" opacity="0.35" />
        {/* hair back + bangs */}
        <path d="M42 96 C40 46 70 30 100 30 C130 30 160 46 158 96 C150 70 128 62 100 62 C72 62 50 70 42 96 Z" fill="var(--hair)" />
        <path d="M46 92 C56 60 78 56 96 66 C88 74 84 82 86 92 Z" fill="var(--hair-dark)" opacity="0.55" />
        <path d="M154 92 C144 60 122 56 104 66 C112 74 116 82 114 92 Z" fill="var(--hair-dark)" opacity="0.55" />
        {/* bow */}
        <path d="M128 40 l18 -12 l-2 22 z" fill="var(--pink-500)" />
        <path d="M128 40 l-18 -12 l2 22 z" fill="var(--pink-500)" />
        <circle cx="128" cy="40" r="5" fill="var(--pink-600)" />

        {/* blush */}
        <ellipse cx="66" cy="118" rx="11" ry="6" fill="var(--blush)" opacity="0.6" />
        <ellipse cx="134" cy="118" rx="11" ry="6" fill="var(--blush)" opacity="0.6" />

        {/* brows (pouty) */}
        <path className="brow" d="M62 84 l20 8" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        <path className="brow" d="M138 84 l-20 8" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />

        {/* eyes open */}
        <g className="eyes-open">
          <g className="eye">
            <ellipse cx="76" cy="104" rx="11" ry="14" fill="#fff" />
            <ellipse cx="77" cy="106" rx="8" ry="11" fill="var(--iris)" />
            <ellipse cx="77" cy="108" rx="5" ry="7" fill="#3b2a5e" />
            <circle cx="73" cy="101" r="3.2" fill="#fff" />
            <circle cx="80" cy="111" r="1.6" fill="#fff" />
          </g>
          <g className="eye">
            <ellipse cx="124" cy="104" rx="11" ry="14" fill="#fff" />
            <ellipse cx="123" cy="106" rx="8" ry="11" fill="var(--iris)" />
            <ellipse cx="123" cy="108" rx="5" ry="7" fill="#3b2a5e" />
            <circle cx="119" cy="101" r="3.2" fill="#fff" />
            <circle cx="126" cy="111" r="1.6" fill="#fff" />
          </g>
        </g>
        {/* happy closed eyes */}
        <g className="eyes-happy" stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M66 106 q10 -12 20 0" />
          <path d="M114 106 q10 -12 20 0" />
        </g>

        {/* mouths */}
        <path className="mouth smile" d="M92 128 q8 7 16 0" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle className="mouth small" cx="100" cy="129" r="3" fill="var(--ink)" />
        <path className="mouth determined" d="M92 129 l16 0" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        <path className="mouth big" d="M88 126 q12 14 24 0 z" fill="#c9506f" />
        <path className="mouth pout" d="M92 131 q4 -6 8 0 q4 6 8 0" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* sweat drop, tear, thought dots, sparkles */}
        <path className="sweat" d="M150 78 q6 10 0 14 q-6 -4 0 -14z" fill="#8fd3ff" />
        <path className="tear" d="M66 120 q5 8 0 12 q-5 -4 0 -12z" fill="#8fd3ff" />
        <g className="think" fill="var(--lav-400)">
          <circle cx="150" cy="60" r="4" />
          <circle cx="162" cy="48" r="6" />
          <circle cx="178" cy="34" r="8" />
        </g>
        <path className="spark" d="M30 60 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="#ffd166" />
        <path className="spark" d="M170 40 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="#ffd166" />
        <path className="spark" d="M172 150 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="#ffd166" />
      </g>
    </svg>
  );
}

/** Use the same artwork everywhere; failed custom frames fall back to idle, then SVG. */
export function MascotArt({ mood = "idle", avatar = false, character: overrideCharacter }: { mood?: Mood; avatar?: boolean; character?: "mommy" | "nyx" }) {
  const character = useAppStore(s => overrideCharacter ?? s.settings.character);
  const [failed, setFailed] = useState<string[]>([]);
  if (character === "nyx") {
    const position = ["idle", "thinking", "working", "happy", "pouty"].indexOf(mood) * 25;
    return <span className={avatar ? "mascot-avatar nyx-avatar" : "mascot-art nyx-art"}><span className="nyx-sprite" data-mood={mood} role={avatar ? undefined : "img"} aria-hidden={avatar || undefined} aria-label={avatar ? undefined : `Nyx is ${mood}`} style={{ backgroundImage: `url(${nyxExpressions})`, backgroundPosition: `${position}% 22%` }} /></span>;
  }
  const frame = [frameFor(mood), frameFor("idle")].find((src) => src && !failed.includes(src));
  return (
    <span className={avatar ? "mascot-avatar" : "mascot-art"}>
      {frame ? (
        <img
          className="mascot-img"
          data-mood={mood}
          src={frame}
          alt={avatar ? "" : `Mommy-chan is ${mood}`}
          draggable={false}
          onError={() => setFailed((previous) => [...previous, frame])}
        />
      ) : <MascotSvg mood={mood} />}
    </span>
  );
}

export default function MascotPanel() {
  const baseMood = useAppStore(selectMood);
  const reaction = useReactionStore();
  const mood = reaction.mood ?? baseMood;
  const voiceStatus = useSpeechStore(s => s.status);
  const settings = useAppStore((s) => s.settings);
  const stderr = useAppStore((s) => s.stderr);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const usage = useAppStore((s) => s.activeThreadId ? s.tokenUsageByThread[s.activeThreadId] : undefined);
  const model = session.currentModel();
  const name = characterName(settings.character);
  const caption = settings.seriousMode ? CAPTIONS[mood][1] : settings.character === "nyx" ? NYX_CAPTIONS[mood] : CAPTIONS[mood][0];
  const moodLabels: Record<Mood, string> = { idle: "Ready when you are", thinking: "Thinking it through", working: "Making progress", happy: "All done!", pouty: "Needs a little attention" };

  return (
    <aside className={`mascot-panel card ${settings.character === "nyx" ? "nyx-panel" : ""}`} aria-label="Companion and session details">
      <div className="section-label companion-label">Your companion <Icon name="heart" size={14} /></div>
      <div className={`mascot-stage ${voiceStatus === "playing" ? "is-speaking" : ""}`} data-mood={mood}>
        <div className="mascot-orbit" aria-hidden="true" />
        <Icon name="sparkle" size={23} className="stage-spark first" />
        <Icon name="sparkle" size={15} className="stage-spark second" />
        <MascotArt mood={mood} />
      </div>
      <h2 className="companion-name">{name} <span>{settings.character === "nyx" ? "☾" : "♡"}</span></h2>
      <div className="companion-role">{settings.character === "nyx" ? "A firm hand. A soft spot for you." : "A little company for your code."}</div>
      <div className="mood-status" data-mood={mood} role="status"><span className="dot" />{moodLabels[mood]}</div>
      <div className="caption">{voiceStatus === "playing" ? `${name} is speaking…` : reaction.text || caption}</div>
      {voiceStatus && <button className="btn btn-ghost" onClick={() => void speech.stop()}>{voiceStatus === "loading" ? "Cancel voice generation" : "Interrupt voice"}</button>}
      {voiceStatus === "playing" && <div className="speaking-bars" aria-label={`${name} is speaking`}><i/><i/><i/><i/><i/></div>}
      <details className="expression-gallery"><summary>Preferences for {name}</summary><textarea aria-label="Companion preferences" maxLength={4000} rows={3} placeholder="How should she talk and build for you?" value={settings.companionNotes} onChange={e=>useAppStore.getState().updateSettings({companionNotes:e.target.value})}/><p className="hint">Saved separately for each companion. Applies to the next task.</p></details>
      <details className="expression-gallery">
        <summary>5 expressions <Icon name="chevron" size={12} /></summary>
        <div className="expression-grid">
          {(["idle", "thinking", "working", "happy", "pouty"] as const).map((expression) => (
            <figure key={expression}>
              <MascotArt mood={expression} avatar />
              <figcaption>{expression}</figcaption>
            </figure>
          ))}
        </div>
      </details>
      <div className="stats">
        <div className="section-label">This session</div>
        <div className="stat">
          <span>Model</span>
          <b>{settings.model ?? model?.displayName ?? model?.model ?? "Not connected"}</b>
        </div>
        <div className="stat">
          <span>Reasoning</span>
          <b>{settings.effort ?? model?.defaultReasoningEffort ?? "default"}</b>
        </div>
        <div className="stat">
          <span>Access</span>
          <b>{settings.sandbox === "workspace-write" ? "Project files" : settings.sandbox === "read-only" ? "Read only" : "Full access"}</b>
        </div>
        <div className="stat">
          <span>Personality</span>
          <b>{settings.seriousMode ? "Mommy mode off" : settings.character === "nyx" ? "Goth · commanding" : "Maximum Mommy"}</b>
        </div>
        <div className="stat">
          <span>Thread</span>
          <b title={activeThreadId ?? ""}>{activeThreadId ? activeThreadId.slice(0, 8) : "Fresh start"}</b>
        </div>
        {usage && <div className="stat" title={`Conversation total: ${usage.total.totalTokens.toLocaleString()} tokens. Cached input in last turn: ${usage.last.cachedInputTokens.toLocaleString()}.`}>
          <span>Last turn tokens</span><b>{usage.last.totalTokens.toLocaleString()}</b>
        </div>}
      </div>
      <details className="log">
        <summary><Icon name="terminal" size={14} /> Codex log <span>{stderr.length}</span></summary>
        <pre>{stderr.slice(-60).join("\n") || "(quiet)"}</pre>
      </details>
    </aside>
  );
}
