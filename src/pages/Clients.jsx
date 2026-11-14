import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../context/AppContext.jsx';
import { Alert, Badge, Button, Card, COLORS, Empty, Field, LinkButton, NumberInput, PageHeader, Select, Table, Td, tooltipStyle } from '../components/ui.jsx';
import { barProps, classBarProps, lineProps, ROLE } from '../lib/palette.jsx';

export const CLASS_COLORS = ['#3b82f6', '#22d3ee', '#a78bfa', '#f59e0b', '#34d399', '#f472b6', '#fb923c', '#94a3b8'];

export default function Clients() {
  const { prepared, partition, clientCfg, configureClients, print } = useApp();
  const [cfg, setCfg] = useState(clientCfg);
  const [error, setError] = useState('');
  useEffect(() => setCfg(clientCfg), [clientCfg]);

  if (!prepared) {
    return (
      <>
        <PageHeader title="Federated Client Configuration" />
        <Empty title="Dataset not prepared" action={<LinkButton to="/dataset" variant="primary">Go to Dataset Management</LinkButton>}>
          Load and preprocess a dataset first. The training data is then distributed among the simulated clients.
        </Empty>
      </>
    );
  }

  const create = () => {
    setError('');
    try {
      if (!(cfg.numClients >= 3 && cfg.numClients <= 5)) throw new Error('Number of clients must be between 3 and 5.');
      if (!(cfg.alpha >= 0.05 && cfg.alpha <= 10)) throw new Error('Alpha must be between 0.05 and 10.');
      configureClients(cfg);
    } catch (e) { setError(e.message); }
  };

  const classNames = prepared.summary.classNames;
  const chartData = partition?.matrix.map((row, k) => ({ client: `Client ${k + 1}`, ...Object.fromEntries(classNames.map((c, i) => [c, row[i]])) }));
  const dirty = partition && JSON.stringify(partition.cfg) !== JSON.stringify(cfg);

  return (
    <>
      <PageHeader title="Federated Client Configuration" subtitle="Create 3-5 simulated clients and distribute the training data among them. Each client keeps its own private partition." />

      <Card title="Client setup">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label={`Number of clients: ${cfg.numClients}`}>
            <input type="range" min={3} max={5} step={1} value={cfg.numClients} className="mt-2 w-full" onChange={(e) => setCfg({ ...cfg, numClients: Number(e.target.value) })} />
          </Field>
          <Field label="Data distribution">
            <Select value={cfg.distribution} onChange={(e) => setCfg({ ...cfg, distribution: e.target.value })}>
              <option value="iid">IID - same class mix on every client</option>
              <option value="non_iid">Non-IID - skewed class mix (Dirichlet)</option>
            </Select>
          </Field>
          <Field label={`Non-IID strength (alpha): ${cfg.alpha}`} hint="Lower = more skewed clients">
            <input type="range" min={0.1} max={5} step={0.1} value={cfg.alpha} disabled={cfg.distribution !== 'non_iid'} className="mt-2 w-full"
              onChange={(e) => setCfg({ ...cfg, alpha: Number(e.target.value) })} />
          </Field>
          <Field label="Random seed">
            <NumberInput value={cfg.seed} min={0} step={1} onChange={(v) => setCfg({ ...cfg, seed: v === '' ? 0 : v })} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={create}>{partition ? 'Re-create clients' : 'Create clients'}</Button>
          {partition && <LinkButton to="/training" variant="cyan">Next: federated learning</LinkButton>}
          {dirty && <Badge tone="amber">Settings changed - click Re-create clients to apply</Badge>}
        </div>
        {error && <Alert type="error" className="mt-4">{error}</Alert>}
      </Card>

      {partition && (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <Card title="Client-wise class distribution" subtitle={`${partition.cfg.distribution === 'iid' ? 'IID' : `Non-IID, alpha = ${partition.cfg.alpha}`} - number of training samples per class`} className="lg:col-span-3">
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="client" stroke={COLORS.axis} fontSize={12} />
                    <YAxis stroke={COLORS.axis} fontSize={11} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {classNames.map((c, i) => <Bar key={c} dataKey={c} stackId="a" {...classBarProps(i, print, CLASS_COLORS[i % CLASS_COLORS.length])} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Client summary" className="lg:col-span-2">
              <Table head={['Client', 'Samples', 'Dominant class']}>
                {partition.matrix.map((row, k) => {
                  const total = row.reduce((a, b) => a + b, 0);
                  const top = row.indexOf(Math.max(...row));
                  return (
                    <tr key={k}>
                      <Td className="font-medium text-white">Client {k + 1}</Td>
                      <Td>{total.toLocaleString()}</Td>
                      <Td>{classNames[top]} <span className="text-slate-500">({((row[top] / total) * 100).toFixed(0)}%)</span></Td>
                    </tr>
                  );
                })}
              </Table>
              <p className="mt-3 text-xs text-slate-400">FedAvg weights each client by its sample count, so uneven non-IID splits give larger clients more influence.</p>
            </Card>
          </div>

          <Card title="Class counts per client" className="mt-6">
            <Table head={['Client', ...classNames]}>
              {partition.matrix.map((row, k) => (
                <tr key={k}><Td className="font-medium text-white">Client {k + 1}</Td>{row.map((v, i) => <Td key={i} className={v === 0 ? 'text-slate-600' : ''}>{v}</Td>)}</tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
