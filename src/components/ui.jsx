import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { COLORS } from '../lib/palette.jsx';

export { COLORS };
export const MODEL_LABELS = {
  centralized: 'Centralized MLP', local_ensemble: 'Local Ensemble', fedavg: 'Federated (FedAvg)', median: 'Federated (Median)',
};
export const pct = (v, digits = 2) => (v == null || Number.isNaN(v) ? '-' : `${(v * 100).toFixed(digits)}%`);
export const fmt = (v, digits = 4) => (v == null || Number.isNaN(v) ? '-' : Number(v).toFixed(digits));
export const formatBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`);

export const tooltipStyle = {
  contentStyle: { background: '#0a1224', border: '1px solid #1e2f5c', borderRadius: 8, fontSize: 12, color: '#dbe5f7' },
  labelStyle: { color: '#8aa0c8' },
  itemStyle: { color: '#dbe5f7' },
  cursor: { fill: 'rgba(120,120,120,0.12)' },
};

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-navy-600/70 bg-navy-800 p-5 shadow-lg shadow-black/10 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, accent = 'text-white' }) {
  return (
    <div className="rounded-xl border border-navy-600/70 bg-navy-800 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1.5 truncate text-2xl font-semibold ${accent}`}>{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

const BTN = {
  primary: 'bg-accent text-[#ffffff] hover:bg-blue-500 disabled:hover:bg-accent',
  cyan: 'bg-cyan text-navy-950 hover:bg-cyan-300 disabled:hover:bg-cyan',
  ghost: 'border border-navy-600 text-slate-200 hover:bg-navy-700 disabled:hover:bg-transparent',
  danger: 'bg-red-500/90 text-[#ffffff] hover:bg-red-500 disabled:hover:bg-red-500/90',
};
export function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BTN[variant]} ${className}`}
    />
  );
}
export function LinkButton({ to, variant = 'ghost', children }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${BTN[variant]}`}>
      {children}
    </Link>
  );
}

const inputCls = 'w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan focus:ring-1 focus:ring-cyan/40 disabled:opacity-50';
export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
export const Input = (props) => <input {...props} className={inputCls} />;
export const Select = ({ children, ...props }) => <select {...props} className={inputCls}>{children}</select>;
export function NumberInput({ value, onChange, ...props }) {
  return <input type="number" {...props} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls} />;
}

const ALERT = {
  error: 'border-red-500/40 bg-red-500/10 text-red-200',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  info: 'border-cyan/30 bg-cyan/10 text-cyan-100',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
};
export function Alert({ type = 'info', title, children, className = '' }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${ALERT[type]} ${className}`} role={type === 'error' ? 'alert' : undefined}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function Progress({ value, label }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs text-slate-400"><span>{label}</span><span>{Math.round(value * 100)}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-navy-900">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-cyan transition-all duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'blue' }) {
  const tones = {
    blue: 'bg-accent/15 text-blue-300 border-accent/30', cyan: 'bg-cyan/10 text-cyan border-cyan/30',
    red: 'bg-red-500/10 text-red-300 border-red-500/30', green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    gray: 'bg-slate-500/10 text-slate-300 border-slate-500/30', amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Table({ head, children, className = '' }) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-navy-600/60 ${className}`}>
      <table className="w-full text-left text-sm">
        <thead className="bg-navy-700/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-navy-600/50">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className = '' }) => <td className={`whitespace-nowrap px-3 py-2.5 ${className}`}>{children}</td>;

export function Empty({ title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-600 bg-navy-800/50 px-6 py-10 text-center">
      <div className="text-base font-medium text-slate-200">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

/** Confusion matrix as a colour-scaled grid. rows = actual class, columns = predicted class. */
export function ConfusionMatrix({ matrix, classNames, normalize = false }) {
  const { print } = useApp();
  const rowSums = matrix.map((r) => r.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            <th colSpan={classNames.length} className="pb-1 text-center font-medium text-slate-400">Predicted</th>
          </tr>
          <tr>
            <th />
            {classNames.map((c) => <th key={c} className="px-2 pb-1 font-medium text-slate-300">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <th className="whitespace-nowrap pr-2 text-right font-medium text-slate-300">{classNames[i]}</th>
              {row.map((v, j) => {
                const share = normalize ? (rowSums[i] ? v / rowSums[i] : 0) : v / max;
                const diag = i === j;
                const rgb = diag ? '34,211,238' : '248,113,113';
                // print mode: light colours - green = correct (diagonal), red/orange = errors; darker tint = more samples
                const pr = diag ? '34,197,94' : '239,68,68';
                const style = print
                  ? { background: `rgba(${pr},${(0.10 + share * 0.55).toFixed(3)})`, color: '#111111', border: diag ? '2px solid #15803d' : '1px solid #d4d4d4' }
                  : { background: `rgba(${rgb},${0.08 + share * 0.75})` };
                return (
                  <td key={j} title={`Actual ${classNames[i]} -> predicted ${classNames[j]}: ${v}`}
                    className="h-12 min-w-[64px] rounded-md text-center font-mono text-[13px] font-semibold text-white"
                    style={style}>
                    {normalize ? `${(share * 100).toFixed(1)}%` : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-center text-xs text-slate-500">{print ? 'Rows: actual class. Green = correct, red = errors; darker = more samples.' : 'Rows: actual class. Cyan = correct, red = errors.'}</div>
    </div>
  );
}
