import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../context/AppContext.jsx';
import { Badge, Card, COLORS, ConfusionMatrix, Empty, LinkButton, MODEL_LABELS, PageHeader, Select, Stat, Table, Td, formatBytes, pct, tooltipStyle } from '../components/ui.jsx';
import { barProps, classBarProps, lineProps, ROLE } from '../lib/palette.jsx';

/** Turns saved experiments into a flat list of evaluable models. */
function buildOptions(experiments) {
  const out = [];
  for (const e of experiments) {
    const when = new Date(e.createdAt).toLocaleTimeString();
    if (e.kind === 'train') out.push({ key: e.id, tag: e.config.train.algorithm === 'median' ? 'Median aggregation' : 'FedAvg aggregation', label: `${e.label} - ${when}`, metrics: e.result.metrics, payload: e.result.payload, exp: e });
    if (e.kind === 'compare') {
      for (const [k, r] of Object.entries(e.result.models)) {
        out.push({ key: `${e.id}:${k}`, tag: MODEL_LABELS[k], label: `Comparison: ${MODEL_LABELS[k]} - ${when}`, metrics: r.metrics, payload: r.payload, exp: e });
      }
    }
  }
  return out;
}

export default function Evaluation() {
  const { experiments, prepared, print } = useApp();
  const [params, setParams] = useSearchParams();
  const [normalize, setNormalize] = useState(false);
  const options = useMemo(() => buildOptions(experiments), [experiments]);

  if (options.length === 0) {
    return (
      <>
        <PageHeader title="Model Evaluation" />
        <Empty title="Nothing to evaluate yet" action={<LinkButton to="/training" variant="primary">Train a federated model</LinkButton>}>
          Evaluation metrics are computed on the held-out test set after a model has been trained.
        </Empty>
      </>
    );
  }

  const selected = options.find((o) => o.key === params.get('exp')) || options[0];
  const { metrics: m, exp, payload } = selected;
  const classNames = m.per_class.map((c) => c.class);
  const { attack, train, clients } = exp.config;

  return (
    <>
      <PageHeader title="Model Evaluation" subtitle="Metrics are computed on a held-out test set that no client has seen. Precision, recall, F1 and FPR are macro-averaged over classes.">
        <div className="w-80 max-w-full">
          <Select value={selected.key} onChange={(e) => setParams({ exp: e.target.value })}>
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </Select>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="blue">{selected.tag}</Badge>
        <Badge tone="gray">{train.rounds} rounds x {train.localEpochs} epochs</Badge>
        <Badge tone="gray">{clients.numClients} clients, {clients.distribution === 'iid' ? 'IID' : `non-IID (alpha ${clients.alpha})`}</Badge>
        <Badge tone={attack.malicious.length ? 'red' : 'green'}>{attack.malicious.length} malicious</Badge>
        <Badge tone={attack.dropoutRate ? 'amber' : 'green'}>{Math.round(attack.dropoutRate * 100)}% dropout</Badge>
        <Badge tone="gray">{exp.dataset}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Accuracy" value={pct(m.accuracy)} accent="text-blue-300" />
        <Stat label="Precision (macro)" value={pct(m.precision_macro)} />
        <Stat label="Recall (macro)" value={pct(m.recall_macro)} />
        <Stat label="F1-score (macro)" value={pct(m.f1_macro)} accent="text-cyan" />
        <Stat label="False-positive rate" value={pct(m.fpr_macro)} accent="text-amber-300" hint="macro, one-vs-rest" />
      </div>
      {m.binary_fpr != null && (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Attack detection rate" value={pct(m.binary_detection_rate)} accent="text-emerald-300" hint="any attack flagged as attack" />
          <Stat label="Benign false alarm rate" value={pct(m.binary_fpr)} accent="text-amber-300" hint="benign flagged as attack" />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card title="Confusion matrix" className="lg:col-span-3"
          right={<label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />Show row %</label>}>
          <ConfusionMatrix matrix={m.confusion} classNames={classNames} normalize={normalize} />
        </Card>
        <Card title="Per-class F1 and recall" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={m.per_class} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 1]} stroke={COLORS.axis} fontSize={11} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <YAxis type="category" dataKey="class" stroke={COLORS.axis} fontSize={11} width={80} />
                <Tooltip {...tooltipStyle} formatter={(v) => pct(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="f1" name="F1" {...barProps('s1', print, COLORS.fedavg)} radius={[0, 4, 4, 0]} />
                <Bar dataKey="recall" name="Recall" {...barProps('s2', print, COLORS.median)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Per-class metrics" className="mt-6">
        <Table head={['Class', 'Support', 'Precision', 'Recall', 'F1-score', 'False-positive rate']}>
          {m.per_class.map((c) => (
            <tr key={c.class}>
              <Td className="font-medium text-white">{c.class}</Td><Td>{c.support}</Td>
              <Td>{pct(c.precision)}</Td><Td>{pct(c.recall)}</Td><Td>{pct(c.f1)}</Td><Td>{pct(c.fpr)}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      {payload && (
        <Card title="Communication payload estimate" subtitle="Every participating client downloads the global model and uploads its update each round." className="mt-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Model parameters" value={payload.n_params.toLocaleString()} />
            <Stat label="Size of one model" value={formatBytes(payload.bytes_per_model)} hint="32-bit floats" />
            <Stat label="Client uploads" value={payload.uploads} hint="fewer when clients drop out" />
            <Stat label="Total traffic" value={formatBytes(payload.total_bytes)} accent="text-cyan" />
          </div>
        </Card>
      )}
      {!prepared && <p className="mt-4 text-xs text-slate-500">Saved results are shown from browser storage; reload data to run new experiments.</p>}
    </>
  );
}
