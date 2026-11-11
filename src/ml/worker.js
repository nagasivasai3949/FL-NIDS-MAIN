/**
 * Web Worker: runs all heavy training off the UI thread so the interface stays responsive.
 * The main thread sends { task, payload }; the worker answers with progress / done / error messages.
 *
 * tasks:  train   - one federated run (FedAvg or Median)
 *         compare - centralized + local ensemble + FedAvg + Median under the same settings
 *         sweep   - FedAvg vs Median while varying #malicious clients or the dropout rate
 */
import { buildClients, runFederated, runCentralized, runLocalEnsemble } from './federated.js';

const post = (msg) => self.postMessage(msg);

function setup({ data, parts, attack, train }) {
  const clients = buildClients(data, parts, attack, train.seed);
  const test = { X: data.Xte, y: data.yte, n: data.yte.length };
  return { clients, test, d: data.d, classNames: data.classNames };
}

const tasks = {
  train({ data, parts, attack, train }) {
    const env = setup({ data, parts, attack, train });
    const res = runFederated({
      ...env, algorithm: train.algorithm, cfg: train, attack,
      onRound: (rec) => post({ type: 'progress', frac: rec.round / train.rounds, message: `Round ${rec.round}/${train.rounds}`, round: rec }),
    });
    return { kind: 'train', ...res };
  },

  compare({ data, parts, attack, train }) {
    const env = setup({ data, parts, attack, train });
    const stages = 4;
    const report = (i, frac, message, round) => post({ type: 'progress', frac: (i + frac) / stages, message, stage: i, round });

    const centralized = runCentralized({
      data, test: env.test, cfg: train,
      onEpoch: (e, n) => report(0, e / n, `Centralized MLP: epoch ${e}/${n}`),
    });
    const localEnsemble = runLocalEnsemble({
      ...env, cfg: train, onClient: (k, n) => report(1, k / n, `Local models: client ${k}/${n}`),
    });
    const fedavg = runFederated({
      ...env, algorithm: 'fedavg', cfg: train, attack,
      onRound: (rec) => report(2, rec.round / train.rounds, `FedAvg: round ${rec.round}/${train.rounds}`, rec),
    });
    const median = runFederated({
      ...env, algorithm: 'median', cfg: train, attack,
      onRound: (rec) => report(3, rec.round / train.rounds, `Median: round ${rec.round}/${train.rounds}`, rec),
    });
    return { kind: 'compare', models: { centralized, local_ensemble: localEnsemble, fedavg, median } };
  },

  sweep({ data, parts, attack, train, sweep }) {
    const total = sweep.values.length * 2;
    const points = { fedavg: [], median: [] };
    let done = 0;
    for (const value of sweep.values) {
      const atk = { ...attack };
      if (sweep.param === 'malicious') atk.malicious = Array.from({ length: value }, (_, i) => i);
      else atk.dropoutRate = value;
      const env = setup({ data, parts, attack: atk, train });
      for (const algorithm of ['fedavg', 'median']) {
        const res = runFederated({ ...env, algorithm, cfg: train, attack: atk });
        const m = res.metrics;
        points[algorithm].push({ value, accuracy: m.accuracy, f1_macro: m.f1_macro, recall_macro: m.recall_macro, fpr_macro: m.fpr_macro });
        done++;
        post({ type: 'progress', frac: done / total, message: `${sweep.param === 'malicious' ? 'Malicious clients' : 'Dropout'} = ${value} - ${algorithm === 'fedavg' ? 'FedAvg' : 'Median'} done (${done}/${total})` });
      }
    }
    return { kind: 'sweep', param: sweep.param, values: sweep.values, points };
  },
};

self.onmessage = (e) => {
  const { task, payload } = e.data;
  try {
    post({ type: 'done', result: tasks[task](payload) });
  } catch (err) {
    post({ type: 'error', message: err.message || String(err) });
  }
};
