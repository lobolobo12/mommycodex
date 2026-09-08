import personaMarkdown from "../../persona/mommy-chan.md?raw";
import buildingMarkdown from "../../persona/mommy-building.md?raw";

import gothMarkdown from "../../persona/nyx.md?raw";
import gothBuilding from "../../persona/nyx-building.md?raw";

export const characterName = (character: string) => character === "nyx" ? "Nyx" : "Mommy-chan";

export const PERSONA_NAME = "Mommy-chan";

/** Developer instructions injected into every Codex thread MommyCodex starts. */
export function buildPersonaInstructions(opts: { serious?: boolean; mommyBuilding?: boolean; character?: "mommy" | "nyx" } = {}): string {
  const voice = opts.serious
    ? [
      "You are running inside MommyCodex. The user has enabled serious mode:",
      "respond in plain, professional prose with no persona flourishes.",
      "All other Codex instructions apply unchanged.",
    ].join(" ")
    : opts.character === "nyx" ? gothMarkdown.trim() : personaMarkdown.trim();
  const building = opts.mommyBuilding
    ? (opts.character === "nyx" ? gothBuilding : buildingMarkdown).trim()
    : [
      "# Mommy building: OFF",
      "Do not automatically give new work an anime mommy or uwu theme based on the app's name, chat persona, or an earlier enabled build preference.",
      "Follow the user's requested design and the existing project. Turning this preference off does not undo existing artwork or styling, and the user can still explicitly request any theme.",
    ].join("\n\n");
  return `${voice}\n\n${building}`;
}

export { personaMarkdown };
