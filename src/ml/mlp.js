/**
 * Multilayer Perceptron (MLP) in plain JavaScript.
 *
 *   input -> [Dense + ReLU] x hidden layers -> Dense -> Softmax,  loss = cross-entropy
 *   optimiser = mini-batch SGD with momentum
 *
 * ALL weights and biases live in ONE flat Float32Array (`this.p`). That makes federated
 * learning simple: a client "model update" is just a flat vector, and the server
 * aggregates vectors with FedAvg (weighted mean) or coordinate-wise median.
 *
 * Data layout: X is a flat Float32Array of size n*d (row-major), y is an Int32Array.
 */
export class MLP {
  constructor(sizes, rng = null) {
    this.sizes = sizes;
    this.layers = [];
    let off = 0;
    for (let i = 0; i < sizes.length - 1; i++) {
      const nin = sizes[i];
      const nout = sizes[i + 1];
      this.layers.push({ wOff: off, bOff: off + nin * nout, nin, nout });
      off += nin * nout + nout;
    }
    this.nParams = off;
    this.p = new Float32Array(off);
    if (rng) {
      // He initialisation (good for ReLU)
      for (const L of this.layers) {
        const std = Math.sqrt(2 / L.nin);
        for (let i = 0; i < L.nin * L.nout; i++) this.p[L.wOff + i] = rng.normal() * std;
      }
    }
  }

  getFlat() { return this.p.slice(); }
  setFlat(flat) { this.p.set(flat); }

  _alloc(n) {
    return this.layers.map((L) => new Float32Array(n * L.nout));
  }

  /** Forward pass for n rows. acts[l] receives the output of layer l (last = logits). */
  _forward(X, n, acts) {
    const p = this.p;
    let prev = X;
    for (let l = 0; l < this.layers.length; l++) {
      const { wOff, bOff, nin, nout } = this.layers[l];
      const out = acts[l];
      for (let i = 0; i < n; i++) {
        const o = i * nout;
        for (let j = 0; j < nout; j++) out[o + j] = p[bOff + j];
        for (let k = 0; k < nin; k++) {
          const a = prev[i * nin + k];
          if (a === 0) continue;
          const w = wOff + k * nout;
          for (let j = 0; j < nout; j++) out[o + j] += a * p[w + j];
        }
      }
      if (l < this.layers.length - 1) {
        for (let i = 0; i < n * nout; i++) if (out[i] < 0) out[i] = 0; // ReLU
      }
      prev = out;
    }
  }

  /** In-place softmax over the logits of n rows. */
  _softmax(logits, n, C) {
    for (let i = 0; i < n; i++) {
      const o = i * C;
      let max = -Infinity;
      for (let j = 0; j < C; j++) if (logits[o + j] > max) max = logits[o + j];
      let sum = 0;
      for (let j = 0; j < C; j++) {
        logits[o + j] = Math.exp(logits[o + j] - max);
        sum += logits[o + j];
      }
      for (let j = 0; j < C; j++) logits[o + j] /= sum;
    }
  }

  /** Class probabilities for n rows (processed in chunks to save memory). */
  predictProba(X, n) {
    const d = this.sizes[0];
    const C = this.sizes[this.sizes.length - 1];
    const out = new Float32Array(n * C);
    const chunk = 1024;
    const acts = this._alloc(chunk);
    for (let s = 0; s < n; s += chunk) {
      const m = Math.min(chunk, n - s);
      this._forward(X.subarray(s * d, (s + m) * d), m, acts);
      const logits = acts[acts.length - 1];
      this._softmax(logits, m, C);
      out.set(logits.subarray(0, m * C), s * C);
    }
    return out;
  }

  predict(X, n) {
    return argmaxRows(this.predictProba(X, n), n, this.sizes[this.sizes.length - 1]);
  }

  /** Mean cross-entropy loss and accuracy on a dataset. */
  evaluateLoss(X, y, n) {
    const C = this.sizes[this.sizes.length - 1];
    const probs = this.predictProba(X, n);
    let loss = 0;
    for (let i = 0; i < n; i++) loss -= Math.log(probs[i * C + y[i]] + 1e-9);
    return loss / n;
  }

  /** Mini-batch SGD with momentum. Returns the mean training loss of every epoch. */
  fit(X, y, n, { epochs = 1, lr = 0.05, batchSize = 64, momentum = 0.9, rng }) {
    const d = this.sizes[0];
    const C = this.sizes[this.sizes.length - 1];
    const bs = Math.min(batchSize, n);
    const acts = this._alloc(bs);
    const dzs = this._alloc(bs);
    const Xb = new Float32Array(bs * d);
    const yb = new Int32Array(bs);
    const grad = new Float32Array(this.nParams);
    const vel = new Float32Array(this.nParams);
    const order = new Int32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    const p = this.p;
    const epochLosses = [];

    for (let e = 0; e < epochs; e++) {
      // shuffle sample order
      for (let i = n - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
      let total = 0, batches = 0;
      for (let s = 0; s < n; s += bs) {
        const m = Math.min(bs, n - s);
        for (let i = 0; i < m; i++) {
          const src = order[s + i];
          Xb.set(X.subarray(src * d, (src + 1) * d), i * d);
          yb[i] = y[src];
        }
        this._forward(Xb, m, acts);
        const probs = acts[acts.length - 1];
        this._softmax(probs, m, C);

        // loss + gradient of loss w.r.t. logits: (softmax - onehot) / m
        const dz = dzs[dzs.length - 1];
        let batchLoss = 0;
        for (let i = 0; i < m; i++) {
          batchLoss -= Math.log(probs[i * C + yb[i]] + 1e-9);
          for (let j = 0; j < C; j++) dz[i * C + j] = (probs[i * C + j] - (j === yb[i] ? 1 : 0)) / m;
        }

        // backward pass
        grad.fill(0);
        for (let l = this.layers.length - 1; l >= 0; l--) {
          const { wOff, bOff, nin, nout } = this.layers[l];
          const input = l === 0 ? Xb : acts[l - 1];
          const dzl = dzs[l];
          for (let i = 0; i < m; i++) {
            for (let j = 0; j < nout; j++) grad[bOff + j] += dzl[i * nout + j];
            for (let k = 0; k < nin; k++) {
              const a = input[i * nin + k];
              if (a === 0) continue;
              const g = wOff + k * nout;
              for (let j = 0; j < nout; j++) grad[g + j] += a * dzl[i * nout + j];
            }
          }
          if (l > 0) {
            const dprev = dzs[l - 1];
            for (let i = 0; i < m; i++) {
              for (let k = 0; k < nin; k++) {
                let sum = 0;
                const w = wOff + k * nout;
                for (let j = 0; j < nout; j++) sum += dzl[i * nout + j] * p[w + j];
                dprev[i * nin + k] = input[i * nin + k] > 0 ? sum : 0; // ReLU derivative
              }
            }
          }
        }

        // SGD with momentum
        for (let i = 0; i < this.nParams; i++) {
          vel[i] = momentum * vel[i] - lr * grad[i];
          p[i] += vel[i];
        }
        total += batchLoss / m;
        batches++;
      }
      epochLosses.push(total / batches);
    }
    return epochLosses;
  }
}

export function argmaxRows(probs, n, C) {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let j = 1; j < C; j++) if (probs[i * C + j] > probs[i * C + best]) best = j;
    out[i] = best;
  }
  return out;
}
