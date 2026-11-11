import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../context/AppContext.jsx';
import JobPanel from '../components/JobPanel.jsx';
import { Alert, Badge, Button, Card, COLORS, Empty, Field, LinkButton, PageHeader, Select, Table, Td, pct, tooltipStyle } from '../components/ui.jsx';

function SweepChart({ sweep }) {
  const isMal = sweep.param === 'malicious';
  const xLabel = isMal ? 'Number of malicious clients' : 'Client dropout rate';
  const x = (v) => (isMal ? v : `${Math.round(v * 100)}%`);
  const build = (key) => sweep.values.map((v, i) => ({ x: x(v), FedAvg: sweep.points.fedavg[i][key], Median: sweep.points.median[i][key] }));
  const axis = { stroke: COLORS.axis, fontSize: 11 };
  const chart = (title, key) => (
    <Card title={title}>
      <div className="h-64">
        <ResponsiveContainer>
          <LineChart data={build(key)} margin={{ top: 5, right: 10, left: 0, bottom: 15 }}>
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="x" {...axis} label={{ value: xLabel, position: 'insideBottom', offset: -8, fill: COLORS.axis, fontSize: 11 }} />
            <YAxis {...axis} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip {...tooltipStyle} formatter={(v) => pct(v)} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="FedAvg" stroke={COLORS.fedavg} strokeWidth={2.5} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Median" stroke={COLORS.median} strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">{chart('Accuracy', 'accuracy')}{chart('Macro F1-score', 'f1_macro')}</div>
      <Card title="Study results" className="mt-6">
        <Table head={[isMal ? 'Malicious clients' : 'Dropout rate', 'FedAvg accuracy', 'Median accuracy', 'FedAvg macro F1', 'Median macro F1', 'FedAvg FPR', 'Median FPR']}>
          {sweep.values.map((v, i) => {
            const a = sweep.points.fedavg[i], m = sweep.points.median[i];
            return (
              <tr key={v}>
                <Td className="font-medium text-white">{x(v)}</Td>
                <Td className={a.accuracy > m.accuracy ? 'font-semibold text-emerald-300' : ''}>{pct(a.accuracy)}</Td>
                <Td className={m.accuracy > a.accuracy ? 'font-semibold text-emerald-300' : ''}>{pct(m.accuracy)}</Td>
                <Td>{pct(a.f1_macro)}</Td><Td>{pct(m.f1_macro)}</Td><Td>{pct(a.fpr_macro)}</Td><Td>{pct(m.fpr_macro)}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}

export default function Attacks() {
  const { prepared, partition, attackCfg, setAttackCfg, startSweep, job, experiments } = useApp();
  const [view, setView] = useState('malicious');
  const [error, setError] = useState('');

  if (!prepared || !partition) {
    return (
      <>
        <PageHeader title="Attack Simulation" />
        <Empty title="Clients not configured" action={<LinkButton to={!prepared ? '/dataset' : '/clients'} variant="primary">{!prepared ? 'Go to Dataset Management' : 'Go to Client Configuration'}</LinkButton>}>
          Create the federated clients first, then choose which of them behave maliciously.
        </Empty>
      </>
    );
  }

  const K = partition.parts.length;
  const mal = attackCfg.malicious;
  const toggle = (k) => setAttackCfg({ ...attackCfg, malicious: mal.includes(k) ? mal.filter((x) => x !== k) : [...mal, k].sort() });
  const running = job.status === 'running';
  const sweep = experiments.find((e) => e.kind === 'sweep' && e.result.param === view)?.result;

  const run = (param) => {
    setError(''); setView(param);
    const r = startSweep(param);
    if (!r.ok) setError(r.error);
  };

  return (
    <>
      <PageHeader title="Attack Simulation" subtitle="Make selected clients malicious with label-flipping, and simulate clients that drop out of rounds. These settings are used by every training run and comparison." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Label-flipping attack" subtitle="Malicious clients train on corrupted labels and upload poisoned updates.">
          <div className="mb-4 flex flex-wrap gap-2">
            {Array.from({ length: K }, (_, k) => (
              <button key={k} type="button" onClick={() => toggle(k)} disabled={running}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${mal.includes(k) ? 'border-red-400/60 bg-red-500/15 text-red-200' : 'border-navy-600 bg-navy-900 text-slate-300 hover:border-slate-500'}`}>
                Client {k + 1} {mal.includes(k) ? '(malicious)' : '(honest)'}
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Flip strategy" hint={attackCfg.flipMode === 'shift' ? 'Class c is relabelled as class c+1 (consistent poisoning).' : 'Each flipped label becomes a random other class.'}>
              <Select value={attackCfg.flipMode} onChange={(e) => setAttackCfg({ ...attackCfg, flipMode: e.target.value })} disabled={running}>
                <option value="shift">Shift (c to c+1)</option>
                <option value="random">Random other class</option>
              </Select>
            </Field>
            <Field label={`Fraction of labels flipped: ${Math.round(attackCfg.flipFraction * 100)}%`}>
              <input type="range" min={0.1} max={1} step={0.1} value={attackCfg.flipFraction} className="mt-2 w-full" disabled={running}
                onChange={(e) => setAttackCfg({ ...attackCfg, flipFraction: Number(e.target.value) })} />
            </Field>
          </div>
          {mal.length * 2 >= K && mal.length > 0 && (
            <Alert type="warn" className="mt-4">With half or more of the clients malicious, the median has no robustness guarantee (its breakdown point is below 50%).</Alert>
          )}
        </Card>

        <Card title="Client dropout" subtitle="In every round each client is unavailable with this probability (at least one always participates).">
          <Field label={`Dropout rate: ${Math.round(attackCfg.dropoutRate * 100)}%`}>
            <input type="range" min={0} max={0.8} step={0.1} value={attackCfg.dropoutRate} className="mt-2 w-full" disabled={running}
              onChange={(e) => setAttackCfg({ ...attackCfg, dropoutRate: Number(e.target.value) })} />
          </Field>
          <div className="mt-5 rounded-lg bg-navy-900 p-4 text-sm text-slate-300">
            <div className="mb-2 font-medium text-white">Current scenario</div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={mal.length ? 'red' : 'green'}>{mal.length ? `${mal.length} malicious: ${mal.map((k) => `C${k + 1}`).join(', ')}` : 'no malicious clients'}</Badge>
              <Badge tone={attackCfg.dropoutRate ? 'amber' : 'green'}>{Math.round(attackCfg.dropoutRate * 100)}% dropout</Badge>
              <Badge tone="gray">{partition.cfg.distribution === 'iid' ? 'IID' : 'non-IID'}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton to="/training" variant="primary">Train with this scenario</LinkButton>
              <LinkButton to="/comparison" variant="ghost">Compare all models</LinkButton>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Impact study: FedAvg vs Median" subtitle="Runs FedAvg and Median repeatedly with an increasing attack or dropout level (using the training settings from the Federated Learning page) and plots the final test performance." className="mt-6">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => run('malicious')} disabled={running}>Vary number of malicious clients (0 to {K - 1})</Button>
          <Button variant="ghost" onClick={() => run('dropout')} disabled={running}>Vary dropout rate (0% to 80%)</Button>
        </div>
        {error && <Alert type="error" className="mt-4">{error}</Alert>}
        <div className="mt-4"><JobPanel kinds={['sweep']} /></div>
      </Card>

      <div className="mt-6">
        <div className="mb-4 flex gap-2">
          {[['malicious', 'Malicious clients'], ['dropout', 'Client dropout']].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={`rounded-lg px-3 py-1.5 text-sm ${view === id ? 'bg-accent/20 text-cyan' : 'text-slate-400 hover:text-white'}`}>{label}</button>
          ))}
        </div>
        {sweep ? (
          <SweepChart sweep={sweep} />
        ) : (
          <p className="text-sm text-slate-400">Run an impact study to see how {view === 'malicious' ? 'malicious clients' : 'client dropout'} change the accuracy of FedAvg and the median aggregator.</p>
        )}
      </div>
    </>
  );
}
