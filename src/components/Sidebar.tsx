import { useHubStore } from "../hub/state";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { session } from "../codex/session";
import { selectSortedThreads, useAppStore, type ThreadMeta } from "../codex/store";
import { errorMessage } from "../codex/transport";
import Icon from "./Icon";
import { pickProjectFolder } from "./ProjectPicker";

function relTime(unixSeconds: number): string {
  const d = Date.now() / 1000 - unixSeconds;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function ThreadRow({ t, active }: { t: ThreadMeta; active: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name ?? "");
  const pushToast = useAppStore((s) => s.pushToast);
  const busy = useAppStore((s) => s.threadLoading || s.submissionPending || !!s.activeTurn);
  const character = useAppStore(s=>s.settings.character);
  const title = t.name || t.preview || "(untitled thread)";

  const commit = async () => {
    setEditing(false);
    const next = name.trim();
    if (next && next !== t.name) {
      try {
        await session.renameThread(t.id, next);
      } catch (e) {
        pushToast("error", errorMessage(e));
      }
    }
  };

  return (
    <div
      className={`thread-row ${active ? "active" : ""}`}
      onClick={() => !active && !busy && session.openThread(t.id).catch((e) => pushToast("error", errorMessage(e)))}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setName(t.name ?? "");
        setEditing(true);
      }}
      title={t.preview}
      tabIndex={0}
      aria-label={`Open thread: ${title}`}
      aria-current={active ? "page" : undefined}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!active && !busy) session.openThread(t.id).catch((err) => pushToast("error", errorMessage(err)));
        }
        if (e.key === "F2") { setName(t.name ?? ""); setEditing(true); }
      }}
    >
      {editing ? (
        <input
          className="input"
          autoFocus
          value={name}
          placeholder="thread name"
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="title">{title}</div>
      )}
      <div className="meta">{relTime(t.updatedAt)}</div>
      <div className="actions">
        <button className="btn btn-ghost btn-sm" disabled={busy} title={`Move chat to ${character==='nyx'?'Mommy-chan':'Nyx'}`} aria-label={`Move ${title} to ${character==='nyx'?'Mommy-chan':'Nyx'}`} onClick={e=>{e.stopPropagation();const s=useAppStore.getState();s.updateSettings({threadCharacters:{...s.settings.threadCharacters,[t.id]:character==='nyx'?'mommy':'nyx'}});if(active)s.setActiveThread(null);}}>{character==='nyx'?'♡':'☾'}</button>
        <button
          className="btn btn-ghost btn-sm"
          title="Archive thread"
          aria-label={`Archive ${title}`}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            session.archiveThread(t.id).catch((err) => pushToast("error", errorMessage(err)));
          }}
        >
          <Icon name="archive" size={14} />
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const cwd = useAppStore((s) => s.cwd);
  const character = useAppStore(s=>s.settings.character);
  const threads = useAppStore(useShallow(selectSortedThreads));
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const connection = useAppStore((s) => s.connection);
  const threadLoading = useAppStore((s) => s.threadLoading);
  const submissionPending = useAppStore((s) => s.submissionPending);
  const [query, setQuery] = useState("");
  const pushToast = useAppStore((s) => s.pushToast);
  const ready = connection.state === "ready";

  const shortCwd = cwd ? cwd.replace(/^\/Users\/[^/]+/, "~") : "Choose a project folder";
  const projectName = cwd?.split(/[\\/]/).filter(Boolean).pop() || "Open a project";
  const visibleThreads = threads.filter((t) => `${t.name ?? ""}\n${t.preview}\n${t.cwd}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <aside className="sidebar card" aria-label="Projects and conversations">
      <div className="section-label">Workspace</div>
      <button className="btn" onClick={()=>useHubStore.setState({open:true})}>Project launchpad</button>
      <button className="cwd-row" title={cwd ? `Change project: ${cwd}` : "Choose a project folder"} onClick={pickProjectFolder}>
        <span className="folder-icon"><Icon name="folder" size={20} /></span>
        <span className="project-info"><b>{projectName}</b><span className="path">{shortCwd}</span></span>
        <Icon name="chevron" size={14} />
      </button>
      <button
        className="btn btn-primary"
        disabled={!ready || !cwd || threadLoading || submissionPending}
        onClick={() => session.newThread().catch((e) => pushToast("error", errorMessage(e)))}
      >
        <Icon name="plus" size={17} /> New thread
      </button>
      <div className="section-label threads-label">{character==='nyx'?'Nyx’s chats':'Mommy-chan’s chats'} <span>{threads.length}</span></div>
      <label className="thread-search"><Icon name="search" size={14} /><input aria-label="Search conversations" placeholder="Search conversations…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button aria-label="Clear conversation search" onClick={() => setQuery("")}><Icon name="close" size={12} /></button>}</label>
      <div className="thread-list">
        {threads.length === 0 && <div className="empty"><Icon name="chat" size={26} /><b>A fresh start</b><span>Your conversations will<br />feel right at home here.</span></div>}
        {query.trim() && visibleThreads.length === 0 && threads.length > 0 && <div className="empty">No matching conversations.</div>}
        {visibleThreads.map((t) => (
          <ThreadRow key={t.id} t={t} active={t.id === activeThreadId} />
        ))}
      </div>
      <div className="sidebar-footer"><Icon name="terminal" size={16} /><span>Powered by Codex<small>Made for your local workspace</small></span><Icon name="heart" size={13} /></div>
    </aside>
  );
}
