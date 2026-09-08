/**
 * Deterministic "uwuifier" for prose.
 *
 * Design goals:
 *  - Pure and deterministic: variant choices come from a hash of the input,
 *    never from `Math.random`, so the same message always renders the same.
 *  - Code-safe: URLs, paths, filenames, identifiers, flags, versions and
 *    configured words are never touched. Markdown code/links are handled one
 *    level up by `remarkUwu`, which only feeds plain text nodes in here.
 */

export type UwuIntensity = 0 | 1 | 2 | 3;

export interface UwuOptions {
  intensity: UwuIntensity;
  /** Extra entropy mixed into the hash (e.g. a paragraph offset). */
  seed?: number;
  /** Stutter the first word of some sentences (default true). */
  stutter?: boolean;
  /** Append a kaomoji at the very end (level 3 only, default false). */
  appendEmoticon?: boolean;
  /** Extra words to leave untouched (merged with the defaults). */
  protectWords?: string[];
  /** Leave capitalised words that are not sentence-initial alone (default true). */
  protectProperNouns?: boolean;
}

/** Sentence-tracking state, shared across consecutive text fragments. */
export interface UwuState {
  atSentenceStart: boolean;
  sentenceIndex: number;
}

export const DEFAULT_PROTECT_WORDS: readonly string[] = [
  "npm", "pnpm", "yarn", "bun", "git", "cargo", "rust", "rustc", "tauri", "codex",
  "vite", "react", "node", "nodejs", "python", "brew", "zsh", "bash", "macos", "linux",
  "json", "toml", "yaml", "cli", "api", "url", "http", "https", "localhost",
  "stdin", "stdout", "stderr", "argv", "cwd", "env", "mommy-chan", "mommycodex",
  "sql", "css", "html", "ts", "tsx", "js", "jsx", "md",
];

export const EMOTICONS: readonly string[] = [
  "(◕‿◕✿)",
  "(｡♥‿♥｡)",
  ">w<",
  "uwu",
  "owo",
  "(´ω｀)",
  "♡",
  "(*^▽^*)",
];

/**
 * Token classes that must never be modified. Order matters: at a given
 * position the first alternative that matches wins.
 */
const PROTECTED_RE = new RegExp(
  [
    "`[^`\\n]+`", // inline code that survived as text
    "https?:\\/\\/\\S+", // URLs
    "www\\.\\S+",
    "\\S+@\\S+\\.\\S+", // emails
    "\\S*\\/\\S*", // anything with a slash: paths, @scope/pkg, and/or
    "\\S*\\d\\S*", // anything with a digit: versions, gpt-6-astra, #123
    "[\\w-]+(?:\\.[\\w-]+)+", // filenames with an extension
    "\\S+=\\S+", // KEY=value
    "\\w*_\\w*", // snake_case
    "\\b[a-z]+(?:[A-Z][a-z0-9]*)+\\b", // camelCase
    "\\b(?:[A-Z][a-z0-9]+){2,}\\b", // PascalCase
    "\\b[A-Z][A-Z0-9_]+\\b", // ALL_CAPS
    "(?<!\\S)--?[A-Za-z][\\w-]*", // --flags
    "\\$\\w+", // $VARS
    "@[\\w./-]+", // @handles
  ].join("|"),
  "g",
);

const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;
const WORD_RE = /^([^A-Za-z]*)([A-Za-z][A-Za-z'’-]*)?([\s\S]*)$/;

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mix(h: number, n: number): number {
  let x = (h ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

type Segment = { kind: "free" | "protected"; text: string };

/** Split text into protected tokens and free prose. */
export function segment(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  PROTECTED_RE.lastIndex = 0;
  for (let m = PROTECTED_RE.exec(text); m !== null; m = PROTECTED_RE.exec(text)) {
    if (m[0].length === 0) {
      PROTECTED_RE.lastIndex++;
      continue;
    }
    if (m.index > last) out.push({ kind: "free", text: text.slice(last, m.index) });
    let tok = m[0];
    let tail = "";
    if (!tok.startsWith("`")) {
      const t = TRAILING_PUNCT_RE.exec(tok);
      if (t && t.index > 0) {
        tail = t[0];
        tok = tok.slice(0, t.index);
      }
    }
    out.push({ kind: "protected", text: tok });
    if (tail) out.push({ kind: "free", text: tail });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "free", text: text.slice(last) });
  return out;
}

function applyLetters(core: string, intensity: UwuIntensity): string {
  let s = core;
  if (intensity >= 3) {
    s = s.replace(/^th(?=[aeiouAEIOU])/, "d").replace(/^Th(?=[aeiouAEIOU])/, "D");
  }
  if (intensity >= 2) {
    s = s
      .replace(/n(?=[aeiou])/g, "ny")
      .replace(/N(?=[aeiou])/g, "Ny")
      .replace(/N(?=[AEIOU])/g, "NY");
  }
  s = s.replace(/[rl]/g, "w").replace(/[RL]/g, "W");
  if (intensity >= 2) {
    s = s.replace(/ove/g, "uv").replace(/Ove/g, "Uv").replace(/OVE/g, "UV");
  }
  return s;
}

interface Ctx {
  hash: number;
  intensity: UwuIntensity;
  stutter: boolean;
  protect: Set<string>;
  protectProperNouns: boolean;
  state: UwuState;
}

function transformWord(tok: string, ctx: Ctx): string {
  const m = WORD_RE.exec(tok);
  if (!m) return tok;
  const [, lead, core, rest] = m;
  const endsSentence = /[.!?]/.test(rest ?? "") || /[.!?]$/.test(lead ?? "");
  const wasSentenceStart = ctx.state.atSentenceStart;
  if (!core) {
    if (endsSentence) {
      ctx.state.atSentenceStart = true;
      ctx.state.sentenceIndex++;
    }
    return tok;
  }

  // Sentence bookkeeping happens regardless of whether we transform.
  if (endsSentence) {
    ctx.state.atSentenceStart = true;
    ctx.state.sentenceIndex++;
  } else {
    ctx.state.atSentenceStart = false;
  }

  const lower = core.toLowerCase();
  if (ctx.protect.has(lower)) return tok;
  if (ctx.protectProperNouns && !wasSentenceStart && /^[A-Z][a-z]/.test(core)) return tok;
  if (core.length === 1) return tok;

  let out = applyLetters(core, ctx.intensity);

  if (
    ctx.stutter &&
    ctx.intensity >= 2 &&
    wasSentenceStart &&
    /^[A-Za-z]{3}/.test(out) &&
    !/^([A-Za-z])-\1/i.test(core)
  ) {
    const divisor = ctx.intensity >= 3 ? 2 : 4;
    const sentenceNo = endsSentence ? ctx.state.sentenceIndex - 1 : ctx.state.sentenceIndex;
    if (mix(ctx.hash, sentenceNo) % divisor === 0) {
      out = `${out[0]}-${out}`;
    }
  }
  return `${lead}${out}${rest}`;
}

function transformFree(seg: string, ctx: Ctx): string {
  const parts = seg.split(/(\s+)/);
  let out = "";
  for (const part of parts) {
    if (part === "" || /^\s+$/.test(part)) {
      out += part;
      continue;
    }
    out += transformWord(part, ctx);
  }
  return out;
}

function punctuate(seg: string, intensity: UwuIntensity): string {
  if (intensity >= 3) {
    return seg
      .replace(/(?<!\.)\.(?!\.)(?=\s|$)/g, "~")
      .replace(/\?+(?=\s|$)/g, "?~")
      .replace(/!+(?=\s|$)/g, "!!~");
  }
  if (intensity >= 2) {
    return seg.replace(/!+(?=\s|$)/g, "!~");
  }
  return seg;
}

function tailHasEmoticon(s: string): boolean {
  const tail = s.slice(-16).toLowerCase();
  return EMOTICONS.some((e) => tail.includes(e.toLowerCase()));
}

export function createState(): UwuState {
  return { atSentenceStart: true, sentenceIndex: 0 };
}

/**
 * Uwuify `text`, carrying sentence state in `state` so that consecutive
 * fragments of one paragraph (as produced by a markdown AST) behave like one
 * continuous sentence stream.
 */
export function uwuifyWithState(text: string, opts: UwuOptions, state: UwuState): string {
  const intensity = opts.intensity;
  if (!intensity || intensity <= 0 || text.length === 0) return text;

  const protect = new Set<string>(DEFAULT_PROTECT_WORDS);
  for (const w of opts.protectWords ?? []) protect.add(w.toLowerCase());

  const ctx: Ctx = {
    hash: mix(fnv1a(text), opts.seed ?? 0),
    intensity,
    stutter: opts.stutter !== false,
    protect,
    protectProperNouns: opts.protectProperNouns !== false,
    state,
  };

  const segs = segment(text);
  let out = "";
  for (const s of segs) {
    if (s.kind === "protected") {
      out += s.text;
    } else {
      out += punctuate(transformFree(s.text, ctx), intensity);
    }
  }

  const lastSeg = segs[segs.length - 1];
  if (intensity === 2 && lastSeg?.kind === "free" && out.endsWith(".") && !out.endsWith("..")) {
    out = `${out.slice(0, -1)}~`;
  }

  if (intensity >= 3 && opts.appendEmoticon) {
    const trimmed = out.trimEnd();
    const okEnding = /[A-Za-z~.!?)]$/.test(trimmed);
    if (trimmed.length > 0 && okEnding && !tailHasEmoticon(trimmed)) {
      const emo = EMOTICONS[mix(ctx.hash, 7919) % EMOTICONS.length];
      out = `${trimmed} ${emo}${out.slice(trimmed.length)}`;
    }
  }
  return out;
}

/** Uwuify a standalone piece of text. */
export function uwuify(text: string, opts: UwuOptions): string {
  return uwuifyWithState(text, opts, createState());
}
