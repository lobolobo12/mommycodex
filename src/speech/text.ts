import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, RootContent } from "mdast";

const parser = unified().use(remarkParse);

function prose(node: Root | RootContent): string {
  if (["code", "inlineCode", "html", "image", "imageReference", "definition", "footnoteDefinition"].includes(node.type)) return "";
  if (node.type === "text") return node.value;
  if (node.type === "break") return " ";
  if ("children" in node) {
    const separator = node.type === "root" ? "\n\n" : ["list", "listItem", "blockquote"].includes(node.type) ? "\n" : "";
    return node.children.map((child) => prose(child as RootContent)).join(separator);
  }
  return "";
}

/** Use original chat prose; code, URLs, markup, and decorative faces are not spoken. */
export function speechText(markdown: string): string {
  return prose(parser.parse(markdown) as Root)
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/\([^\n()]*[♥♡｡ω‿◕][^\n()]*\)/gu, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D♡♥~]/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
