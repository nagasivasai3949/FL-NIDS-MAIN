/**
 * Dataset statistics and preprocessing (Section III-B of the paper).
 *
 * Pipeline in prepareDataset():
 *   1. drop rows with a missing label, remove very rare classes, subsample large files
 *   2. stratified train / test split (the test set is held out for global evaluation)
 *   3. handle missing values   (median / mean / drop rows)   - fitted on TRAIN only
 *   4. encode categorical cols (one-hot)                     - fitted on TRAIN only
 *   5. normalise numeric cols  (standard / min-max / none)   - fitted on TRAIN only
 * Fitting on the training split only avoids leaking test information into the model.
 */
import { makeRng } from './rng.js';

const MAX_CATEGORIES = 30;

export function suggestTarget(table) {
  const known = ['label', 'class', 'attack', 'attack_cat', 'target', 'category'];
  const hit = table.columns.find((c) => known.includes(c.name.toLowerCase()));
  return (hit || table.columns[table.columns.length - 1]).name;
}

const isMissing = (col, i) => (col.type === 'numeric' ? Number.isNaN(col.values[i]) : col.values[i] == null);
const labelText = (col, i) => (col.type === 'numeric' ? String(col.values[i]) : col.values[i]);

function median(arr) {
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function datasetStats(table, target) {
  const info = table.columns.map((col) => {
    let missing = 0;
    for (let i = 0; i < table.nRows; i++) if (isMissing(col, i)) missing++;
    const base = { name: col.name, type: col.type, missing, missing_pct: (missing / table.nRows) * 100 };
    if (col.type === 'numeric') {
      const vals = Array.from(col.values).filter((v) => !Number.isNaN(v));
      const n = vals.length || 1;
      const mean = vals.reduce((a, b) => a + b, 0) / n;
      const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
      let min = Infinity, max = -Infinity;
      for (const v of vals) { if (v < min) min = v; if (v > max) max = v; }
      return { ...base, unique: new Set(vals).size, mean, std, min: vals.length ? min : null, max: vals.length ? max : null };
    }
    const counts = new Map();
    for (const v of col.values) if (v != null) counts.set(v, (counts.get(v) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([value, count]) => ({ value, count }));
    return { ...base, unique: counts.size, top };
  });

  let classDistribution = null;
  const tcol = table.columns.find((c) => c.name === target);
  if (tcol) {
    const counts = new Map();
    for (let i = 0; i < table.nRows; i++) if (!isMissing(tcol, i)) counts.set(labelText(tcol, i), (counts.get(labelText(tcol, i)) || 0) + 1);
    classDistribution = [...counts.entries()].map(([name, count]) => ({ class: name, count })).sort((a, b) => b.count - a.count);
  }
  return {
    rows: table.nRows,
    columns: table.columns.length,
    numeric: info.filter((c) => c.type === 'numeric').length,
    categorical: info.filter((c) => c.type === 'categorical').length,
    missingCells: info.reduce((s, c) => s + c.missing, 0),
    info,
    classDistribution,
  };
}

export function prepareDataset(table, target, { missingStrategy = 'median', scaling = 'standard', testSize = 0.2, maxRows = 8000, seed = 42 } = {}) {
  const tcol = table.columns.find((c) => c.name === target);
  if (!tcol) throw new Error(`Target column '${target}' was not found in the dataset.`);
  const rng = makeRng(seed);
  const steps = [], warnings = [];

  // ---- 1. valid rows, class filtering, subsampling ----
  let rows = [];
  for (let i = 0; i < table.nRows; i++) if (!isMissing(tcol, i)) rows.push(i);
  const countOf = (rs) => {
    const m = new Map();
    for (const i of rs) m.set(labelText(tcol, i), (m.get(labelText(tcol, i)) || 0) + 1);
    return m;
  };
  let counts = countOf(rows);
  const rare = [...counts].filter(([, c]) => c < 10).map(([k]) => k);
  if (rare.length) {
    rows = rows.filter((i) => !rare.includes(labelText(tcol, i)));
    warnings.push(`Removed ${rare.length} class(es) with fewer than 10 samples: ${rare.slice(0, 5).join(', ')}`);
    counts = countOf(rows);
  }
  if (counts.size < 2) throw new Error('The target column needs at least 2 classes with 10+ samples each.');
  if (counts.size > 30) throw new Error(`Target '${target}' has ${counts.size} classes - it looks like a continuous or ID column, not a class label.`);

  if (rows.length > maxRows) {
    const frac = maxRows / rows.length;
    const byClass = new Map();
    for (const i of rows) {
      const k = labelText(tcol, i);
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k).push(i);
    }
    rows = [];
    for (const list of byClass.values()) rows.push(...rng.shuffle(list).slice(0, Math.max(10, Math.round(list.length * frac))));
    steps.push(`Subsampled to ${rows.length} rows (stratified) to keep browser training fast.`);
  }

  const classNames = [...countOf(rows).keys()].sort();
  const classIndex = new Map(classNames.map((c, i) => [c, i]));
  steps.push(`Encoded target '${target}' into ${classNames.length} classes.`);

  // ---- feature columns: drop constant / ID-like columns ----
  const features = [], dropped = [];
  for (const col of table.columns) {
    if (col.name === target) continue;
    const seen = new Set();
    for (const i of rows) { if (!isMissing(col, i)) { seen.add(col.values[i]); if (seen.size > MAX_CATEGORIES + 1 && col.type === 'categorical') break; } }
    if (seen.size <= 1) dropped.push(`${col.name} (constant)`);
    else if (col.type === 'categorical' && seen.size > MAX_CATEGORIES) dropped.push(`${col.name} (>${MAX_CATEGORIES} categories)`);
    else features.push(col);
  }
  if (dropped.length) warnings.push('Dropped columns: ' + dropped.join(', '));
  if (!features.length) throw new Error('No usable feature columns remain after cleaning.');
  const numCols = features.filter((c) => c.type === 'numeric');
  const catCols = features.filter((c) => c.type === 'categorical');

  // ---- 2. stratified split ----
  let train = [], test = [];
  const byClass = new Map();
  for (const i of rows) {
    const k = classIndex.get(labelText(tcol, i));
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k).push(i);
  }
  for (const list of byClass.values()) {
    rng.shuffle(list);
    const nTest = Math.max(1, Math.round(list.length * testSize));
    test.push(...list.slice(0, nTest));
    train.push(...list.slice(nTest));
  }
  rng.shuffle(train); rng.shuffle(test);
  steps.push(`Stratified split: ${train.length} train / ${test.length} test rows.`);

  // ---- 3. missing values ----
  const rowHasMissing = (i) => features.some((c) => isMissing(c, i));
  let nMissing = 0;
  for (const i of [...train, ...test]) for (const c of features) if (isMissing(c, i)) nMissing++;
  const fill = new Map();
  if (missingStrategy === 'drop') {
    train = train.filter((i) => !rowHasMissing(i));
    test = test.filter((i) => !rowHasMissing(i));
    steps.push(`Dropped rows containing missing values (${nMissing} missing cells).`);
  } else {
    for (const c of numCols) {
      const vals = train.map((i) => c.values[i]).filter((v) => !Number.isNaN(v));
      fill.set(c.name, vals.length ? (missingStrategy === 'median' ? median(vals) : vals.reduce((a, b) => a + b, 0) / vals.length) : 0);
    }
    for (const c of catCols) {
      const cnt = new Map();
      for (const i of train) if (c.values[i] != null) cnt.set(c.values[i], (cnt.get(c.values[i]) || 0) + 1);
      fill.set(c.name, [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'missing');
    }
    steps.push(`Filled ${nMissing} missing cells (${missingStrategy} for numeric, mode for categorical).`);
  }
  if (train.length < 20 || test.length < 5) throw new Error('Too few rows left after handling missing values.');

  // ---- 4. one-hot categories (from the training split) ----
  const categories = catCols.map((c) => {
    const s = new Set();
    for (const i of train) s.add(c.values[i] ?? fill.get(c.name));
    return [...s].sort();
  });
  const featureNames = [...numCols.map((c) => c.name), ...catCols.flatMap((c, j) => categories[j].map((v) => `${c.name}=${v}`))];
  const d = featureNames.length;
  if (catCols.length) steps.push(`One-hot encoded ${catCols.length} categorical column(s): ${catCols.map((c) => c.name).join(', ')}.`);

  // ---- 5. scaling statistics (train only) ----
  const scale = numCols.map((c) => {
    const vals = train.map((i) => c.values[i]).map((v) => (Number.isNaN(v) ? fill.get(c.name) : v));
    const n = vals.length;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
    let min = Infinity, max = -Infinity;
    for (const v of vals) { if (v < min) min = v; if (v > max) max = v; }
    return { mean, std, min, range: max - min || 1 };
  });
  if (scaling !== 'none' && numCols.length) steps.push(`Normalised ${numCols.length} numeric column(s) with ${scaling} scaling.`);

  const build = (idx) => {
    const X = new Float32Array(idx.length * d);
    const y = new Int32Array(idx.length);
    idx.forEach((i, r) => {
      const o = r * d;
      numCols.forEach((c, j) => {
        let v = c.values[i];
        if (Number.isNaN(v)) v = fill.get(c.name);
        if (scaling === 'standard') v = (v - scale[j].mean) / scale[j].std;
        else if (scaling === 'minmax') v = (v - scale[j].min) / scale[j].range;
        X[o + j] = Math.max(-10, Math.min(10, v)); // clip heavy tails for stable SGD
      });
      let pos = numCols.length;
      catCols.forEach((c, j) => {
        const v = c.values[i] ?? fill.get(c.name);
        const k = categories[j].indexOf(v);
        if (k >= 0) X[o + pos + k] = 1; // unseen category -> all zeros
        pos += categories[j].length;
      });
      y[r] = classIndex.get(labelText(tcol, i));
    });
    return { X, y };
  };
  const tr = build(train), te = build(test);
  const dist = (y) => { const a = new Array(classNames.length).fill(0); for (const v of y) a[v]++; return a; };

  return {
    data: { Xtr: tr.X, ytr: tr.y, Xte: te.X, yte: te.y, d, classNames, featureNames },
    summary: {
      target, missingStrategy, scaling,
      trainRows: tr.y.length, testRows: te.y.length, nFeatures: d, nClasses: classNames.length,
      classNames, trainDistribution: dist(tr.y), testDistribution: dist(te.y), steps, warnings,
    },
  };
}
