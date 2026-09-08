export type ReviewerSetting = "user" | "auto_review";
export type SandboxSetting = "read-only" | "workspace-write" | "danger-full-access";

export type Character = "mommy" | "nyx";
export type CompanionPreferences = Pick<Settings, "seriousMode" | "mommyBuilding" | "ttsAutoRead" | "ttsSpeed" | "ttsFishModel" | "reactionVoice" | "companionNotes">;

export interface Settings {
  reactionVoice: boolean;
  companionNotes: string;
  reviewBeforeKeeping: boolean;
  threadCharacters: Record<string, Character>;
  lastCompanionThread: Partial<Record<Character, string>>;
  companionPreferences: Partial<Record<Character, CompanionPreferences>>;
  character: "mommy" | "nyx";
  seriousMode: boolean;
  mommyBuilding: boolean;
  ttsAutoRead: boolean;
  ttsSpeed: number;
  ttsFishModel: "s2.1-pro-free" | "s2.1-pro";
  lastCwd: string | null;
  model: string | null;
  effort: string | null;
  codexBinaryPath: string;
  reviewer: ReviewerSetting;
  sandbox: SandboxSetting;
  showReasoning: boolean;
  listAllProjects: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  character: "mommy",
  reactionVoice: false,
  companionNotes: "",
  reviewBeforeKeeping: true,
  threadCharacters: {},
  lastCompanionThread: {},
  companionPreferences: {},
  seriousMode: false,
  mommyBuilding: false,
  ttsAutoRead: false,
  ttsSpeed: 1,
  ttsFishModel: "s2.1-pro-free",
  lastCwd: null,
  model: null,
  effort: null,
  codexBinaryPath: "",
  reviewer: "user",
  sandbox: "workspace-write",
  showReasoning: true,
  listAllProjects: false,
};

const STORAGE_KEY = "mommycodex.settings.v1";

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed, character: parsed.character === "nyx" ? "nyx" : "mommy" };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode, quota); settings then live in memory only.
  }
}
