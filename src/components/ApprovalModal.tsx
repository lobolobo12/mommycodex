import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useState } from "react";
import { PERSONA_NAME } from "../persona";
import { session } from "../codex/session";
import { itemKey, useAppStore, type ServerRequestEnvelope } from "../codex/store";
import type {
  CommandExecutionRequestApprovalParams,
  FileChangeRequestApprovalParams,
  McpServerElicitationRequestParams,
  PermissionsRequestApprovalParams,
  ToolRequestUserInputParams,
} from "../protocol";

type Decision = "accept" | "acceptForSession" | "decline" | "cancel";

function decide(req: ServerRequestEnvelope, decision: Decision) {
  void session.respondToRequest(req.id, { decision });
}

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

// ------------------------------------------------------------------ bodies

function CommandBody({ req }: { req: ServerRequestEnvelope }) {
  const p = req.params as CommandExecutionRequestApprovalParams;
  const available = (p as { availableDecisions?: string[] }).availableDecisions;
  const canSession = !available || available.includes("acceptForSession");
  return (
    <>
      <div className="body">
        {p.reason && <div className="reason">{p.reason}</div>}
        <pre>{p.command ?? "(command)"}</pre>
        {p.cwd && (
          <div className="perm">
            in <code>{String(p.cwd)}</code>
          </div>
        )}
        {p.kind && p.kind !== "command" && (
          <div className="perm">
            kind <code>{String(p.kind)}</code>
          </div>
        )}
      </div>
      <div className="foot">
        <button className="btn btn-ghost left" onClick={() => decide(req, "cancel")}>
          deny and stop
        </button>
        <button className="btn btn-danger" onClick={() => decide(req, "decline")}>
          deny (Esc)
        </button>
        {canSession && (
          <button className="btn" onClick={() => decide(req, "acceptForSession")}>
            approve for session
          </button>
        )}
        <button className="btn btn-primary" onClick={() => decide(req, "accept")}>
          approve (Enter)
        </button>
      </div>
    </>
  );
}

function FileChangeBody({ req }: { req: ServerRequestEnvelope }) {
  const p = req.params as FileChangeRequestApprovalParams;
  const item = useAppStore((s) => s.items[itemKey(p.threadId, p.itemId)]);
  const changes = item?.item.type === "fileChange" ? item.item.changes : [];
  return (
    <>
      <div className="body">
        {p.reason && <div className="reason">{p.reason}</div>}
        {p.grantRoot && (
          <div className="perm">
            wants write access under <code>{p.grantRoot}</code> for the session
          </div>
        )}
        {changes.length === 0 && <div className="reason">(no change details available)</div>}
        {changes.map((c, i) => (
          <details key={`${c.path}-${i}`} open={changes.length <= 3}>
            <summary className="perm">
              <span className="pill">{c.kind.type}</span>
              <code>{c.path}</code>
            </summary>
            <pre>{c.diff}</pre>
          </details>
        ))}
      </div>
      <div className="foot">
        <button className="btn btn-ghost left" onClick={() => decide(req, "cancel")}>
          deny and stop
        </button>
        <button className="btn btn-danger" onClick={() => decide(req, "decline")}>
          deny (Esc)
        </button>
        <button className="btn" onClick={() => decide(req, "acceptForSession")}>
          approve for session
        </button>
        <button className="btn btn-primary" onClick={() => decide(req, "accept")}>
          approve (Enter)
        </button>
      </div>
    </>
  );
}

function PermissionsBody({ req }: { req: ServerRequestEnvelope }) {
  const p = req.params as PermissionsRequestApprovalParams;
  const reads = p.permissions.fileSystem?.read ?? [];
  const writes = p.permissions.fileSystem?.write ?? [];
  const network = p.permissions.network?.enabled ?? null;
  const [grantRead, setGrantRead] = useState(true);
  const [grantWrite, setGrantWrite] = useState(true);
  const [grantNet, setGrantNet] = useState(true);
  const [scope, setScope] = useState<"turn" | "session">("turn");

  const approve = () => {
    const granted: Record<string, unknown> = {};
    const fs: Record<string, unknown> = {};
    if (reads.length && grantRead) fs.read = reads;
    if (writes.length && grantWrite) fs.write = writes;
    if (Object.keys(fs).length) granted.fileSystem = { read: fs.read ?? null, write: fs.write ?? null };
    if (network && grantNet) granted.network = { enabled: true };
    void session.respondToRequest(req.id, { permissions: granted, scope });
  };
  const deny = () => void session.respondToRequest(req.id, { permissions: {}, scope: "turn" });

  return (
    <>
      <div className="body">
        {p.reason && <div className="reason">{p.reason}</div>}
        <div className="perm">
          in <code>{String(p.cwd)}</code>
        </div>
        {reads.length > 0 && (
          <label className="perm">
            <input type="checkbox" checked={grantRead} onChange={(e) => setGrantRead(e.target.checked)} />
            read: {reads.map((r) => <code key={String(r)}>{String(r)}</code>)}
          </label>
        )}
        {writes.length > 0 && (
          <label className="perm">
            <input type="checkbox" checked={grantWrite} onChange={(e) => setGrantWrite(e.target.checked)} />
            write: {writes.map((w) => <code key={String(w)}>{String(w)}</code>)}
          </label>
        )}
        {network && (
          <label className="perm">
            <input type="checkbox" checked={grantNet} onChange={(e) => setGrantNet(e.target.checked)} />
            network access
          </label>
        )}
        <label className="perm">
          scope
          <select className="select" value={scope} onChange={(e) => setScope(e.target.value as "turn" | "session")}>
            <option value="turn">this turn only</option>
            <option value="session">whole session</option>
          </select>
        </label>
      </div>
      <div className="foot">
        <button className="btn btn-danger" onClick={deny}>
          deny (Esc)
        </button>
        <button className="btn btn-primary" onClick={approve}>
          grant (Enter)
        </button>
      </div>
    </>
  );
}

function UserInputBody({ req }: { req: ServerRequestEnvelope }) {
  const p = req.params as ToolRequestUserInputParams;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const submit = () => {
    const out: Record<string, { answers: string[] }> = {};
    for (const q of p.questions) {
      const chosen = answers[q.id] ?? "";
      const value = chosen === "__other__" ? (other[q.id] ?? "") : chosen;
      out[q.id] = { answers: value ? [value] : [] };
    }
    void session.respondToRequest(req.id, { answers: out });
  };
  const skip = () => void session.respondToRequest(req.id, { answers: {} });

  return (
    <>
      <div className="body">
        {p.questions.map((q) => (
          <div className="q" key={q.id}>
            <div className="qh">{q.header}</div>
            <div>{q.question}</div>
            {q.options?.map((o) => (
              <label key={o.label}>
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === o.label}
                  onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.label }))}
                />
                <span>
                  {o.label}
                  {o.description && <div className="desc">{o.description}</div>}
                </span>
              </label>
            ))}
            {(q.isOther || !q.options?.length) && (
              <label>
                {q.options?.length ? (
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === "__other__"}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: "__other__" }))}
                  />
                ) : null}
                <input
                  className="input"
                  type={q.isSecret ? "password" : "text"}
                  placeholder={q.options?.length ? "other…" : "your answer"}
                  value={other[q.id] ?? ""}
                  onFocus={() => q.options?.length && setAnswers((a) => ({ ...a, [q.id]: "__other__" }))}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOther((o) => ({ ...o, [q.id]: v }));
                    if (!q.options?.length) setAnswers((a) => ({ ...a, [q.id]: "__other__" }));
                  }}
                />
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="foot">
        <button className="btn btn-ghost" onClick={skip}>
          skip
        </button>
        <button className="btn btn-primary" onClick={submit}>
          answer (Enter)
        </button>
      </div>
    </>
  );
}

interface PrimitiveSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

function SchemaForm({
  schema,
  values,
  onChange,
}: {
  schema: unknown;
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const props = ((schema as { properties?: Record<string, PrimitiveSchema> })?.properties ?? {}) as Record<string, PrimitiveSchema>;
  const required = new Set(((schema as { required?: string[] })?.required ?? []) as string[]);
  const keys = Object.keys(props);
  if (keys.length === 0) return <div className="reason">(this form has no fields)</div>;
  return (
    <>
      {keys.map((k) => {
        const s = props[k] ?? {};
        const type = Array.isArray(s.type) ? s.type[0] : s.type;
        const label = `${s.title ?? k}${required.has(k) ? " *" : ""}`;
        const v = values[k];
        return (
          <div className="q" key={k}>
            <div className="qh">{label}</div>
            {s.description && <div className="desc">{s.description}</div>}
            {Array.isArray(s.enum) ? (
              <select className="select" value={String(v ?? "")} onChange={(e) => onChange({ ...values, [k]: e.target.value })}>
                <option value="">—</option>
                {s.enum.map((o) => (
                  <option key={String(o)} value={String(o)}>
                    {String(o)}
                  </option>
                ))}
              </select>
            ) : type === "boolean" ? (
              <label>
                <input type="checkbox" checked={!!v} onChange={(e) => onChange({ ...values, [k]: e.target.checked })} /> yes
              </label>
            ) : type === "number" || type === "integer" ? (
              <input
                className="input"
                type="number"
                value={v == null ? "" : String(v)}
                onChange={(e) => onChange({ ...values, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            ) : (
              <input className="input" value={String(v ?? "")} onChange={(e) => onChange({ ...values, [k]: e.target.value })} />
            )}
          </div>
        );
      })}
    </>
  );
}

function ElicitationBody({ req }: { req: ServerRequestEnvelope }) {
  const p = req.params as McpServerElicitationRequestParams;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const respond = (action: "accept" | "decline" | "cancel", content: unknown = null) =>
    void session.respondToRequest(req.id, { action, content, _meta: null });

  if (p.mode === "url") {
    return (
      <>
        <div className="body">
          <div className="reason">
            <b>{p.serverName}</b>: {p.message}
          </div>
          <div className="perm">
            <button className="btn" onClick={() => openUrl(p.url).catch(() => undefined)}>
              open link
            </button>
            <code>{p.url}</code>
          </div>
        </div>
        <div className="foot">
          <button className="btn btn-ghost left" onClick={() => respond("cancel")}>
            cancel
          </button>
          <button className="btn btn-danger" onClick={() => respond("decline")}>
            decline (Esc)
          </button>
          <button className="btn btn-primary" onClick={() => respond("accept")}>
            done (Enter)
          </button>
        </div>
      </>
    );
  }
  const schema = (p as { requestedSchema?: unknown }).requestedSchema;
  return (
    <>
      <div className="body">
        <div className="reason">
          <b>{p.serverName}</b>: {p.message}
        </div>
        <SchemaForm schema={schema} values={values} onChange={setValues} />
      </div>
      <div className="foot">
        <button className="btn btn-ghost left" onClick={() => respond("cancel")}>
          cancel
        </button>
        <button className="btn btn-danger" onClick={() => respond("decline")}>
          decline (Esc)
        </button>
        <button className="btn btn-primary" onClick={() => respond("accept", values)}>
          submit (Enter)
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------- modal

const TITLES: Record<string, string> = {
  "item/commandExecution/requestApproval": "wants to run a command",
  "item/fileChange/requestApproval": "wants to change some files",
  "item/permissions/requestApproval": "asks for extra permissions",
  "item/tool/requestUserInput": "has a question for you",
  "mcpServer/elicitation/request": "needs input for a tool",
};

export default function ApprovalModal() {
  const pending = useAppStore((s) => s.pendingRequests);
  const seriousMode = useAppStore((s) => s.settings.seriousMode);
  const character = useAppStore((s) => s.settings.character);
  const req = pending[0];

  const primary = useMemo(() => {
    if (!req) return null;
    switch (req.method) {
      case "item/commandExecution/requestApproval":
      case "item/fileChange/requestApproval":
        return { yes: () => decide(req, "accept"), no: () => decide(req, "decline") };
      case "item/permissions/requestApproval":
        return { yes: null, no: () => void session.respondToRequest(req.id, { permissions: {}, scope: "turn" }) };
      case "mcpServer/elicitation/request":
        return { yes: null, no: () => void session.respondToRequest(req.id, { action: "decline", content: null, _meta: null }) };
      default:
        return { yes: null, no: null };
    }
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && primary?.no) {
        e.preventDefault();
        primary.no();
      } else if (e.key === "Enter" && primary?.yes && !isTypingTarget(e.target)) {
        e.preventDefault();
        primary.yes();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, primary]);

  if (!req) return null;

  const title = TITLES[req.method] ?? req.method;
  let body;
  switch (req.method) {
    case "item/commandExecution/requestApproval":
      body = <CommandBody req={req} />;
      break;
    case "item/fileChange/requestApproval":
      body = <FileChangeBody req={req} />;
      break;
    case "item/permissions/requestApproval":
      body = <PermissionsBody req={req} />;
      break;
    case "item/tool/requestUserInput":
      body = <UserInputBody req={req} />;
      break;
    case "mcpServer/elicitation/request":
      body = <ElicitationBody req={req} />;
      break;
    default:
      body = (
        <>
          <div className="body">
            <pre>{JSON.stringify(req.params, null, 2)}</pre>
          </div>
          <div className="foot">
            <button className="btn btn-danger" onClick={() => void session.rejectRequest(req.id, "unsupported request")}>
              dismiss
            </button>
          </div>
        </>
      );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="head">
          <span>{seriousMode ? "Approval needed" : character === "nyx" ? "Nyx needs your permission." : `${PERSONA_NAME} needs your permission~`}</span>
          <span className="pill">{title}</span>
          {pending.length > 1 && <span className="pill pill-warn count">1 of {pending.length}</span>}
        </div>
        {body}
      </div>
    </div>
  );
}
