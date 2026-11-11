import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import JobPanel from '../components/JobPanel.jsx';
import { Badge, Button, Card, COLORS, Empty, Field, Input, LinkButton, NumberInput, PageHeader, Table, Td, pct, tooltipStyle } from '../components/ui.jsx';

const ALGOS = [
  { id: 'fedavg', name: 'FedAvg', formula: 'w = sum_k (n_k / N) * w_k', text: 'Sample-weighted average of client models. Efficient, but a few corrupted updates can drag the average away.' },
  { id: 'median', name: 'Coordinate-wise Median', formula: 'w[j] = median_k ( w_k[j] )', text: 'Takes the median of every parameter across clients, so extreme (malicious) values have little influence.' },
];

export function RoundCharts({ history }) {
  const data = history.map((h) => ({ round: h.round, 'Train loss': h.train_loss, 'Test loss': h.test_loss, Accuracy: h.accuracy, 'Macro F1': h.f1_macro }));
  const axis = { stroke: COLORS.axis, fontSize: 11 };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Loss per round" subtitle="Train loss = mean local loss of participating clients. Test loss = global model on held-out data.">
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="round" {...axis} label={{ value: 'Round', position: 'insideBottom', offset: -2, fill: COLORS.axis, fontSize: 11 }} />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} formatter={(v) => v.toFixed(4)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Train loss" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Test loss" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Global model quality per round">
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="round" {...axis} label={{ value: 'Round', position: 'insideBottom', offset: -2, fill: COLORS.axis, fontSize: 11 }} />
              <YAxis {...axis} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
              <Tooltip {...tooltipStyle} formatter={(v) => pct(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Accuracy" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Macro F1" stroke="#a78bfa" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

export default function Training() {
  const { prepared, partition, trainCfg, setTrainCfg, attackCfg, job, startTrain, experiments } = useApp();
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!prepared || !partition) {
    return (
      <>
        <PageHeader title="Federated Learning" />
        <Empty title={!prepared ? 'Dataset not prepared' : 'Clients not created'}
          action={<LinkButton to={!prepared ? '/dataset' : '/clients'} variant="primary">{!prepared ? 'Go to Dataset Management' : 'Go to Client Configuration'}</LinkButton>}>
          Federated training needs a preprocessed dataset that has been distributed among clients.
        </Empty>
      </>
    );
  }

  const set = (k) => (v) => setTrainCfg({ ...trainCfg, [k]: v });
  const running = job.status === 'running';
  const showRun = job.kind === 'train' && (running || job.status === 'done');
  const finished = job.kind === 'train' && job.status === 'done' ? experiments.find((e) => e.id === job.resultId) : null;
  const history = job.kind === 'train' ? job.history : [];
  const attackActive = attackCfg.malicious.length > 0 || attackCfg.dropoutRate > 0;

  return (
    <>
      <PageHeader title="Federated Learning" subtitle="Each client trains a local MLP; the server aggregates the weights with FedAvg or coordinate-wise median and sends the global model back." />

      <Card title="Aggregation method">
        <div className="grid gap-3 md:grid-cols-2">
          {ALGOS.map((a) => (
            <button key={a.id} type="button" onClick={() => set('algorithm')(a.id)} disabled={running}
              className={`rounded-xl border p-4 text-left transition ${trainCfg.algorithm === a.id ? 'border-cyan bg-cyan/10' : 'border-navy-600 bg-navy-900 hover:border-slate-500'}`}>
              <div className="flex items-center justify-between"><span className="font-semibold text-white">{a.name}</span>{trainCfg.algorithm === a.id && <Badge tone="cyan">selected</Badge>}</div>
              <code className="mt-2 block font-mono text-xs text-cyan">{a.formula}</code>
              <p className="mt-2 text-xs text-slate-400">{a.text}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Training configuration" className="mt-6">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Field label="Rounds"><NumberInput value={trainCfg.rounds} min={1} max={100} onChange={set('rounds')} disabled={running} /></Field>
          <Field label="Local epochs"><NumberInput value={trainCfg.localEpochs} min={1} max={20} onChange={set('localEpochs')} disabled={running} /></Field>
          <Field label="Learning rate"><NumberInput value={trainCfg.lr} min={0.001} max={1} step={0.01} onChange={set('lr')} disabled={running} /></Field>
          <Field label="Batch size"><NumberInput value={trainCfg.batchSize} min={8} max={512} step={8} onChange={set('batchSize')} disabled={running} /></Field>
          <Field label="Hidden layers" hint="e.g. 64,32"><Input value={trainCfg.hidden} onChange={(e) => set('hidden')(e.target.value)} disabled={running} /></Field>
          <Field label="Random seed"><NumberInput value={trainCfg.seed} min={0} onChange={set('seed')} disabled={running} /></Field>
        </div>

        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="mt-4 text-xs font-medium text-cyan hover:underline">
          {showAdvanced ? 'Hide' : 'Show'} update protection (clipping and Gaussian noise)
        </button>
        {showAdvanced && (
          <div className="mt-3 grid gap-4 rounded-lg bg-navy-900 p-4 md:grid-cols-2">
            <Field label="Update clipping norm (0 = off)" hint="Limits the L2 norm of each client's update.">
              <NumberInput value={trainCfg.clipNorm} min={0} step={0.5} onChange={set('clipNorm')} disabled={running} />
            </Field>
            <Field label="Gaussian noise std (0 = off)" hint="Added to every uploaded weight. Not a differential-privacy guarantee.">
              <NumberInput value={trainCfg.noiseStd} min={0} step={0.001} onChange={set('noiseStd')} disabled={running} />
            </Field>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-navy-900 p-3 text-sm">
          <span className="text-slate-400">Scenario:</span>
          <Badge tone="gray">{partition.cfg.numClients} clients, {partition.cfg.distribution === 'iid' ? 'IID' : `non-IID (alpha ${partition.cfg.alpha})`}</Badge>
          {attackActive
            ? <><Badge tone="red">{attackCfg.malicious.length} malicious client(s)</Badge><Badge tone="amber">{Math.round(attackCfg.dropoutRate * 100)}% dropout</Badge></>
            : <Badge tone="green">no attack, no dropout</Badge>}
          <Link to="/attacks" className="ml-auto text-xs font-medium text-cyan hover:underline">Change attack settings</Link>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={startTrain} disabled={running}>{running ? 'Training...' : 'Start federated training'}</Button>
        </div>
      </Card>

      <div className="mt-6 space-y-6">
        <JobPanel kinds={['train']} />
        {showRun && history.length > 0 && <RoundCharts history={history} />}

        {finished && (
          <Card title="Training complete" right={<LinkButton to={`/evaluation?exp=${finished.id}`} variant="cyan">Open full evaluation</LinkButton>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[['Accuracy', finished.result.metrics.accuracy], ['Precision', finished.result.metrics.precision_macro], ['Recall', finished.result.metrics.recall_macro], ['Macro F1', finished.result.metrics.f1_macro], ['FPR', finished.result.metrics.fpr_macro]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-navy-900 p-3"><div className="text-xs text-slate-400">{k}</div><div className="mt-1 text-xl font-semibold text-white">{pct(v)}</div></div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">Finished in {finished.result.duration_s.toFixed(1)} s.</p>
          </Card>
        )}

        {showRun && history.length > 0 && (
          <Card title="Round log" subtitle="Which clients participated in every round (dropped clients are missing).">
            <div className="max-h-72 overflow-y-auto">
              <Table head={['Round', 'Participants', 'Train loss', 'Test loss', 'Accuracy', 'Macro F1']}>
                {[...history].reverse().map((h) => (
                  <tr key={h.round}>
                    <Td className="font-medium text-white">{h.round}</Td>
                    <Td><div className="flex gap-1">{partition.parts.map((_, k) => (
                      <span key={k} className={`rounded px-1.5 py-0.5 text-xs ${h.participants.includes(k) ? (attackCfg.malicious.includes(k) ? 'bg-red-500/20 text-red-300' : 'bg-accent/20 text-blue-300') : 'bg-navy-700 text-slate-600 line-through'}`}>C{k + 1}</span>
                    ))}</div></Td>
                    <Td>{h.train_loss.toFixed(4)}</Td><Td>{h.test_loss.toFixed(4)}</Td><Td>{pct(h.accuracy)}</Td><Td>{pct(h.f1_macro)}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
