import { describe, expect, it } from "vitest";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { remarkUwu } from "./remarkUwu";
import type { UwuIntensity } from "./uwuify";

async function render(md: string, intensity: UwuIntensity): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkUwu, { intensity, stutter: false })
    .use(remarkStringify)
    .process(md);
  return String(file);
}

describe("remarkUwu", () => {
  it("skips code and inline code but transforms emphasis and prose", async () => {
    const md = "Let me fix `readFile` in **utils**:\n\n```ts\nconst reader = null;\n```\n\nDone, darling.";
    const out = await render(md, 1);
    expect(out).toContain("`readFile`");
    expect(out).toContain("const reader = null;");
    expect(out).toContain("**utiws**");
    expect(out).toContain("Wet me fix");
    expect(out).toContain("Done, dawwing.");
  });

  it("leaves link text and URLs untouched", async () => {
    const out = await render("[the Tauri docs](https://v2.tauri.app/) explain more.", 1);
    expect(out.trim()).toBe("[the Tauri docs](https://v2.tauri.app/) expwain mowe.");
  });

  it("appends a kaomoji to root paragraphs at level 3 only", async () => {
    const out3 = await render("Hello there friend.", 3);
    expect(out3.trim()).toMatch(/^Hewwo dewe fwiend~ \S+$/);
    const out2 = await render("Hello there friend.", 2);
    expect(out2.trim()).toBe("Hewwo dewe fwiend~".replace("dewe", "thewe"));
    const list = await render("- Hello there friend.", 3);
    expect(list).not.toMatch(/\(◕‿◕✿\)|\(｡♥‿♥｡\)|>w<|uwu|owo|\(´ω｀\)|♡|\(\*\^▽\^\*\)/);
  });

  it("is a no-op at level 0", async () => {
    const md = "Hello *there* friend.";
    expect((await render(md, 0)).trim()).toBe(md);
  });
});
