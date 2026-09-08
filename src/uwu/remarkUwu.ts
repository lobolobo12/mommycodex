/**
 * remark plugin: uwuify prose text nodes while leaving code, links, images
 * and raw HTML untouched. Sentence state is carried across the text nodes of
 * a paragraph so stutters and proper-noun detection behave naturally.
 */
import type { Node, Parent, Root, Text } from "mdast";
import { visitParents } from "unist-util-visit-parents";
import { createState, uwuifyWithState, type UwuOptions, type UwuState } from "./uwuify";

const SKIP_ANCESTORS = new Set([
  "code",
  "inlineCode",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "definition",
  "html",
  "math",
  "inlineMath",
  "yaml",
]);

export interface RemarkUwuOptions extends UwuOptions {
  /** Append a kaomoji to root-level paragraphs (level 3 only, default true). */
  paragraphEmoticons?: boolean;
}

export function remarkUwu(options: RemarkUwuOptions) {
  return (tree: Root) => {
    if (!options || options.intensity <= 0) return;
    const states = new WeakMap<Node, UwuState>();

    visitParents(tree, "text", (node: Text, ancestors: Parent[]) => {
      if (ancestors.some((a) => SKIP_ANCESTORS.has(a.type))) return;
      const parent = ancestors[ancestors.length - 1];
      const grandparent = ancestors[ancestors.length - 2];
      if (!parent) return;

      // One sentence-state per block container (paragraph, heading, ...).
      const block =
        [...ancestors].reverse().find((a) => a.type === "paragraph" || a.type === "heading" || a.type === "tableCell") ??
        parent;
      let state = states.get(block);
      if (!state) {
        state = createState();
        states.set(block, state);
      }

      const isRootParagraph = parent.type === "paragraph" && grandparent?.type === "root";
      const isLast = parent.children[parent.children.length - 1] === node;
      const seed = (node.position?.start.offset ?? 0) + (options.seed ?? 0);

      node.value = uwuifyWithState(
        node.value,
        {
          ...options,
          seed,
          appendEmoticon: options.paragraphEmoticons !== false && isRootParagraph && isLast,
        },
        state,
      );
    });
  };
}

export default remarkUwu;
