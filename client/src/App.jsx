import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SubmitPage    from './pages/SubmitPage';
import WorkspacePage from './pages/WorkspacePage';
import ReportPage    from './pages/ReportPage';
import HistoryPage   from './pages/HistoryPage';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } });

function Navbar() {
  return (
    <nav style={{
      background: 'rgba(10,14,26,0.95)',
      borderBottom: '1px solid var(--border)',
      backdropFilter: 'blur(12px)',
      position: 'sticky', top: 0, zIndex: 100,
      padding: '0 24px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', height: 60, gap: 32 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: 'white',
          }}>P</div>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
            Patent<span style={{ color: 'var(--accent)' }}>Pilot</span>
          </span>
        </div>

        {/* Nav links */}
        {[
          { to: '/', label: 'Submit' },
          { to: '/history', label: 'History' },
        ].map(({ to, label }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              transition: 'color 0.2s',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              paddingBottom: 4,
            })}
          >{label}</NavLink>
        ))}

        <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          FTO Screening Tool
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Navbar />
        <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
          <Routes>
            <Route path="/"                      element={<SubmitPage />} />
            <Route path="/workspace/:queryId"    element={<WorkspacePage />} />
            <Route path="/report/:reportId"      element={<ReportPage />} />
            <Route path="/history"               element={<HistoryPage />} />
            <Route path="/history/:queryId"      element={<WorkspacePage fromHistory />} />
          </Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
