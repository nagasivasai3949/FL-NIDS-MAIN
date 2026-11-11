import { makeRng } from './rng.js';

/**
 * Split the training samples among federated clients.
 *
 *  IID      : every class is shuffled and dealt out evenly -> same class mix on each client.
 *  non-IID  : label skew with a Dirichlet(alpha) distribution per class.
 *             small alpha (0.1) = very skewed clients, large alpha (10) = almost IID.
 *
 * Returns an array with one Int32Array of sample indices per client.
 */
export function partitionData(y, nClasses, nClients, mode = 'iid', alpha = 0.3, seed = 42, minSize = 10) {
  const rng = makeRng(seed);
  if (y.length < nClients * minSize) throw new Error('Not enough training samples for that many clients.');

  const byClass = Array.from({ length: nClasses }, () => []);
  for (let i = 0; i < y.length; i++) byClass[y[i]].push(i);

  const build = (proportionsFor) => {
    const parts = Array.from({ length: nClients }, () => []);
    for (let c = 0; c < nClasses; c++) {
      const idx = rng.shuffle(byClass[c].slice());
      const props = proportionsFor();
      let start = 0, acc = 0;
      for (let k = 0; k < nClients; k++) {
        acc += props[k];
        const end = k === nClients - 1 ? idx.length : Math.round(acc * idx.length);
        for (let i = start; i < Math.max(end, start); i++) parts[k].push(idx[i]);
        start = Math.max(end, start);
      }
    }
    return parts;
  };

  if (mode === 'iid') {
    const parts = build(() => new Array(nClients).fill(1 / nClients));
    return parts.map((p) => Int32Array.from(p));
  }
  if (mode !== 'non_iid') throw new Error("Distribution must be 'iid' or 'non_iid'.");

  for (let attempt = 0; attempt < 200; attempt++) {
    const parts = build(() => rng.dirichlet(alpha, nClients));
    if (Math.min(...parts.map((p) => p.length)) >= minSize) return parts.map((p) => Int32Array.from(p));
  }
  throw new Error('Could not create non-IID partitions with enough samples per client. Try a larger alpha or fewer clients.');
}

/** clients x classes table of sample counts (for the distribution chart). */
export function distributionMatrix(y, parts, nClasses) {
  return parts.map((idx) => {
    const row = new Array(nClasses).fill(0);
    for (const i of idx) row[y[i]]++;
    return row;
  });
}
