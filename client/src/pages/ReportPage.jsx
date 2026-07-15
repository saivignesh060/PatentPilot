import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getReport } from '../api/client';

const RISK_CONFIG = {
  'Low Patent Risk':        { cls: 'badge-low',    icon: '✅', color: 'var(--low-risk)',    bg: 'rgba(16,185,129,0.05)' },
  'Requires Expert Review': { cls: 'badge-review',  icon: '⚠️', color: 'var(--review-risk)', bg: 'rgba(245,158,11,0.05)' },
  'High Patent Risk':       { cls: 'badge-high',   icon: '🚨', color: 'var(--high-risk)',   bg: 'rgba(239,68,68,0.05)' },
};

export default function ReportPage() {
  const { reportId } = useParams();
  const { data: report, isLoading, error } = useQuery({
    queryKey: ['report', reportId],
    queryFn:  () => getReport(reportId),
  });

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, color: 'var(--text-secondary)' }}>
      <span className="spinner" /> Generating report…
    </div>
  );

  if (error) return (
    <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: '#fca5a5' }}>
      Failed to load report. <Link to="/" style={{ color: 'var(--accent)' }}>Start over</Link>
    </div>
  );

  const rec = report?.recommendation;
  const cfg = RISK_CONFIG[rec] || RISK_CONFIG['Requires Expert Review'];

  return (
    <div className="fade-in" style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>← New Analysis</Link>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 6 }}>Patentability Report</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4 }}>
            Generated {report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : ''}
          </div>
        </div>
        <span className={cfg.cls} style={{ fontSize: '0.9rem', padding: '6px 16px' }}>
          {cfg.icon} {rec}
        </span>
      </div>

      {/* Recommendation banner */}
      <div className="glass-card" style={{
        padding: 24, marginBottom: 20,
        borderColor: cfg.color.replace('var(', '').replace(')', ''),
        background: cfg.bg,
        borderLeft: `4px solid ${cfg.color}`,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: cfg.color }}>Overall Recommendation</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.7 }}>
          {report?.recommendationRationale}
        </div>
      </div>

      {/* Executive Summary */}
      <Section title="Executive Summary" icon="📋">
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '0.9rem' }}>
          {report?.executiveSummary}
        </p>
      </Section>

      {/* Key Similar Patents */}
      {report?.keySimilarPatents?.length > 0 && (
        <Section title="Key Similar Patents" icon="🔍">
          <div style={{ display: 'grid', gap: 12 }}>
            {report.keySimilarPatents.map((p, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '12px 16px', background: 'var(--bg-secondary)',
                borderRadius: 8, border: '1px solid var(--border)',
              }}>
                <span style={{
                  background: 'var(--accent)', color: 'white', borderRadius: 6,
                  width: 24, height: 24, minWidth: 24, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700,
                }}>{i + 1}</span>
                <div>
                  <div className="mono" style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                    {p.patentNumber}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>
                    {p.rationale}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Novelty Concerns */}
      {report?.noveltyConcerns?.length > 0 && (
        <Section title="Potential Novelty Concerns" icon="⚡">
          <ul style={{ listStyle: 'none', display: 'grid', gap: 10 }}>
            {report.noveltyConcerns.map((c, i) => (
              <li key={i} style={{
                padding: '10px 16px', background: 'rgba(245,158,11,0.05)',
                border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8,
                color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6,
                borderLeft: '3px solid var(--warning)',
              }}>
                {c}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Manual Review */}
      {report?.manualReviewPatents?.length > 0 && (
        <Section title="Patents Requiring Manual Review" icon="👁">
          <div style={{ display: 'grid', gap: 10 }}>
            {report.manualReviewPatents.map((p, i) => (
              <div key={i} style={{
                padding: '10px 16px', background: 'rgba(239,68,68,0.05)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
                display: 'flex', gap: 12, alignItems: 'center',
              }}>
                <span className="mono" style={{ color: '#fca5a5', fontSize: '0.8rem' }}>{p.patentNumber}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{p.reason}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Footer note */}
      <div style={{
        marginTop: 24, padding: '14px 18px', borderRadius: 8,
        background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)',
        fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        ⚠️ <strong>Disclaimer:</strong> PatentPilot is a screening tool only, not a legal opinion.
        All outputs are traceable to retrieved patent data. Consult a qualified patent attorney for
        formal FTO analysis before any commercialization decision.
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}
