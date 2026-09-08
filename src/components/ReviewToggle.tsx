import { useAppStore } from '../codex/store';
import { useHarnessStore } from '../harness/state';

export default function ReviewToggle() {
  const enabled = useAppStore(s => s.settings.reviewBeforeKeeping);
  const taskBusy = useAppStore(s => !!s.activeTurn || s.submissionPending || s.threadLoading);
  const processing = useHarnessStore(s => s.busy);
  return <div className="review-preference">
    <button className={`toggle ${enabled ? 'on' : ''}`} role="switch" aria-label="Review before keeping changes" aria-checked={enabled} disabled={taskBusy || processing}
      onClick={() => useAppStore.getState().updateSettings({reviewBeforeKeeping: !enabled})}>
      Review before keeping changes
      <span className="switch-track" aria-hidden="true" />
      <span className="switch-label">{enabled ? 'On' : 'Off'}</span>
    </button>
    <p className="hint">{enabled
      ? 'Tasks wait for you to accept or discard their changes. Turn off to keep changes automatically.'
      : 'Changes stay in your project and tasks continue automatically. Any waiting proposal is applied before the next task. Undo stays available.'}</p>
  </div>;
}
