// Quick sanity test of the ML engine in Node (no browser needed): node scripts/engine-test.mjs
import { generateSampleTable } from '../src/ml/sampleData.js';
import { prepareDataset } from '../src/ml/preprocess.js';
import { partitionData, distributionMatrix } from '../src/ml/partition.js';
import { buildClients, runFederated, runCentralized, runLocalEnsemble } from '../src/ml/federated.js';

const table = generateSampleTable(6000, 42);
const { data, summary } = prepareDataset(table, 'label', { maxRows: 6000 });
console.log('prep:', summary.trainRows, summary.testRows, summary.nFeatures, summary.classNames.join(','));
const test = { X: data.Xte, y: data.yte, n: data.yte.length };
const cfg = { rounds: 10, localEpochs: 2, lr: 0.05, batchSize: 64, hidden: '64,32', seed: 42, clipNorm: 0, noiseStd: 0 };
const d = { ...data };

for (const mode of ['iid', 'non_iid']) {
  const parts = partitionData(data.ytr, data.classNames.length, 5, mode, 0.3, 42);
  console.log(mode, 'sizes', parts.map(p => p.length).join(','));
  if (mode === 'non_iid') console.log(distributionMatrix(data.ytr, parts, 5).map(r => r.join(' ')).join(' | '));
  for (const attack of [{ malicious: [], flipFraction: 1, flipMode: 'shift', dropoutRate: 0 },
                        { malicious: [0, 1], flipFraction: 1, flipMode: 'shift', dropoutRate: 0 },
                        { malicious: [], flipFraction: 1, flipMode: 'shift', dropoutRate: 0.4 }]) {
    const clients = buildClients(data, parts, attack, cfg.seed);
    for (const algorithm of ['fedavg', 'median']) {
      const t = Date.now();
      const r = runFederated({ clients, test, d: data.d, classNames: data.classNames, algorithm, cfg, attack });
      console.log(`  ${mode} mal=${attack.malicious.length} drop=${attack.dropoutRate} ${algorithm.padEnd(6)} acc=${r.metrics.accuracy.toFixed(3)} f1=${r.metrics.f1_macro.toFixed(3)} fpr=${r.metrics.fpr_macro.toFixed(3)} (${((Date.now()-t)/1000).toFixed(1)}s)`);
    }
  }
}
const parts = partitionData(data.ytr, 5, 5, 'iid', 0.3, 42);
const clients = buildClients(data, parts, { malicious: [] }, 42);
let t = Date.now();
const c = runCentralized({ data, test, cfg });
console.log('centralized', c.metrics.accuracy.toFixed(3), c.metrics.f1_macro.toFixed(3), ((Date.now()-t)/1000).toFixed(1)+'s');
const l = runLocalEnsemble({ clients, test, d: data.d, classNames: data.classNames, cfg });
console.log('local ens', l.metrics.accuracy.toFixed(3), l.metrics.f1_macro.toFixed(3), l.local_accuracies.map(a=>a.toFixed(2)).join(','));
