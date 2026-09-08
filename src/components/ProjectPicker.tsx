import { open } from "@tauri-apps/plugin-dialog";
import { session } from "../codex/session";
import { useAppStore } from "../codex/store";
import { errorMessage } from "../codex/transport";

export async function pickProjectFolder() {
  const store = useAppStore.getState();
  if (store.submissionPending || store.threadLoading) return;
  try {
    const dir = await open({ directory: true, multiple: false, defaultPath: store.cwd ?? undefined, title: "Pick a project folder" });
    if (typeof dir === "string" && dir) await session.setCwd(dir);
  } catch (error) {
    store.pushToast("error", errorMessage(error));
  }
}
