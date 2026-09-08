import { describe, expect, it } from "vitest";
import { uwuify } from "./uwuify";

const noStutter = { stutter: false } as const;

describe("uwuify", () => {
  it("L1 replaces r/l with w", () => {
    expect(uwuify("Hello darling, let me look at the file.", { intensity: 1, ...noStutter })).toBe(
      "Hewwo dawwing, wet me wook at the fiwe.",
    );
  });

  it("L1 leaves inline code and paths alone", () => {
    expect(uwuify("Run `pnpm install` then open src/main.tsx", { intensity: 1, ...noStutter })).toBe(
      "Wun `pnpm install` then open src/main.tsx",
    );
  });

  it("L2 adds nya, protects identifiers, and ends with ~", () => {
    expect(
      uwuify("No problem, I will rename getUserName in user_service.ts.", { intensity: 2, ...noStutter }),
    ).toBe("Nyo pwobwem, I wiww wenyame getUserName in user_service.ts~");
  });

  it("L2 protects versions, numbers and default words", () => {
    expect(uwuify("Codex 0.153.4 needs Node 26.", { intensity: 2, ...noStutter })).toBe(
      "Codex 0.153.4 nyeeds Node 26~",
    );
  });

  it("L2 protects flags and KEY=value", () => {
    expect(
      uwuify("Pass --release to cargo build, or set RUST_LOG=debug", { intensity: 2, ...noStutter }),
    ).toBe("Pass --release to cargo buiwd, ow set RUST_LOG=debug");
  });

  it("L3 turns th into d and decorates sentence ends", () => {
    expect(uwuify("Really? The build failed.", { intensity: 3, ...noStutter })).toBe(
      "Weawwy?~ De buiwd faiwed~",
    );
  });

  it("L3 leaves URLs alone", () => {
    expect(uwuify("See https://tauri.app/start/ for details.", { intensity: 3, ...noStutter })).toBe(
      "See https://tauri.app/start/ fow detaiws~",
    );
  });

  it("L0 is the identity", () => {
    const s = "Hello, world! Let's go. Really?";
    expect(uwuify(s, { intensity: 0 })).toBe(s);
  });

  it("is deterministic and never double-stutters", () => {
    const s = "Hello there. Hello there.";
    const a = uwuify(s, { intensity: 3, stutter: true });
    const b = uwuify(s, { intensity: 3, stutter: true });
    expect(a).toBe(b);
    expect(a).toMatch(/^(H-)?Hewwo dewe~ (H-)?Hewwo dewe~$/);
    expect(uwuify("H-Hello there.", { intensity: 3, stutter: true })).toBe("H-Hewwo dewe~");
  });

  it("never stutters protected words", () => {
    for (let seed = 0; seed < 8; seed++) {
      const out = uwuify("cargo build failed", { intensity: 3, stutter: true, seed });
      expect(out.startsWith("cargo buiwd")).toBe(true);
    }
  });

  it("stutters at least sometimes at L3", () => {
    const outs = new Set<string>();
    for (let seed = 0; seed < 16; seed++) {
      outs.add(uwuify("Hello there friend.", { intensity: 3, stutter: true, seed }));
    }
    expect([...outs].some((o) => o.startsWith("H-Hewwo"))).toBe(true);
  });

  it("appends an emoticon only at L3 when asked", () => {
    const l3 = uwuify("Done, darling.", { intensity: 3, stutter: false, appendEmoticon: true });
    expect(l3).toMatch(/^Donye, dawwing~ \S+/);
    const l2 = uwuify("Done, darling.", { intensity: 2, stutter: false, appendEmoticon: true });
    expect(l2).toBe("Donye, dawwing~");
    const colon = uwuify("Here you go:", { intensity: 3, stutter: false, appendEmoticon: true });
    expect(colon).toBe("Hewe you go:");
  });

  it("protects proper nouns mid-sentence and custom words", () => {
    expect(uwuify("Ask Lovro about Rust later.", { intensity: 1, ...noStutter })).toBe(
      "Ask Lovro about Rust watew.",
    );
    expect(uwuify("The reducer calls flush.", { intensity: 1, ...noStutter, protectWords: ["reducer"] })).toBe(
      "The reducer cawws fwush.",
    );
  });
});
