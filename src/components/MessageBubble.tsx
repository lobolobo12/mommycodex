import FileLink from './FileLink';
import { fileTarget } from '../workflow/files';
import { useMemo, type ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { characterName } from "../persona";
import { useAppStore, type ItemState } from "../codex/store";
import { remarkUwu } from "../uwu/remarkUwu";
import { MascotArt } from "./Mascot";
import { FILE_PREFIX } from "../codex/attachments";
import { speech, useSpeechStore } from "../speech/controller";
import { speechText } from "../speech/text";
import Icon from "./Icon";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function CodeBlock(props: { children?: ReactNode }) {
  const copy = () => {
    const text = extractText(props.children);
    navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  return (
    <pre>
      {props.children}
      <button className="copy" onClick={copy} title="Copy to clipboard">
        copy
      </button>
    </pre>
  );
}

const components = {
  pre: CodeBlock,
  a: ({href,children}:{href?:string;children?:ReactNode}) => href && fileTarget(href) ? <FileLink path={href}>{children}</FileLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
  code: ({children,className}:{children?:ReactNode;className?:string}) => {
    const text=extractText(children);
    return !className&&!text.includes('\n')&&fileTarget(text)?<FileLink path={text}><code>{children}</code></FileLink>:<code className={className}>{children}</code>;
  },
};

export function UwuMarkdown({ text, intensity, seed }: { text: string; intensity: 0 | 1 | 2 | 3; seed?: number }) {
  const plugins = useMemo<PluggableList>(
    () => [remarkGfm, [remarkUwu, { intensity, stutter: true, seed: seed ?? 0 }]],
    [intensity, seed],
  );
  return (
    <div className="md">
      <Markdown urlTransform={url=>fileTarget(url)?url:defaultUrlTransform(url)} remarkPlugins={plugins} components={components}>
        {text}
      </Markdown>
    </div>
  );
}

export default function MessageBubble({ item }: { item: ItemState }) {
  const settings = useAppStore((s) => s.settings);
  const showOriginal = useAppStore((s) => !!s.showOriginal[item.key]);
  const toggle = useAppStore((s) => s.toggleShowOriginal);
  const streaming = !item.done;
  const isPlan = item.item.type === "plan";
  const name = characterName(settings.character);
  const intensity = showOriginal || settings.seriousMode || settings.character === "nyx" ? 0 : 3;
  const text = item.liveText;
  const reading = useSpeechStore((s) => s.activeKey === item.key);
  const speechStatus = useSpeechStore((s) => s.activeKey === item.key ? s.status : null);
  const canRead = useMemo(() => item.done && !!speechText(text), [item.done, text]);
  if (!text && streaming) {
    return (
      <div className="msg assistant">
        <div className="who"><MascotArt mood="thinking" avatar />{name}</div>
        <div className="bubble">
          <span className="cursor" />
        </div>
      </div>
    );
  }
  return (
    <div className="msg assistant">
      <div className="who">
        <MascotArt mood={streaming ? "thinking" : "happy"} avatar />
        {isPlan ? `${name}'s plan` : name}
        {!settings.seriousMode && settings.character !== "nyx" && (
          <button className="btn btn-ghost btn-sm orig" onClick={() => toggle(item.key)}>
            {showOriginal ? "uwu it" : "show original"}
          </button>
        )}
        {canRead && <button className={`btn btn-ghost btn-sm read-aloud ${reading ? "reading" : ""}`} aria-label={reading ? "Stop reading this reply" : "Read reply aloud"} title={reading ? "Stop reading (Esc)" : `Read aloud with ${name}’s Fish Audio voice`} onClick={() => reading ? void speech.stop() : void speech.play(item.key, text)}><Icon name={reading ? "stop" : "speaker"} size={13} />{reading ? speechStatus === "loading" ? "Cancel loading" : "Stop reading" : "Read aloud"}</button>}
      </div>
      <div className={`bubble ${isPlan ? "plan" : ""}`}>
        <UwuMarkdown text={text} intensity={intensity} seed={item.startedAtMs ?? 0} />
        {streaming && <span className="cursor" />}
      </div>
    </div>
  );
}

export function UserBubble({ item }: { item: ItemState }) {
  const content = item.item.type === "userMessage" ? item.item.content : [];
  return (
    <div className={`msg user ${item.failed ? "failed" : ""}`}>
      <div className="who">you{item.failed ? " · not sent" : item.local ? " · sending…" : ""}</div>
      <div className="bubble">{content.map((part, index) => {
        if (part.type === "text") {
          if (part.text.startsWith(FILE_PREFIX)) {
            const split = part.text.indexOf("\n\n");
            if (split >= 0) return <details className="attached-text" key={index}><summary>{part.text.slice(FILE_PREFIX.length, split)}</summary><pre>{part.text.slice(split + 2)}</pre></details>;
          }
          return <div key={index}>{part.text}</div>;
        }
        if (part.type === "image" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(part.url)) return <img className="message-image" key={index} src={part.url} alt="Attached image" loading="lazy" />;
        if (part.type === "localImage") return <div key={index}>Image: {part.path.split(/[\\/]/).pop()}</div>;
        return <div key={index}>[{part.type}]</div>;
      })}</div>
    </div>
  );
}
