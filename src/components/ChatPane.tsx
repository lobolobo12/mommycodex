import type { Attachment } from "../codex/attachments";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { selectActiveItems, useAppStore } from "../codex/store";
import Composer from "./Composer";
import MessageBubble, { UserBubble } from "./MessageBubble";
import ToolCard from "./ToolCard";
import ChatToolbar from "./ChatToolbar";
import Icon, { type IconName } from "./Icon";
import { MascotArt } from "./Mascot";
import { pickProjectFolder } from "./ProjectPicker";
import TaskActivity from "./TaskActivity";

const STARTERS: { icon: IconName; title: string; description: string; prompt: string }[] = [
  { icon: "code", title: "Build something", description: "Bring an idea to life", prompt: "I'd like to build a new feature in this project. First, help me understand what is already here and ask what I have in mind." },
  { icon: "bug", title: "Fix a bug", description: "Untangle the tricky bits", prompt: "Help me track down a bug in this project. Start by asking what is going wrong and how to reproduce it." },
  { icon: "search", title: "Explore the code", description: "Find your way around", prompt: "Explore this project and explain its structure, main entry points, and how to run it locally." },
];

export default function ChatPane() {
  const items = useAppStore(useShallow(selectActiveItems));
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const threadLoading = useAppStore((s) => s.threadLoading);
  const showReasoning = useAppStore((s) => s.settings.showReasoning);
  const character = useAppStore((s) => s.settings.character);
  const seriousMode = useAppStore((s) => s.settings.seriousMode);
  const mommyBuilding = useAppStore((s) => s.settings.mommyBuilding);
  const cwd = useAppStore((s) => s.cwd);
  const connection = useAppStore((s) => s.connection);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attachmentsByCharacter, setAttachmentsByCharacter] = useState<Record<string, Attachment[]>>({});
  const attachments = attachmentsByCharacter[character] ?? [];
  const setAttachments = (value: React.SetStateAction<Attachment[]>) => setAttachmentsByCharacter(current=>({...current,[character]:typeof value==='function'?value(current[character]??[]):value}));
  const draft = drafts[character] ?? "";
  const setDraft = (value: React.SetStateAction<string>) => setDrafts(current => ({...current, [character]: typeof value === "function" ? value(current[character] ?? "") : value}));
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const starters = mommyBuilding ? [
    { icon: "sparkle" as const, title: "Build a game", description: character === "nyx" ? "A moonlit goth anime world" : "A cozy anime mommy world", prompt: "Build a small, playable game in this project. Choose a fun concept and include clear controls, scoring, and a restart button." },
    ...STARTERS.slice(1),
  ] : STARTERS;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  useEffect(() => {
    stickRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeThreadId]);

  return (
    <main className="chat card">
      <ChatToolbar />
      <TaskActivity />
      <div className="chat-scroll" ref={scrollRef}>
        {threadLoading && (
          <div className="waking">
            {character === "nyx" ? "Nyx is waking up" : "Mommy-chan is waking up"}{" "}
            <span className="dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </div>
        )}
        {items.length === 0 && !threadLoading && (
          <div className="chat-empty">
            <div className="welcome-avatar"><MascotArt avatar /><span><Icon name="sparkle" size={16} /></span></div>
            <div className="welcome-eyebrow">{seriousMode ? "YOUR CODING COMPANION" : character === "nyx" ? "WELCOME, DARLING" : "HELLO, SWEETIE"}</div>
            <h1>What shall we <span>build?</span></h1>
            <p>A new idea, a stubborn bug, or a little polish.<br />{seriousMode ? "Let's make progress on your project." : character === "nyx" ? "Nyx is here. Let’s make something wickedly good." : "Mommy-chan is here to help, one step at a time. ♡"}</p>
            {!cwd && <button className="btn btn-primary open-project" onClick={pickProjectFolder}><Icon name="folder" size={17} /> Open a project</button>}
            <div className="starter-grid">
              {starters.map((starter) => (
                <button className="starter" key={starter.title} onClick={() => { setDraft(starter.prompt); composerRef.current?.focus(); }}>
                  <span className="starter-icon"><Icon name={starter.icon} size={20} /></span>
                  <b>{starter.title}</b><span>{starter.description}</span>
                </button>
              ))}
            </div>
            <div className="welcome-note"><Icon name="heart" size={13} /> A cozy space. A capable coding partner.</div>
          </div>
        )}
        {items.map((it) => {
          switch (it.item.type) {
            case "userMessage":
              return <UserBubble key={it.key} item={it} />;
            case "agentMessage":
            case "plan":
              return <MessageBubble key={it.key} item={it} />;
            case "reasoning":
              return showReasoning ? <ToolCard key={it.key} item={it} /> : null;
            case "hookPrompt":
              return null;
            default:
              return <ToolCard key={it.key} item={it} />;
          }
        })}
      </div>
      {(connection.state === "error" || connection.state === "crashed") && <div className="connection-notice" role="status"><Icon name="activity" size={16} /><span>Codex is offline. Use reconnect above to try again.</span></div>}
      <Composer attachments={attachments} setAttachments={setAttachments} text={draft} setText={setDraft} inputRef={composerRef} />
    </main>
  );
}
