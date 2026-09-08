import { useAppStore } from "../codex/store";
import Icon from "./Icon";
import { Diff } from "./ToolCard";

export default function TaskActivity() {
  const activity = useAppStore((s) => s.activeThreadId ? s.activityByThread[s.activeThreadId] : undefined);
  const active = useAppStore(s=>s.activeTurn?.threadId===s.activeThreadId ? s.activeTurn : null);
  const pending = useAppStore(s=>s.pendingRequests.length);
  const submitting = useAppStore(s=>s.submissionPending);
  const status = useAppStore(s=>s.lastTurnStatus);
  if (!activity && !active && !submitting) return null;
  const completed = activity?.plan.filter((step) => step.status === "completed").length ?? 0;
  return <div className="task-activity" aria-label="Task plan and changes" key={activity?.turnId}>
    <div className="task-status" role="status">{pending ? 'Waiting for your input' : active || submitting ? 'Working on your task' : status==='completed' ? 'Task finished · review the results below' : status==='interrupted' ? 'Task stopped' : 'Task needs attention'}</div>
    {!!activity?.plan.length && <details className="task-plan" open>
      <summary><Icon name="plan" size={15} /><b>Task plan</b><span>{completed}/{activity?.plan.length} complete</span><Icon name="chevron" size={12} /></summary>
      <div className="task-plan-body">
        {activity?.explanation && <p>{activity?.explanation}</p>}
        <ol>{activity?.plan.map((step, index) => <li key={index} data-status={step.status}>
          <span className="plan-step-icon" aria-label={step.status === "inProgress" ? "In progress" : step.status}>{step.status === "completed" ? <Icon name="check" size={13} /> : step.status === "inProgress" ? <Icon name="activity" size={13} /> : <span className="dot" />}</span>
          <span>{step.step}</span>
        </li>)}</ol>
      </div>
    </details>}
    {!activity?.plan.length && (active||submitting) && <ol className="task-fallback"><li>✓ Request received</li><li>{pending ? '○ Waiting for your input' : '◉ Working through the request'}</li><li>○ Results and file review</li></ol>}
    {activity?.diff && <details className="task-changes">
      <summary><Icon name="edit" size={15} /><b>Changes in this task</b><span>View diff</span><Icon name="chevron" size={12} /></summary>
      <Diff diff={activity?.diff} />
    </details>}
  </div>;
}
