import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { Alert, Badge, Button, Card, Empty, LinkButton, MODEL_LABELS, PageHeader, Stat, Table, Td, pct } from '../components/ui.jsx';

function resultText(exp) {
  const r = exp.result;
  if (exp.kind === 'train') return { acc: r.metrics.accuracy, f1: r.metrics.f1_macro };
  if (exp.kind === 'compare') {
    const m = r.models;
    return { text: `FedAvg ${pct(m.fedavg.metrics.accuracy, 1)} / Median ${pct(m.median.metrics.accuracy, 1)}` };
  }
  return { text: `${r.values.length} settings x 2 aggregators` };
}

export default function Dashboard() {
  const { datasetName, table, prepared, partition, clientCfg, trainCfg, attackCfg, job, experiments, quickStart } = useApp();
  const navigate = useNavigate();
  const lastTrain = experiments.find((e) => e.kind === 'train');
  const m = lastTrain?.result.metrics;

  const statusText = job.status === 'running' ? `Running ${Math.round(job.progress * 100)}%`
    : job.status === 'error' ? 'Error' : lastTrain ? 'Trained' : prepared && partition ? 'Ready' : 'Not ready';
  const statusAccent = job.status === 'running' ? 'text-cyan' : job.status === 'error' ? 'text-red-300' : lastTrain ? 'text-emerald-300' : 'text-slate-300';

  const steps = [
    { done: !!table, label: 'Load a dataset', to: '/dataset' },
    { done: !!prepared, label: 'Preprocess the data', to: '/dataset' },
    { done: !!partition, label: 'Create federated clients', to: '/clients' },
    { done: !!lastTrain, label: 'Train a federated model', to: '/training' },
    { done: experiments.some((e) => e.kind === 'compare'), label: 'Compare all four models', to: '/comparison' },
  ];

  return (
    <>
      <PageHeader title="Federated Learning-Based Network Intrusion Detection"
        subtitle="A working demonstration of federated MLP training with FedAvg and robust coordinate-wise median aggregation, under non-IID data, label-flipping attacks and client dropout.">
        <Button variant="cyan" onClick={() => { quickStart(); navigate('/training'); }}>Quick start demo</Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Dataset" value={prepared ? prepared.summary.trainRows + prepared.summary.testRows : table ? table.nRows : '-'}
          hint={datasetName || 'No dataset loaded'} />
        <Stat label="Federated clients" value={partition ? partition.parts.length : '-'}
          hint={partition ? (clientCfg.distribution === 'iid' ? 'IID split' : `Non-IID (alpha ${clientCfg.alpha})`) : 'Not configured'} accent="text-cyan" />
        <Stat label="Aggregation" value={trainCfg.algorithm === 'median' ? 'Median' : 'FedAvg'}
          hint={`${trainCfg.rounds} rounds x ${trainCfg.localEpochs} local epochs`} accent="text-blue-300" />
        <Stat label="Training status" value={statusText} hint={`${attackCfg.malicious.length} malicious, ${Math.round(attackCfg.dropoutRate * 100)}% dropout`} accent={statusAccent} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Latest model performance" subtitle={lastTrain ? `${lastTrain.label} - ${new Date(lastTrain.createdAt).toLocaleString()}` : 'From the most recent training run'} className="lg:col-span-2"
          right={lastTrain && <Link to={`/evaluation?exp=${lastTrain.id}`} className="text-xs font-medium text-cyan hover:underline">Full evaluation</Link>}>
          {m ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[['Accuracy', m.accuracy], ['Precision', m.precision_macro], ['Recall', m.recall_macro], ['Macro F1', m.f1_macro], ['FPR', m.fpr_macro]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-navy-900 p-3">
                  <div className="text-xs text-slate-400">{k}</div>
                  <div className="mt-1 text-xl font-semibold text-white">{pct(v)}</div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No trained model yet" action={<LinkButton to="/training" variant="primary">Go to Federated Learning</LinkButton>}>
              Metrics shown here always come from real training runs. Train a model to see them.
            </Empty>
          )}
        </Card>

        <Card title="Getting started">
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link to={s.to} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-navy-700">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-navy-700 text-slate-400'}`}>
                    {s.done ? '✓' : i + 1}
                  </span>
                  <span className={s.done ? 'text-slate-300' : 'text-slate-100'}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="Recent experiments" className="mt-6">
        {experiments.length === 0 ? (
          <p className="text-sm text-slate-400">No experiments yet. Results of every training run, comparison and attack study are stored here (in your browser).</p>
        ) : (
          <Table head={['Experiment', 'Type', 'Clients', 'Attack / dropout', 'Result', 'Time']}>
            {experiments.slice(0, 6).map((e) => {
              const r = resultText(e);
              const a = e.config.attack;
              return (
                <tr key={e.id} className="hover:bg-navy-700/40">
                  <Td className="font-medium text-white">
                    {e.kind === 'train' ? <Link className="hover:text-cyan" to={`/evaluation?exp=${e.id}`}>{e.label}</Link> : e.label}
                  </Td>
                  <Td><Badge tone={e.kind === 'train' ? 'blue' : e.kind === 'compare' ? 'cyan' : 'amber'}>{e.kind}</Badge></Td>
                  <Td>{e.config.clients.numClients} ({e.config.clients.distribution === 'iid' ? 'IID' : 'non-IID'})</Td>
                  <Td>{a.malicious.length} malicious / {Math.round(a.dropoutRate * 100)}% drop</Td>
                  <Td>{r.text ?? <>Acc <b className="text-white">{pct(r.acc)}</b> - F1 <b className="text-white">{pct(r.f1)}</b></>}</Td>
                  <Td className="text-slate-400">{new Date(e.createdAt).toLocaleTimeString()}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="How the system works" className="mt-6">
        <div className="grid gap-4 text-sm text-slate-300 md:grid-cols-4">
          {[
            ['1. Local training', 'Each client trains its own MLP on private traffic data. Raw records never leave the client.'],
            ['2. Upload updates', 'Clients send only their model weights to the central server (dropped clients skip the round).'],
            ['3. Robust aggregation', 'The server merges the weights with FedAvg (weighted mean) or coordinate-wise median.'],
            ['4. Broadcast', 'The new global model is sent back and the process repeats for the configured rounds.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg bg-navy-900 p-4">
              <div className="font-semibold text-cyan">{t}</div>
              <p className="mt-1.5 text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </Card>
      {job.status === 'error' && <Alert type="error" className="mt-6" title="Last job failed">{job.error}</Alert>}
    </>
  );
}
