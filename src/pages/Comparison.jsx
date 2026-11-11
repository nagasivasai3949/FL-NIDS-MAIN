import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../context/AppContext.jsx';
import JobPanel from '../components/JobPanel.jsx';
import { Alert, Badge, Button, Card, COLORS, ConfusionMatrix, Empty, LinkButton, MODEL_LABELS, PageHeader, Select, Table, Td, pct, tooltipStyle } from '../components/ui.jsx';

const KEYS = ['centralized', 'local_ensemble', 'fedavg', 'median'];

export default function Comparison() {
  const { prepared, partition, job, experiments, startCompare, trainCfg, attackCfg } = useApp();
  const [cmKey, setCmKey] = useState('fedavg');
  const [error, setError] = useState('');
  const exp = useMemo(() => experiments.find((e) => e.kind === 'compare'), [experiments]);

  if (!prepared || !partition) {
    return (
      <>
        <PageHeader title="Model Comparison" />
        <Empty title="Clients not configured" action={<LinkButton to={!prepared ? '/dataset' : '/clients'} variant="primary">{!prepared ? 'Go to Dataset Management' : 'Go to Client Configuration'}</LinkButton>}>
          Prepare a dataset and create the federated clients before comparing models.
        </Empty>
      </>
    );
  }

  const running = job.status === 'running' && job.kind === 'compare';
  const stageNames = ['Centralized MLP', 'Local ensemble', 'FedAvg', 'Median'];
  const run = () => { setError(''); const r = startCompare(); if (!r.ok) setError(r.error); };
  const axis = { stroke: COLORS.axis, fontSize: 11 };
  const live = job.kind === 'compare' && job.status === 'running' ? job.history.filter((h) => h.stage >= 2) : [];

  let body = null;
  if (exp) {
    const models = exp.result.models;
    const metricRows = [['Accuracy', 'accuracy'], ['Precision', 'precision_macro'], ['Recall', 'recall_macro'], ['Macro F1', 'f1_macro']];
    const barData = metricRows.map(([label, key]) => ({ metric: label, ...Object.fromEntries(KEYS.map((k) => [k, models[k].metrics[key]])) }));
    const fprData = [{ metric: 'False-positive rate', ...Object.fromEntries(KEYS.map((k) => [k, models[k].metrics.fpr_macro])) }];
    const rounds = models.fedavg.history.map((h, i) => ({ round: h.round, FedAvg: h.accuracy, Median: models.median.history[i].accuracy }));
    const best = KEYS.reduce((a, k) => (models[k].metrics.f1_macro > models[a].metrics.f1_macro ? k : a), KEYS[0]);
    const a = exp.config.attack, c = exp.config.clients;
    const classNames = models.fedavg.metrics.per_class.map((x) => x.class);

    body = (
      <>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Latest comparison ({new Date(exp.createdAt).toLocaleTimeString()}):</span>
          <Badge tone="gray">{c.numClients} clients, {c.distribution === 'iid' ? 'IID' : `non-IID (alpha ${c.alpha})`}</Badge>
          <Badge tone={a.malicious.length ? 'red' : 'green'}>{a.malicious.length} malicious</Badge>
          <Badge tone={a.dropoutRate ? 'amber' : 'green'}>{Math.round(a.dropoutRate * 100)}% dropout</Badge>
          <Badge tone="gray">{exp.config.train.rounds} rounds x {exp.config.train.localEpochs} epochs</Badge>
          <Badge tone="cyan">Best macro F1: {MODEL_LABELS[best]}</Badge>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <Card title="Classification metrics" className="lg:col-span-2">
            <div className="h-80">
              <ResponsiveContainer>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="metric" {...axis} />
                  <YAxis {...axis} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                  <Tooltip {...tooltipStyle} formatter={(v) => pct(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {KEYS.map((k) => <Bar key={k} dataKey={k} name={MODEL_LABELS[k]} fill={COLORS[k]} radius={[3, 3, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="False-positive rate" subtitle="Lower is better">
            <div className="h-80">
              <ResponsiveContainer>
                <BarChart data={fprData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="metric" {...axis} />
                  <YAxis {...axis} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
                  <Tooltip {...tooltipStyle} formatter={(v) => pct(v)} />
                  {KEYS.map((k) => <Bar key={k} dataKey={k} name={MODEL_LABELS[k]} fill={COLORS[k]} radius={[3, 3, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card title="Result table" className="mt-6">
          <Table head={['Model', 'Accuracy', 'Precision', 'Recall', 'Macro F1', 'FPR', 'Time']}>
            {KEYS.map((k) => {
              const m = models[k].metrics;
              return (
                <tr key={k} className={k === best ? 'bg-cyan/5' : ''}>
                  <Td className="font-medium text-white"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k] }} />{MODEL_LABELS[k]}</Td>
                  <Td>{pct(m.accuracy)}</Td><Td>{pct(m.precision_macro)}</Td><Td>{pct(m.recall_macro)}</Td>
                  <Td className="font-semibold text-white">{pct(m.f1_macro)}</Td><Td>{pct(m.fpr_macro)}</Td>
                  <Td className="text-slate-400">{models[k].duration_s.toFixed(1)} s</Td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-3 text-xs text-slate-400">
            Centralized MLP is trained on all clean pooled training data (an upper-bound benchmark that needs data sharing). The local ensemble averages the predictions of independently trained client models
            ({models.local_ensemble.local_accuracies.map((x, i) => `C${i + 1}: ${pct(x, 1)}`).join(', ')}). Both baselines see the same number of total epochs as the federated runs.
          </p>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="FedAvg vs Median per round" subtitle="Test accuracy of the global model">
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={rounds} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="round" {...axis} />
                  <YAxis {...axis} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                  <Tooltip {...tooltipStyle} formatter={(v) => pct(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="FedAvg" stroke={COLORS.fedavg} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="Median" stroke={COLORS.median} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Confusion matrix" right={
            <div className="w-52"><Select value={cmKey} onChange={(e) => setCmKey(e.target.value)}>{KEYS.map((k) => <option key={k} value={k}>{MODEL_LABELS[k]}</option>)}</Select></div>}>
            <ConfusionMatrix matrix={models[cmKey].metrics.confusion} classNames={classNames} />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Model Comparison" subtitle="Compares four approaches on the same data split, using the current training and attack settings: centralized MLP, independent local-model ensemble, federated FedAvg and federated coordinate-wise median.">
        <Button variant="cyan" onClick={run} disabled={job.status === 'running'}>{running ? 'Running...' : 'Run comparison'}</Button>
      </PageHeader>

      <Card title="Settings used" subtitle="Change them on the Federated Learning, Clients and Attack Simulation pages.">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="gray">{partition.cfg.numClients} clients, {partition.cfg.distribution === 'iid' ? 'IID' : `non-IID (alpha ${partition.cfg.alpha})`}</Badge>
          <Badge tone="gray">{trainCfg.rounds} rounds x {trainCfg.localEpochs} local epochs</Badge>
          <Badge tone={attackCfg.malicious.length ? 'red' : 'green'}>{attackCfg.malicious.length} malicious client(s)</Badge>
          <Badge tone={attackCfg.dropoutRate ? 'amber' : 'green'}>{Math.round(attackCfg.dropoutRate * 100)}% dropout</Badge>
        </div>
        {error && <Alert type="error" className="mt-3">{error}</Alert>}
        {running && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {stageNames.map((s, i) => <Badge key={s} tone={i < job.stage ? 'green' : i === job.stage ? 'cyan' : 'gray'}>{i + 1}. {s}</Badge>)}
          </div>
        )}
        <div className="mt-4"><JobPanel kinds={['compare']} /></div>
      </Card>

      {live.length > 0 && (
        <Card title="Live federated progress" className="mt-6">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={live.map((h) => ({ round: h.round, accuracy: h.accuracy, stage: h.stage }))}>
                <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="round" {...axis} /><YAxis {...axis} domain={[0, 1]} />
                <Tooltip {...tooltipStyle} formatter={(v) => pct(v)} />
                <Line dataKey="accuracy" stroke={job.stage === 2 ? COLORS.fedavg : COLORS.median} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {body || (!running && (
        <div className="mt-6"><Empty title="No comparison yet" action={<Button variant="cyan" onClick={run}>Run comparison</Button>}>Trains all four models (about 10-20 seconds) and shows charts and tables. Results come from real training, never from stored numbers.</Empty></div>
      ))}
    </>
  );
}
