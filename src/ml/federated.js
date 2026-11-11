/**
 * Federated learning core (Section III of the paper).
 *
 *   for every communication round t:
 *     1. server sends global weights w_t to the participating clients
 *     2. each client k runs LocalTrain(w_t, D_k) -> w_{t+1}^(k)       (local MLP training)
 *     3. server aggregates the received weights
 *          FedAvg : w_{t+1} = sum_k (n_k / N) * w_{t+1}^(k)             (sample-weighted mean)
 *          Median : w_{t+1}[j] = median_k ( w_{t+1}^(k)[j] )           (coordinate-wise)
 *
 * Robustness settings: IID / non-IID data, label-flipping clients, client dropout,
 * and (optional) update clipping + Gaussian noise, as mentioned in Section IV-D.
 */
import { MLP, argmaxRows } from './mlp.js';
import { makeRng } from './rng.js';
import { computeMetrics } from './metrics.js';

export function parseHidden(text) {
  const sizes = String(text).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (!sizes.length || sizes.length > 4 || sizes.some((n) => n > 512)) {
    throw new Error("Hidden layers must look like '64,32' (1-4 layers, each 1-512 units).");
  }
  return sizes;
}

/** Label-flipping attack: a malicious client trains on corrupted labels. */
export function flipLabels(y, nClasses, fraction, mode, rng) {
  const out = Int32Array.from(y);
  for (let i = 0; i < out.length; i++) {
    if (rng.next() >= fraction) continue;
    if (mode === 'random') out[i] = (out[i] + 1 + rng.int(nClasses - 1)) % nClasses; // any other class
    else out[i] = (out[i] + 1) % nClasses; // 'shift': class c becomes c+1
  }
  return out;
}

/** Builds each client's local dataset; malicious clients get flipped labels. */
export function buildClients(data, parts, attack, seed) {
  const { Xtr, ytr, d, classNames } = data;
  const malicious = new Set(attack.malicious || []);
  return parts.map((idx, k) => {
    const n = idx.length;
    const X = new Float32Array(n * d);
    let y = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      X.set(Xtr.subarray(idx[i] * d, (idx[i] + 1) * d), i * d);
      y[i] = ytr[idx[i]];
    }
    const isMal = malicious.has(k);
    if (isMal) y = flipLabels(y, classNames.length, attack.flipFraction, attack.flipMode, makeRng(seed + 31 * (k + 1)));
    return { id: k, X, y, n, malicious: isMal };
  });
}

/** Which clients take part in every round (the rest "drop out"). Same seed => same schedule. */
export function participationSchedule(nClients, rounds, dropoutRate, seed) {
  const rng = makeRng(seed + 999);
  return Array.from({ length: rounds }, () => {
    const on = [];
    for (let k = 0; k < nClients; k++) if (rng.next() >= dropoutRate) on.push(k);
    return on.length ? on : [rng.int(nClients)]; // at least one client must participate
  });
}

export function aggregateFedAvg(updates, weights) {
  const out = new Float32Array(updates[0].length);
  const total = weights.reduce((a, b) => a + b, 0);
  updates.forEach((u, k) => {
    const w = weights[k] / total;
    for (let j = 0; j < out.length; j++) out[j] += w * u[j];
  });
  return out;
}

export function aggregateMedian(updates) {
  const m = updates.length;
  const out = new Float32Array(updates[0].length);
  const tmp = new Float32Array(m);
  for (let j = 0; j < out.length; j++) {
    for (let k = 0; k < m; k++) tmp[k] = updates[k][j];
    tmp.sort();
    out[j] = m % 2 ? tmp[(m - 1) / 2] : (tmp[m / 2 - 1] + tmp[m / 2]) / 2;
  }
  return out;
}

function evaluate(model, test, classNames) {
  const pred = model.predict(test.X, test.n);
  const m = computeMetrics(test.y, pred, classNames);
  m.loss = model.evaluateLoss(test.X, test.y, test.n);
  return m;
}

function modelSizes(d, hidden, nClasses) {
  return [d, ...parseHidden(hidden), nClasses];
}

/** Federated training with FedAvg or coordinate-wise median. */
export function runFederated({ clients, test, d, classNames, algorithm, cfg, attack, onRound }) {
  const t0 = Date.now();
  const sizes = modelSizes(d, cfg.hidden, classNames.length);
  const global = new MLP(sizes, makeRng(cfg.seed));
  const local = new MLP(sizes);
  let globalW = global.getFlat();
  const schedule = participationSchedule(clients.length, cfg.rounds, attack.dropoutRate || 0, cfg.seed);
  const history = [];
  let uploads = 0;

  for (let r = 0; r < cfg.rounds; r++) {
    const updates = [], weights = [], losses = [];
    for (const k of schedule[r]) {
      const c = clients[k];
      local.setFlat(globalW);
      const epochLosses = local.fit(c.X, c.y, c.n, {
        epochs: cfg.localEpochs, lr: cfg.lr, batchSize: cfg.batchSize,
        rng: makeRng(cfg.seed * 7919 + r * 131 + k),
      });
      let w = local.getFlat();

      // optional update protection: clip the update norm and add Gaussian noise
      if (cfg.clipNorm > 0 || cfg.noiseStd > 0) {
        const delta = new Float32Array(w.length);
        let norm = 0;
        for (let j = 0; j < w.length; j++) { delta[j] = w[j] - globalW[j]; norm += delta[j] * delta[j]; }
        norm = Math.sqrt(norm);
        const scale = cfg.clipNorm > 0 && norm > cfg.clipNorm ? cfg.clipNorm / norm : 1;
        const nrng = makeRng(cfg.seed * 104729 + r * 977 + k);
        for (let j = 0; j < w.length; j++) {
          w[j] = globalW[j] + delta[j] * scale + (cfg.noiseStd > 0 ? nrng.normal() * cfg.noiseStd : 0);
        }
      }
      updates.push(w); weights.push(c.n); losses.push(epochLosses[epochLosses.length - 1]);
    }
    uploads += updates.length;
    globalW = algorithm === 'median' ? aggregateMedian(updates) : aggregateFedAvg(updates, weights);

    global.setFlat(globalW);
    const m = evaluate(global, test, classNames);
    const totalN = weights.reduce((a, b) => a + b, 0);
    const rec = {
      round: r + 1,
      test_loss: m.loss, accuracy: m.accuracy, f1_macro: m.f1_macro,
      train_loss: losses.reduce((s, l, i) => s + l * weights[i], 0) / totalN,
      participants: schedule[r], n_participants: schedule[r].length,
    };
    history.push(rec);
    if (onRound) onRound(rec);
  }

  const bytesPerModel = global.nParams * 4;
  const finalMetrics = evaluate(global, test, classNames);
  return {
    algorithm, history, metrics: finalMetrics,
    payload: {
      n_params: global.nParams, bytes_per_model: bytesPerModel,
      // every participating client downloads the global model and uploads its update
      total_bytes: bytesPerModel * uploads * 2, uploads,
    },
    duration_s: (Date.now() - t0) / 1000,
  };
}

/** Baseline 1: one MLP trained on ALL (clean) training data pooled together. */
export function runCentralized({ data, test, cfg, onEpoch }) {
  const t0 = Date.now();
  const { Xtr, ytr, d, classNames } = data;
  const model = new MLP(modelSizes(d, cfg.hidden, classNames.length), makeRng(cfg.seed));
  const epochs = cfg.rounds * cfg.localEpochs; // same total number of passes over the data
  const history = [];
  for (let e = 0; e < epochs; e++) {
    const [loss] = model.fit(Xtr, ytr, ytr.length, {
      epochs: 1, lr: cfg.lr, batchSize: cfg.batchSize, rng: makeRng(cfg.seed * 31 + e),
    });
    const m = evaluate(model, test, classNames);
    history.push({ epoch: e + 1, train_loss: loss, test_loss: m.loss, accuracy: m.accuracy, f1_macro: m.f1_macro });
    if (onEpoch) onEpoch(e + 1, epochs);
  }
  return { algorithm: 'centralized', history, metrics: evaluate(model, test, classNames), duration_s: (Date.now() - t0) / 1000 };
}

/** Baseline 2: every client trains alone; predictions are the average of all client models. */
export function runLocalEnsemble({ clients, test, d, classNames, cfg, onClient }) {
  const t0 = Date.now();
  const C = classNames.length;
  const sum = new Float32Array(test.n * C);
  const localAcc = [];
  clients.forEach((c, k) => {
    const model = new MLP(modelSizes(d, cfg.hidden, C), makeRng(cfg.seed + k + 1));
    model.fit(c.X, c.y, c.n, {
      epochs: cfg.rounds * cfg.localEpochs, lr: cfg.lr, batchSize: cfg.batchSize, rng: makeRng(cfg.seed * 17 + k),
    });
    const probs = model.predictProba(test.X, test.n);
    for (let i = 0; i < sum.length; i++) sum[i] += probs[i];
    localAcc.push(computeMetrics(test.y, argmaxRows(probs, test.n, C), classNames).accuracy);
    if (onClient) onClient(k + 1, clients.length);
  });
  const pred = argmaxRows(sum, test.n, C);
  return {
    algorithm: 'local_ensemble', metrics: computeMetrics(test.y, pred, classNames),
    local_accuracies: localAcc, duration_s: (Date.now() - t0) / 1000,
  };
}
