import { useApp } from '../context/AppContext.jsx';
import { Alert, Button, Progress } from './ui.jsx';

/** Progress bar, stop button and error message for a running job of the given kind(s). */
export default function JobPanel({ kinds }) {
  const { job, cancelJob } = useApp();
  if (!kinds.includes(job.kind) && job.status !== 'error') return null;
  if (job.status === 'error' && job.kind && !kinds.includes(job.kind)) return null;
  return (
    <div className="space-y-3">
      {job.status === 'running' && (
        <div className="flex items-end gap-4 rounded-lg bg-navy-900 p-4">
          <div className="flex-1"><Progress value={job.progress} label={job.message} /></div>
          <Button variant="danger" onClick={cancelJob}>Stop</Button>
        </div>
      )}
      {job.status === 'cancelled' && <Alert type="warn">Run stopped. No result was saved.</Alert>}
      {job.status === 'error' && <Alert type="error" title="Could not run">{job.error}</Alert>}
    </div>
  );
}
