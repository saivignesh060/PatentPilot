import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getHistory } from '../api/client';

const REC_MAP = {
  'Low Patent Risk':        'badge-low',
  'Requires Expert Review': 'badge-review',
  'High Patent Risk':       'badge-high',
};

export default function HistoryPage() {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['history'],
    queryFn:  getHistory,
  });

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Analysis History</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            All past molecule analyses — click to reopen without re-running retrieval.
          </p>
        </div>
        <Link to="/" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          + New Analysis
        </Link>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1,2,3].map((i) => (
            <div key={i} className="glass-card" style={{ padding: 20, display: 'flex', gap: 16 }}>
              <div className="skeleton" style={{ height: 16, width: '30%' }} />
              <div className="skeleton" style={{ height: 16, width: '20%' }} />
              <div className="skeleton" style={{ height: 16, width: '15%', marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && history.length === 0 && (
        <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🧪</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
            No analyses yet. Submit your first molecule to get started.
          </div>
          <Link to="/" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Submit Molecule →
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {history.map((entry) => (
          <Link
            key={entry._id}
            to={entry.reportId ? `/report/${entry.reportId}` : `/workspace/${entry._id}`}
            style={{ textDecoration: 'none' }}
          >
            <div className="glass-card" style={{
              padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: 16,
              cursor: 'pointer', transition: 'background 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
            >
              {/* SMILES */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{
                  color: 'var(--accent)', fontSize: '0.8rem',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 4,
                }}>
                  {entry.canonicalSmiles || entry.smiles}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                  {entry.target && <span>🎯 {entry.target}</span>}
                  {entry.indication && <span>💊 {entry.indication}</span>}
                </div>
              </div>

              {/* Recommendation */}
              {entry.recommendation ? (
                <span className={REC_MAP[entry.recommendation] || 'badge-review'}>
                  {entry.recommendation}
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  No report yet
                </span>
              )}

              {/* Date */}
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'right', minWidth: 100 }}>
                {new Date(entry.submittedAt).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </div>

              <span style={{ color: 'var(--text-muted)' }}>›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
