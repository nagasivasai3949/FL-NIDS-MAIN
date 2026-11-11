// Evaluation metrics: accuracy, macro precision / recall / F1, false-positive rate, confusion matrix.
const BENIGN_NAMES = new Set(['benign', 'normal', 'normal traffic', 'legitimate', '0']);

export function computeMetrics(yTrue, yPred, classNames) {
  const C = classNames.length;
  const n = yTrue.length;
  const cm = Array.from({ length: C }, () => new Array(C).fill(0)); // rows = actual, cols = predicted
  for (let i = 0; i < n; i++) cm[yTrue[i]][yPred[i]]++;

  const per = [];
  let correct = 0;
  for (let c = 0; c < C; c++) {
    const tp = cm[c][c];
    let fp = 0, fn = 0;
    for (let k = 0; k < C; k++) {
      if (k !== c) { fp += cm[k][c]; fn += cm[c][k]; }
    }
    const tn = n - tp - fp - fn;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0; // one-vs-rest false-positive rate
    correct += tp;
    per.push({ class: classNames[c], precision, recall, f1, fpr, support: tp + fn });
  }
  const mean = (key) => per.reduce((s, r) => s + r[key], 0) / C;

  const result = {
    accuracy: n ? correct / n : 0,
    precision_macro: mean('precision'),
    recall_macro: mean('recall'),
    f1_macro: mean('f1'),
    fpr_macro: mean('fpr'),
    per_class: per,
    confusion: cm,
    binary_fpr: null,
    binary_detection_rate: null,
  };

  // Intrusion-detection view: Benign vs "any attack"
  const benign = classNames.findIndex((c) => BENIGN_NAMES.has(String(c).trim().toLowerCase()));
  if (benign >= 0) {
    let nBenign = 0, nAttack = 0, falseAlarms = 0, detected = 0;
    for (let i = 0; i < n; i++) {
      if (yTrue[i] === benign) { nBenign++; if (yPred[i] !== benign) falseAlarms++; }
      else { nAttack++; if (yPred[i] !== benign) detected++; }
    }
    if (nBenign) result.binary_fpr = falseAlarms / nBenign;
    if (nAttack) result.binary_detection_rate = detected / nAttack;
  }
  return result;
}
