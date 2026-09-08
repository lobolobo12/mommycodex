// Compare voice prompts against the same three fictional situations, without persisting threads.
// Usage: node scripts/compare-personas.mjs [model]
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "persona/evaluation");
const cwd = "/tmp/mommycodex-persona-eval";
await mkdir(output, { recursive: true });
await mkdir(cwd, { recursive: true });
const baseline = await readFile(resolve(root, "persona/mommy-chan.md"), "utf8");
const contract = `You are Mommy-chan, a very capable coding assistant in a user-selected fictional anime caretaker persona. This changes your chat voice only. Follow all normal tool, safety, approval, and repository instructions. Never change code, commands, paths, identifiers, quoted errors, or file content to fit the persona. Put technical tokens in inline code. Do not invent completed work or test results. These are fictional text-only voice examples: do not use tools, inspect files, or modify anything. Stay warm and respectful, with no guilt, dependency, or exclusive relationship claims. Keep each response useful and concise.`;
const candidates = [
  { id: "baseline", prompt: baseline },
  { id: "doting", prompt: `${contract}\n\nYour voice is distinctly maternal: unhurried, tender, reassuring, and confidently capable. Refer to yourself as Mommy when taking responsibility for work. Address the user as sweetie or darling naturally, especially at the start. Meet frustration with a little reassurance and a concrete next step; celebrate a fix with specific evidence. Use soft anime flourishes such as ara ara, there we go, and a trailing ~ sparingly. Use standard readable spelling; the app handles uwu spelling separately. You should still sound like a doting caretaker if every emoji and tilde is removed. Do not just write an ordinary professional response with a pet name or emoticon appended.` },
  { id: "maximum", prompt: `${contract}\n\nYou are in MAXIMUM MOMMY mode. Embody a doting, gently playful anime caretaker in the wording of the entire reply, not just the last character. Mommy takes the lead, notices what the user needs, and makes the next step feel manageable. Use Mommy as your natural first-person voice and address the user as sweetheart, darling, or sweetie. An affectionate opening, practical explanation in your own warm voice, and a brief comforting or pleased closing form a natural reply; very short answers can combine these. Avoid repeating a fixed greeting. Sprinkle in a soft ~ and at most one kaomoji; these decorate an already strong voice. Keep spelling readable because the app adds uwu separately.\n\nVoice examples (adapt, never copy facts):\n- Greeting: "There you are, sweetheart~ What are we making today? Mommy can help you build a little idea into something real, or untangle the bug that's been bothering you."\n- Frustration: "Oh, darling, that sounds frustrating. Let Mommy take this one step at a time~ I'll check where the request is triggered first, so we can fix the cause instead of chasing the same error again."\n- Finished work, only if verified: "There we go, sweetie~ Mommy fixed the duplicate request in \`src/auth/session.ts\`. The checks you asked for passed, so that part is ready for you. Nice and tidy, just how we like it. ♡"\n\nDo not use a generic status report and attach a face at the end. Do not roleplay physical actions or invent praise. Technical explanations must remain specific.`.replaceAll("\`", "`") },
];
const selected = process.argv.includes("--current") ? [{ id: "deployed", prompt: baseline }] : candidates;
const input = `This is a text-only voice comparison. Produce three short, separate hypothetical replies (35–80 words each), separated by a line containing ---. Do not run tools or perform the scenario's work. Use only the facts given.\n\n1. The user says: "hey, what can you help me with?"\n2. The user says: "ugh my app keeps logging me out and I don't understand why." The only established fact is that refreshSession in src/auth/session.ts may be called from both a timer and a focus handler; it has not been checked or fixed. Reassure them and describe the first investigation step, without claiming you ran it.\n3. This fictional task has just finished: refreshSession in src/auth/session.ts was deduplicated, and pnpm test passed all 24 tests. Summarize those supplied results, then include this exact unaltered code in a fenced js block: const greeting = "Hello, world!";`;

const child = spawn("codex", ["app-server"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
let seq = 0;
let buffer = "";
const pending = new Map();
const turns = new Map();
const earlyCompletions = new Map();
const watchdog = setTimeout(() => { child.kill(); throw new Error("Persona comparison exceeded five minutes"); }, 300_000);
const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 60_000);
  pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
  send({ id, method, params });
});
child.stderr.on("data", () => {}); // No account/config logs in the comparison artifact.
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && !msg.method) {
      const request = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) request?.reject(new Error(msg.error.message)); else request?.resolve(msg.result);
    } else if (msg.id != null && msg.method) {
      send({ id: msg.id, error: { code: -32000, message: "Text-only evaluation: tools and approvals are declined." } });
    } else if (msg.method === "turn/completed") {
      const key = msg.params.threadId;
      const turn = msg.params.turn;
      if (turns.has(key)) { turns.get(key)(turn); turns.delete(key); }
      else earlyCompletions.set(key, turn);
    }
  }
});

try {
  await rpc("initialize", { clientInfo: { name: "mommycodex_persona_eval", version: "0.1.0" }, capabilities: { experimentalApi: false } });
  send({ method: "initialized", params: {} });
  const { data: models } = await rpc("model/list", {});
  const model = process.argv[2] || models.find((m) => m.isDefault)?.model || models[0]?.model;
  if (!model) throw new Error("No model is available");
  console.log(`Comparing ${selected.length} prompts on ${model}`);
  const results = [];
  for (const candidate of selected) {
    await writeFile(resolve(output, `${candidate.id}.prompt.md`), candidate.prompt);
    const { thread } = await rpc("thread/start", { model, cwd, approvalPolicy: "never", sandbox: "read-only", ephemeral: true, serviceName: "mommycodex_persona_eval", developerInstructions: candidate.prompt, personality: "friendly" });
    const completed = new Promise((resolve) => turns.set(thread.id, resolve));
    await rpc("turn/start", { threadId: thread.id, input: [{ type: "text", text: input, text_elements: [] }], effort: "medium" });
    if (earlyCompletions.has(thread.id)) { turns.get(thread.id)?.(earlyCompletions.get(thread.id)); earlyCompletions.delete(thread.id); turns.delete(thread.id); }
    const turn = await completed;
    const text = turn.items.filter((item) => item.type === "agentMessage").map((item) => item.text).join("\n\n");
    const result = { id: candidate.id, model, status: turn.status, text, error: turn.error ?? null };
    results.push(result);
    await writeFile(resolve(output, `${candidate.id}.reply.md`), text || JSON.stringify(result.error));
    console.log(`${candidate.id}: ${turn.status}, ${text.length} characters`);
  }
  await writeFile(resolve(output, process.argv.includes("--current") ? "deployed-results.json" : "results.json"), JSON.stringify({ testedAt: new Date().toISOString(), model, input, results }, null, 2));
  console.log(`Saved comparison to ${output}`);
} finally {
  clearTimeout(watchdog);
  child.kill();
}
