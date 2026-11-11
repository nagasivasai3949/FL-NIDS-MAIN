import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { csvToTable } from '../ml/csv.js';
import { generateSampleTable } from '../ml/sampleData.js';
import { prepareDataset, suggestTarget } from '../ml/preprocess.js';
import { partitionData, distributionMatrix } from '../ml/partition.js';
import { parseHidden } from '../ml/federated.js';
import { runJob } from '../lib/engine.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const load = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; }
};
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

export const DEFAULT_CLIENTS = { numClients: 5, distribution: 'iid', alpha: 0.3, seed: 42 };
export const DEFAULT_TRAIN = { algorithm: 'fedavg', rounds: 10, localEpochs: 2, lr: 0.05, batchSize: 64, hidden: '64,32', seed: 42, clipNorm: 0, noiseStd: 0 };
export const DEFAULT_ATTACK = { malicious: [], flipFraction: 1, flipMode: 'shift', dropoutRate: 0 };
const IDLE = { status: 'idle', kind: null, label: '', progress: 0, message: '', history: [], error: null, stage: 0 };

export function AppProvider({ children }) {
  const [table, setTable] = useState(null);
  const [datasetName, setDatasetName] = useState('');
  const [target, setTarget] = useState('');
  const [prepared, setPrepared] = useState(null); // { data, summary }
  const [partition, setPartition] = useState(null); // { parts, matrix, cfg }
  const [clientCfg, setClientCfg] = useState(() => load('fl.clients', DEFAULT_CLIENTS));
  const [trainCfg, setTrainCfg] = useState(() => load('fl.train', DEFAULT_TRAIN));
  const [attackCfg, setAttackCfg] = useState(() => load('fl.attack', DEFAULT_ATTACK));
  const [experiments, setExperiments] = useState(() => { try { return JSON.parse(localStorage.getItem('fl.experiments') || '[]'); } catch { return []; } });
  const [job, setJob] = useState(IDLE);
  const handle = useRef(null);

  useEffect(() => save('fl.clients', clientCfg), [clientCfg]);
  useEffect(() => save('fl.train', trainCfg), [trainCfg]);
  useEffect(() => save('fl.attack', attackCfg), [attackCfg]);
  useEffect(() => save('fl.experiments', experiments), [experiments]);

  // ---------------- dataset ----------------
  const resetDerived = () => { setPrepared(null); setPartition(null); setAttackCfg((a) => ({ ...a, malicious: [] })); };

  const loadSample = useCallback((rows = 6000) => {
    const t = generateSampleTable(rows, 42);
    setTable(t); setDatasetName(`synthetic_nids_${rows}.csv`); setTarget(suggestTarget(t)); resetDerived();
  }, []);

  const loadFile = useCallback(async (file) => {
    if (!file) throw new Error('No file selected.');
    if (!/\.csv$/i.test(file.name)) throw new Error('Please upload a .csv file.');
    if (file.size > 60 * 1024 * 1024) throw new Error('File is larger than 60 MB. Please upload a smaller sample of the dataset.');
    const t = csvToTable(await file.text());
    setTable(t); setDatasetName(file.name); setTarget(suggestTarget(t)); resetDerived();
  }, []);

  const prepare = useCallback((opts) => {
    const res = prepareDataset(table, target, opts);
    setPrepared(res); setPartition(null); setAttackCfg((a) => ({ ...a, malicious: [] }));
    return res.summary;
  }, [table, target]);

  const configureClients = useCallback((cfg) => {
    if (!prepared) throw new Error('Prepare the dataset first (Dataset page).');
    const { data } = prepared;
    const parts = partitionData(data.ytr, data.classNames.length, cfg.numClients, cfg.distribution, cfg.alpha, cfg.seed);
    setClientCfg(cfg);
    setPartition({ parts, matrix: distributionMatrix(data.ytr, parts, data.classNames.length), cfg });
    setAttackCfg((a) => ({ ...a, malicious: a.malicious.filter((k) => k < cfg.numClients) }));
  }, [prepared]);

  // ---------------- jobs (training / comparison / sweep) ----------------
  const finishWith = (result, label, train, attack) => {
    const exp = {
      id: Date.now().toString(36), createdAt: new Date().toISOString(), kind: result.kind, label,
      dataset: datasetName, config: { train, attack, clients: partition.cfg }, result,
    };
    setExperiments((prev) => [exp, ...prev].slice(0, 25));
    return exp.id;
  };

  const validate = (train, attack) => {
    if (!prepared) return 'Prepare a dataset first (Dataset page).';
    if (!partition) return 'Create the federated clients first (Clients page).';
    if (!(train.rounds >= 1 && train.rounds <= 100)) return 'Rounds must be between 1 and 100.';
    if (!(train.localEpochs >= 1 && train.localEpochs <= 20)) return 'Local epochs must be between 1 and 20.';
    if (!(train.lr > 0 && train.lr <= 1)) return 'Learning rate must be in (0, 1].';
    if (!(train.batchSize >= 8 && train.batchSize <= 512)) return 'Batch size must be between 8 and 512.';
    if (train.clipNorm < 0 || train.noiseStd < 0) return 'Clipping norm and noise std cannot be negative.';
    try { parseHidden(train.hidden); } catch (e) { return e.message; }
    if (attack.dropoutRate < 0 || attack.dropoutRate > 0.9) return 'Dropout rate must be between 0 and 0.9.';
    if (attack.malicious.some((k) => k >= partition.parts.length)) return 'A malicious client id does not exist. Re-select malicious clients.';
    return null;
  };

  const startJob = useCallback((kind, label, extra = {}) => {
    if (job.status === 'running') return { ok: false, error: 'Another job is already running.' };
    const err = validate(trainCfg, attackCfg);
    if (err) { setJob({ ...IDLE, status: 'error', kind, label, error: err }); return { ok: false, error: err }; }

    setJob({ ...IDLE, status: 'running', kind, label, message: 'Starting...' });
    const payload = { data: prepared.data, parts: partition.parts, attack: attackCfg, train: trainCfg, ...extra };
    const { promise, cancel } = runJob(kind, payload, (msg) =>
      setJob((j) => (j.status !== 'running' ? j : {
        ...j, progress: msg.frac, message: msg.message, stage: msg.stage ?? j.stage,
        history: msg.round ? [...j.history.filter((h) => h.stage !== msg.stage || h.round !== msg.round.round), { ...msg.round, stage: msg.stage ?? 0 }] : j.history,
      })));
    handle.current = cancel;
    promise.then((result) => {
      const id = finishWith(result, label, trainCfg, attackCfg);
      setJob((j) => ({ ...j, status: 'done', progress: 1, message: 'Completed', resultId: id }));
    }).catch((e) => setJob((j) => ({ ...j, status: 'error', error: e.message })));
    return { ok: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.status, prepared, partition, trainCfg, attackCfg, datasetName]);

  const startTrain = useCallback(() => startJob('train', trainCfg.algorithm === 'median' ? 'Federated MLP (Median)' : 'Federated MLP (FedAvg)'), [startJob, trainCfg.algorithm]);
  const startCompare = useCallback(() => startJob('compare', 'Model comparison'), [startJob]);
  const startSweep = useCallback((param) => {
    const K = partition?.parts.length || 0;
    const values = param === 'malicious' ? Array.from({ length: K }, (_, i) => i) : [0, 0.2, 0.4, 0.6, 0.8];
    return startJob('sweep', param === 'malicious' ? 'Attack study: malicious clients' : 'Attack study: client dropout', { sweep: { param, values } });
  }, [startJob, partition]);

  const cancelJob = useCallback(() => {
    handle.current?.();
    setJob((j) => ({ ...j, status: 'cancelled', message: 'Stopped by user' }));
  }, []);

  const clearExperiments = useCallback(() => setExperiments([]), []);
  const deleteExperiment = useCallback((id) => setExperiments((p) => p.filter((e) => e.id !== id)), []);

  /** One-click demo: sample data -> prepare -> 5 IID clients. */
  const quickStart = useCallback(() => {
    const t = generateSampleTable(6000, 42);
    const res = prepareDataset(t, suggestTarget(t), { missingStrategy: 'median', scaling: 'standard', testSize: 0.2, maxRows: 8000, seed: 42 });
    const cfg = { ...DEFAULT_CLIENTS };
    const parts = partitionData(res.data.ytr, res.data.classNames.length, cfg.numClients, cfg.distribution, cfg.alpha, cfg.seed);
    setTable(t); setDatasetName('synthetic_nids_6000.csv'); setTarget(suggestTarget(t));
    setPrepared(res); setClientCfg(cfg);
    setPartition({ parts, matrix: distributionMatrix(res.data.ytr, parts, res.data.classNames.length), cfg });
    setAttackCfg((a) => ({ ...a, malicious: [] }));
  }, []);

  const value = {
    table, datasetName, target, setTarget, prepared, partition,
    clientCfg, trainCfg, setTrainCfg, attackCfg, setAttackCfg,
    experiments, job, setJob,
    loadSample, loadFile, prepare, configureClients,
    startTrain, startCompare, startSweep, cancelJob, clearExperiments, deleteExperiment, quickStart,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
