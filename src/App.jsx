import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Dataset from './pages/Dataset.jsx';
import Clients from './pages/Clients.jsx';
import Training from './pages/Training.jsx';
import Attacks from './pages/Attacks.jsx';
import Evaluation from './pages/Evaluation.jsx';
import Comparison from './pages/Comparison.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { to: '/dataset', label: 'Dataset', icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6' },
  { to: '/clients', label: 'Clients', icon: 'M12 5a2 2 0 100-4 2 2 0 000 4zM5 21a2 2 0 100-4 2 2 0 000 4zM19 21a2 2 0 100-4 2 2 0 000 4zM12 5v6M12 11l-7 6M12 11l7 6' },
  { to: '/training', label: 'Federated Learning', icon: 'M4 4v6h6M20 20v-6h-6M20 10a8 8 0 00-14-3M4 14a8 8 0 0014 3' },
  { to: '/attacks', label: 'Attack Simulation', icon: 'M12 3l9 16H3L12 3zM12 10v4M12 17v.5' },
  { to: '/evaluation', label: 'Evaluation', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { to: '/comparison', label: 'Model Comparison', icon: 'M8 3v18M16 3v18M3 8h5M16 14h5' },
];

function Logo() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#15234a" />
        <circle cx="16" cy="9" r="3" fill="#22d3ee" /><circle cx="8" cy="22" r="3" fill="#3b82f6" /><circle cx="24" cy="22" r="3" fill="#3b82f6" />
        <path d="M16 12L8 19M16 12l8 7M11 22h10" stroke="#22d3ee" strokeWidth="1.5" fill="none" />
      </svg>
      <div>
        <div className="text-base font-semibold leading-tight text-white">FL-NIDS</div>
        <div className="text-[11px] leading-tight text-slate-400">Federated Intrusion Detection</div>
      </div>
    </div>
  );
}

export default function App() {
  const { job } = useApp();
  return (
    <div className="flex min-h-full bg-navy-900">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-navy-600/60 bg-navy-950 md:flex">
        <Logo />
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-accent/15 text-cyan' : 'text-slate-300 hover:bg-navy-800 hover:text-white'}`}>
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-navy-600/60 px-5 py-4 text-xs text-slate-500">
          {job.status === 'running'
            ? <span className="flex items-center gap-2 text-cyan"><span className="h-2 w-2 animate-pulse rounded-full bg-cyan" />Training in progress</span>
            : <span>B.Tech project demo</span>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile navigation */}
        <nav className="flex gap-1 overflow-x-auto border-b border-navy-600/60 bg-navy-950 px-3 py-2 md:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${isActive ? 'bg-accent/20 text-cyan' : 'text-slate-300'}`}>{n.label}</NavLink>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dataset" element={<Dataset />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/training" element={<Training />} />
            <Route path="/attacks" element={<Attacks />} />
            <Route path="/evaluation" element={<Evaluation />} />
            <Route path="/comparison" element={<Comparison />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
