import { useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../context/AppContext.jsx';
import { datasetStats } from '../ml/preprocess.js';
import { previewRows, tableToCsv } from '../ml/csv.js';
import { generateSampleTable } from '../ml/sampleData.js';
import { Alert, Badge, Button, Card, COLORS, Field, Input, LinkButton, NumberInput, PageHeader, Select, Stat, Table, Td, tooltipStyle } from '../components/ui.jsx';
import { barProps, classBarProps, lineProps, ROLE } from '../lib/palette.jsx';

export default function Dataset() {
  const { table, datasetName, target, setTarget, prepared, loadSample, loadFile, prepare, print } = useApp();
  const [rows, setRows] = useState(6000);
  const [opts, setOpts] = useState({ missingStrategy: 'median', scaling: 'standard', testSize: 0.2, maxRows: 8000 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const stats = useMemo(() => (table ? datasetStats(table, target) : null), [table, target]);
  const preview = useMemo(() => (table ? previewRows(table, 12) : []), [table]);

  const guard = (fn) => async () => {
    setError(''); setBusy(true);
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint before heavy work
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const downloadSample = () => {
    const csv = tableToCsv(generateSampleTable(6000, 42));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'sample_network_traffic.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onPrepare = guard(() => {
    if (!(opts.maxRows >= 500)) throw new Error('Max rows must be at least 500.');
    if (!(opts.testSize >= 0.05 && opts.testSize <= 0.5)) throw new Error('Test size must be between 5% and 50%.');
    prepare(opts);
  });

  return (
    <>
      <PageHeader title="Dataset Management" subtitle="Load network-traffic data, inspect it, then preprocess it: handle missing values, encode categorical columns and normalise numeric features." />

      <Card title="1. Data source" subtitle="Use the built-in synthetic traffic generator or upload your own CSV (e.g. a sampled CIC-IDS2017 file).">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3 rounded-lg bg-navy-900 p-4">
            <div className="text-sm font-medium text-white">Synthetic sample data</div>
            <Field label="Number of rows" hint="5 classes: Benign, DoS, PortScan, BruteForce, Botnet. Includes missing values.">
              <NumberInput value={rows} min={500} max={30000} step={500} onChange={setRows} />
            </Field>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={guard(() => { if (!(rows >= 500 && rows <= 30000)) throw new Error('Rows must be between 500 and 30000.'); loadSample(rows); })}>Generate sample</Button>
              <Button variant="ghost" onClick={downloadSample}>Download sample CSV</Button>
            </div>
          </div>
          <div className="space-y-3 rounded-lg bg-navy-900 p-4">
            <div className="text-sm font-medium text-white">Upload CSV</div>
            <p className="text-xs text-slate-400">Needs a header row, at least 50 rows and one label column. Max 60 MB. Large files are subsampled during preprocessing.</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) guard(() => loadFile(f))(); }} />
            <Button variant="ghost" disabled={busy} onClick={() => fileRef.current.click()}>Choose CSV file</Button>
          </div>
        </div>
        {error && <Alert type="error" className="mt-4" title="Something went wrong">{error}</Alert>}
      </Card>

      {!table && <p className="mt-6 text-sm text-slate-400">No dataset loaded yet. Generate the sample data to continue.</p>}

      {table && stats && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="File" value={<span className="text-base">{datasetName}</span>} />
            <Stat label="Rows" value={stats.rows.toLocaleString()} />
            <Stat label="Columns" value={stats.columns} hint={`${stats.numeric} numeric, ${stats.categorical} categorical`} />
            <Stat label="Missing cells" value={stats.missingCells.toLocaleString()} accent={stats.missingCells ? 'text-amber-300' : 'text-emerald-300'} />
            <Stat label="Classes" value={stats.classDistribution ? stats.classDistribution.length : '-'} hint={`target: ${target}`} accent="text-cyan" />
          </div>

          <Card title="Data preview" subtitle="First 12 rows. Empty cells are missing values." className="mt-6">
            <Table head={table.columns.map((c) => c.name)}>
              {preview.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <Td key={j} className={v == null ? 'text-amber-400/70' : ''}>{v == null ? 'NaN' : typeof v === 'number' ? +v.toFixed(3) : v}</Td>)}</tr>
              ))}
            </Table>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Column statistics">
              <div className="max-h-96 overflow-y-auto">
                <Table head={['Column', 'Type', 'Missing', 'Mean / Top value', 'Min', 'Max']}>
                  {stats.info.map((c) => (
                    <tr key={c.name}>
                      <Td className="font-medium text-white">{c.name}</Td>
                      <Td><Badge tone={c.type === 'numeric' ? 'blue' : 'cyan'}>{c.type}</Badge></Td>
                      <Td className={c.missing ? 'text-amber-300' : 'text-slate-400'}>{c.missing} ({c.missing_pct.toFixed(1)}%)</Td>
                      <Td>{c.type === 'numeric' ? c.mean?.toFixed(2) : c.top?.[0] ? `${c.top[0].value} (${c.top[0].count})` : '-'}</Td>
                      <Td>{c.type === 'numeric' ? c.min?.toFixed(2) : '-'}</Td>
                      <Td>{c.type === 'numeric' ? c.max?.toFixed(2) : '-'}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            </Card>
            <Card title="Class distribution" subtitle={`Label column: ${target}`}>
              {stats.classDistribution && stats.classDistribution.length <= 30 ? (
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={stats.classDistribution} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="class" stroke={COLORS.axis} fontSize={11} />
                      <YAxis stroke={COLORS.axis} fontSize={11} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="count" name="Samples" {...barProps('s1', print, '#3b82f6')} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Alert type="warn">This column has too many distinct values to be a class label. Pick another target.</Alert>}
            </Card>
          </div>

          <Card title="2. Preprocessing" subtitle="Applied before the data is distributed to clients. Statistics are fitted on the training split only." className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Field label="Target label column">
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {table.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Missing values">
                <Select value={opts.missingStrategy} onChange={(e) => setOpts({ ...opts, missingStrategy: e.target.value })}>
                  <option value="median">Fill with median / mode</option>
                  <option value="mean">Fill with mean / mode</option>
                  <option value="drop">Drop rows</option>
                </Select>
              </Field>
              <Field label="Normalisation">
                <Select value={opts.scaling} onChange={(e) => setOpts({ ...opts, scaling: e.target.value })}>
                  <option value="standard">Standard (z-score)</option>
                  <option value="minmax">Min-max (0 to 1)</option>
                  <option value="none">None</option>
                </Select>
              </Field>
              <Field label={`Test split: ${Math.round(opts.testSize * 100)}%`}>
                <input type="range" min={0.1} max={0.4} step={0.05} value={opts.testSize} className="mt-2 w-full"
                  onChange={(e) => setOpts({ ...opts, testSize: Number(e.target.value) })} />
              </Field>
              <Field label="Max rows used" hint="Keeps browser training fast">
                <NumberInput value={opts.maxRows} min={500} step={500} onChange={(v) => setOpts({ ...opts, maxRows: v })} />
              </Field>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={onPrepare} disabled={busy}>Preprocess dataset</Button>
              {prepared && <LinkButton to="/clients" variant="cyan">Next: configure clients</LinkButton>}
            </div>

            {prepared && (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg bg-navy-900 p-4">
                  <div className="mb-2 text-sm font-medium text-emerald-300">Dataset ready</div>
                  <ul className="space-y-1 text-sm text-slate-300">
                    {prepared.summary.steps.map((s) => <li key={s}>- {s}</li>)}
                  </ul>
                  {prepared.summary.warnings.map((w) => <Alert key={w} type="warn" className="mt-3">{w}</Alert>)}
                </div>
                <div className="rounded-lg bg-navy-900 p-4 text-sm text-slate-300">
                  <div className="mb-2 font-medium text-white">Model input</div>
                  <div>{prepared.summary.trainRows.toLocaleString()} training rows, {prepared.summary.testRows.toLocaleString()} test rows</div>
                  <div>{prepared.summary.nFeatures} features after encoding, {prepared.summary.nClasses} classes</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{prepared.summary.classNames.map((c, i) => <Badge key={c} tone="gray">{c}: {prepared.summary.trainDistribution[i]}</Badge>)}</div>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
