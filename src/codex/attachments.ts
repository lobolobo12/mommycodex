import type { UserInput } from "../protocol";

export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_BYTES = 256 * 1024;
export const FILE_PREFIX = "Attached text file: ";

export interface Attachment {
  id: string;
  name: string;
  input: UserInput;
  preview?: string;
}

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const TEXT_EXTENSIONS = new Set("txt md mdx json jsonl csv tsv log yaml yml toml xml html css scss js jsx mjs cjs ts tsx py rs go java c h cpp hpp cs sh zsh bash sql swift kt rb php vue svelte ini conf svg diff patch".split(" "));

export function attachmentKind(file: Pick<File, "name" | "type" | "size">): "image" | "text" {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_MIME[extension] || Object.values(IMAGE_MIME).includes(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: images must be 8 MB or smaller.`);
    return "image";
  }
  if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension) || /^(Dockerfile|Makefile|LICENSE|\.gitignore)$/i.test(file.name)) {
    if (file.size > MAX_TEXT_BYTES) throw new Error(`${file.name}: text files must be 256 KB or smaller.`);
    return "text";
  }
  throw new Error(`${file.name}: choose a PNG, JPEG, WebP, GIF, or text/code file.`);
}

export async function readAttachment(file: File): Promise<Attachment> {
  const kind = attachmentKind(file);
  const name = file.name.replace(/[\r\n]/g, " ");
  if (kind === "image") {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read ${name}.`));
      reader.onabort = () => reject(new Error(`Reading ${name} was cancelled.`));
      const mime = IMAGE_MIME[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? file.type;
      reader.readAsDataURL(file.slice(0, file.size, mime));
    });
    return { id: crypto.randomUUID(), name, preview: url, input: { type: "image", url } };
  }
  const text = await file.text();
  if (text.includes("\0")) throw new Error(`${name} appears to be a binary file. Choose a text file instead.`);
  return { id: crypto.randomUUID(), name, input: { type: "text", text: `${FILE_PREFIX}${name}\n\n${text}`, text_elements: [] } };
}
