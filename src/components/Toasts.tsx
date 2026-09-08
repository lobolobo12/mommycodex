import { useAppStore } from "../codex/store";

export default function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)} title="Click to dismiss">
          {t.kind === "error" ? "(´；ω；｀) " : t.kind === "warning" ? "(・_・;) " : "♡ "}
          {t.text}
        </div>
      ))}
    </div>
  );
}
