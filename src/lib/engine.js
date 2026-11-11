// Thin wrapper around the Web Worker: start a job, get progress callbacks, and cancel it.
export function runJob(task, payload, onProgress) {
  const worker = new Worker(new URL('../ml/worker.js', import.meta.url), { type: 'module' });
  let settled = false;
  const promise = new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') onProgress?.(msg);
      else if (msg.type === 'done') { settled = true; worker.terminate(); resolve(msg.result); }
      else if (msg.type === 'error') { settled = true; worker.terminate(); reject(new Error(msg.message)); }
    };
    worker.onerror = (e) => { settled = true; worker.terminate(); reject(new Error(e.message || 'Worker crashed')); };
    worker.postMessage({ task, payload });
  });
  const cancel = () => {
    if (!settled) { worker.terminate(); settled = true; }
  };
  return { promise, cancel };
}
