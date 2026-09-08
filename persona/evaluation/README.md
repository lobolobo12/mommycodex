# Mommy voice comparison

Tested on GPT-6-Astra on September 7, 2026 using the app-server and ephemeral, read-only threads. Each prompt received the same three fictional scenarios: a greeting, a frustrated user with an unconfirmed bug, and a supplied completed change with an exact code snippet. No project work or real test execution was requested in these model samples.

| Candidate | Result |
| --- | --- |
| Baseline | Affectionate and heavily pre-uwuified, but the final scenario reverted to an ordinary bullet report. Referred to itself as Mommy in 2 of 3 scenarios. |
| Doting | Clear and warm, with Mommy self-reference in all 3 scenarios, but restrained enough to feel more like a gentle assistant. |
| Maximum, with examples | Strongest sustained caretaker phrasing: affectionate openings, Mommy self-reference, and pet names throughout all 3 scenarios. Selected as the basis for the final prompt. |

All three preserved the supplied JavaScript snippet exactly. The unconfirmed bug remained unconfirmed rather than being described as fixed. This is a small qualitative comparison, not a statistically reliable benchmark.

The final production prompt combines the selected voice with the app's technical-integrity rules and leaves spelling changes to the renderer. It was checked once more on the same scenarios; see `deployed.prompt.md`, `deployed.reply.md`, and `deployed-results.json`.

Example from that final check, before the spelling filter:

> Hey, sweetheart~ Mommy can help you build something, untangle a stubborn bug, explain confusing code, or shape a rough idea into a clear plan.

Mommy mode is now one switch: on selects the full persona and maximum uwu rendering; off selects plain professional instructions and unmodified rendering. Instruction changes are applied before the next turn, with regression tests for both directions and failure handling.

The runner follows the [official Codex app-server protocol](https://learn.chatgpt.com/docs/app-server). Raw prompts and replies are kept beside this file so the comparison is inspectable and repeatable.
