import { installReactions } from "./speech/reactions";
import { dictation, useDictationStore } from "./speech/dictation";
import Workbench from "./components/Workbench";
import { useHarnessStore } from "./harness/state";
import { installHarness } from "./harness/controller";
import { useEffect } from "react";
import { session } from "./codex/session";
import ApprovalModal from "./components/ApprovalModal";
import ChatPane from "./components/ChatPane";
import MascotPanel from "./components/Mascot";
import Sidebar from "./components/Sidebar";
import Toasts from "./components/Toasts";
import TopBar from "./components/TopBar";
import { speech, useSpeechStore } from "./speech/controller";
import { useAppStore } from "./codex/store";

export default function App() {
  const workbenchOpen = useHarnessStore(s => s.open);
  const character = useAppStore(s => s.settings.character);
  // The whole palette keys off this attribute (see theme.css): Mommy-chan pastel, Nyx midnight goth.
  useEffect(() => {
    document.documentElement.dataset.character = character;
  }, [character]);
  useEffect(() => {
    installHarness();
    session.boot().catch(() => undefined);
  }, []);

  useEffect(() => installReactions(), []);

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (!useSpeechStore.getState().activeKey) return;
      if (state.settings.character !== previous.settings.character || state.activeThreadId !== previous.activeThreadId ||
          (state.activeTurn?.turnId && state.activeTurn.turnId !== previous.activeTurn?.turnId) ||
          (!state.settings.ttsAutoRead && previous.settings.ttsAutoRead && useSpeechStore.getState().source === "auto")) void speech.stop();
    });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && useDictationStore.getState().status !== "idle") {event.preventDefault(); event.stopPropagation(); dictation.cancel(); return;}
      if (event.key === "Escape" && useSpeechStore.getState().activeKey) {
        event.preventDefault(); event.stopPropagation(); void speech.stop();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      unsubscribe(); window.removeEventListener("keydown", escape, true);
      if (useSpeechStore.getState().activeKey) void speech.stop();
    };
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <ChatPane />
        {workbenchOpen ? <Workbench /> : <MascotPanel />}
      </div>
      <ApprovalModal />
      <Toasts />
    </div>
  );
}
