import type { ItemState } from "../codex/store";
import Icon from "./Icon";

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function statusPill(status: string | undefined, exitCode?: number | null) {
  switch (status) {
    case "inProgress":
      return <span className="pill pill-run">running</span>;
    case "completed":
      return <span className="pill pill-ok">{exitCode != null ? `exit ${exitCode}` : "done"}</span>;
    case "failed":
      return <span className="pill pill-bad">{exitCode != null ? `exit ${exitCode}` : "failed"}</span>;
    case "declined":
      return <span className="pill pill-warn">declined</span>;
    case "interrupted":
      return <span className="pill pill-warn">stopped</span>;
    default:
      return null;
  }
}

export function Diff({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="diff">
      {lines.map((l, i) => {
        const cls = l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : l.startsWith("@@") ? "hunk" : "";
        return (
          <span key={i} className={cls}>
            {l}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function ToolCard({ item }: { item: ItemState }) {
  const it = item.item;
  switch (it.type) {
    case "commandExecution": {
      const output = stripAnsi(item.liveOutput || it.aggregatedOutput || "");
      return (
        <div className="tool">
          <details>
            <summary>
              <Icon name="terminal" size={16} />
              <span className="label">
                <code>{it.command}</code>
              </span>
              {it.durationMs != null && <span className="pill">{fmtMs(it.durationMs)}</span>}
              {statusPill(item.done && it.status === "inProgress" ? "interrupted" : it.status, it.exitCode)}
            </summary>
            <div className="body">
              <div className="kv">
                in <code>{String(it.cwd)}</code>
              </div>
              {output ? <pre>{output}</pre> : <div className="kv">(no output{it.status === "inProgress" ? " yet" : ""})</div>}
            </div>
          </details>
        </div>
      );
    }
    case "fileChange": {
      const n = it.changes.length;
      return (
        <div className="tool">
          <details open={it.status === "inProgress"}>
            <summary>
              <Icon name="edit" size={16} />
              <span className="label">
                {n} file{n === 1 ? "" : "s"} changed
                {n > 0 && (
                  <>
                    {" · "}
                    <code>{it.changes.map((c) => c.path).join(", ")}</code>
                  </>
                )}
              </span>
              {statusPill(it.status)}
            </summary>
            <div className="body">
              {it.changes.map((c, i) => (
                <details key={`${c.path}-${i}`}>
                  <summary className="file">
                    <span className="pill">{c.kind.type}{c.kind.type === "update" && c.kind.move_path ? ` → ${c.kind.move_path}` : ""}</span>
                    <code>{c.path}</code>
                  </summary>
                  <Diff diff={c.diff} />
                </details>
              ))}
            </div>
          </details>
        </div>
      );
    }
    case "reasoning": {
      const summaries = item.liveSummary.length ? item.liveSummary : it.summary;
      const text = summaries.filter(Boolean).join("\n\n");
      return (
        <div className="tool">
          <details>
            <summary>
              <Icon name="sparkle" size={16} />
              <span className="label">{item.done ? "thought about it" : "thinking…"}</span>
              {!item.done && <span className="pill pill-run">live</span>}
            </summary>
            <div className="body reasoning">{text || "(no summary)"}</div>
          </details>
        </div>
      );
    }
    case "dynamicToolCall": {
      const args = it.arguments as Record<string, unknown> | null;
      return <div className="tool"><details><summary><Icon name="code" size={16}/><span className="label">{it.tool === "mommy_preview" ? `Preview · ${String(args?.action ?? "inspect")}` : it.tool}</span>{statusPill(it.success === false ? "failed" : it.status)}</summary><div className="body"><pre>{JSON.stringify(it.arguments, null, 2)}</pre>{it.contentItems?.map((content, index) => content.type === "inputImage" ? <img key={index} src={content.imageUrl} alt="Browser evidence from this task" style={{maxWidth:"100%",borderRadius:8}}/> : content.type === "inputText" ? <pre key={index}>{content.text}</pre> : null)}</div></details></div>;
    }
    case "mcpToolCall": {
      return (
        <div className="tool">
          <details>
            <summary>
              <Icon name="settings" size={16} />
              <span className="label">
                <code>
                  {it.server}/{it.tool}
                </code>
              </span>
              {it.durationMs != null && <span className="pill">{fmtMs(it.durationMs)}</span>}
              {statusPill(it.status)}
            </summary>
            <div className="body">
              <div className="kv">arguments</div>
              <pre>{JSON.stringify(it.arguments, null, 2)}</pre>
              {it.result != null && (
                <>
                  <div className="kv">result</div>
                  <pre>{JSON.stringify(it.result, null, 2)}</pre>
                </>
              )}
              {it.error != null && (
                <>
                  <div className="kv">error</div>
                  <pre>{JSON.stringify(it.error, null, 2)}</pre>
                </>
              )}
            </div>
          </details>
        </div>
      );
    }
    case "webSearch": {
      return (
        <div className="tool">
          <details>
            <summary>
              <Icon name="search" size={16} />
              <span className="label">searched: {it.query}</span>
            </summary>
            <div className="body">
              {it.results?.length ? <pre>{JSON.stringify(it.results, null, 2)}</pre> : <div className="kv">(no structured results)</div>}
            </div>
          </details>
        </div>
      );
    }
    case "contextCompaction":
      return (
        <div className="tool">
          <details>
            <summary>
              <Icon name="layers" size={16} />
              <span className="label">context compacted</span>
            </summary>
          </details>
        </div>
      );
    case "enteredReviewMode":
    case "exitedReviewMode":
      return (
        <div className="tool">
          <details>
            <summary>
              <Icon name="search" size={16} />
              <span className="label">{it.type === "enteredReviewMode" ? "entered" : "exited"} review mode</span>
            </summary>
            <div className="body">
              <pre>{it.review}</pre>
            </div>
          </details>
        </div>
      );
    default: {
      const anyItem = it as { type: string; id: string };
      return (
        <div className="tool">
          <details>
            <summary>
              <Icon name="activity" size={16} />
              <span className="label">{anyItem.type}</span>
              {!item.done && <span className="pill pill-run">live</span>}
            </summary>
            <div className="body">
              <pre>{JSON.stringify(it, null, 2)}</pre>
            </div>
          </details>
        </div>
      );
    }
  }
}
