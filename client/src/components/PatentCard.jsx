import { useState } from 'react';

const CONFIDENCE_COLORS = { High: 'var(--success)', Medium: 'var(--warning)', Low: 'var(--danger)' };

function ScoreBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>
        <span>{label}</span><span>{value}</span>
      </div>
      <div className="score-bar">
        <div className="score-fill" style={{ width: `${value}%`, background: color || 'var(--accent)' }} />
      </div>
    </div>
  );
}

export default function PatentCard({ patent }) {
  const [expanded, setExpanded] = useState(false);
  const { score, analysis } = patent;

  const composite = score?.compositeScore ?? 0;
  const barColor = composite >= 70 ? 'var(--danger)' : composite >= 40 ? 'var(--warning)' : 'var(--success)';
  const sourceColors = { SureChEMBL: '#6366f1', EPO_OPS: '#0ea5e9', PubChem: '#10b981' };

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Card header */}
      <div
        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 16 }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Score circle */}
        <div style={{
          width: 52, height: 52, minWidth: 52, borderRadius: '50%',
          background: `conic-gradient(${barColor} ${composite * 3.6}deg, var(--border) 0deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', fontWeight: 700, color: barColor,
          }}>{composite}</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span className="mono" style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600 }}>
              {patent.patentNumber}
            </span>
            <span style={{
              background: `${sourceColors[patent.source]}22`,
              color: sourceColors[patent.source],
              border: `1px solid ${sourceColors[patent.source]}44`,
              borderRadius: 4, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 600,
            }}>{patent.source}</span>
            {score?.flaggedForReview && (
              <span className="badge-review" style={{ fontSize: '0.65rem', padding: '1px 8px' }}>
                ⚑ Manual Review
              </span>
            )}
            {analysis && (
              <span style={{
                background: 'rgba(16,185,129,0.1)', color: 'var(--success)',
                border: '1px solid rgba(16,185,129,0.2)', borderRadius: 4,
                padding: '1px 7px', fontSize: '0.65rem', fontWeight: 600,
              }}>🧠 AI Analysed</span>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {patent.title || 'Title not available'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {patent.assigneeName && <span>👤 {patent.assigneeName}</span>}
            {patent.publicationDate && <span>📅 {patent.publicationDate}</span>}
          </div>
        </div>

        <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '20px' }}>
          {/* Score breakdown */}
          {score && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Score Breakdown
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
                <ScoreBar label="Structural Similarity (40%)" value={score.structuralSimilarity} color="var(--accent)" />
                <ScoreBar label="Semantic Relevance (30%)" value={score.semanticRelevance} color="#8b5cf6" />
                <ScoreBar label="Keyword Overlap (20%)" value={score.keywordOverlap} color="#10b981" />
                <ScoreBar label="Recency Weight (10%)" value={score.recencyWeight} color="#f59e0b" />
              </div>
            </div>
          )}

          {/* Abstract */}
          {patent.abstract && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Abstract
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                {patent.abstract}
              </p>
            </div>
          )}

          {/* AI Analysis */}
          {analysis && (
            <div style={{
              background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: 10, padding: 16, marginBottom: 12,
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
                🧠 AI Analysis
                <span style={{
                  background: `${CONFIDENCE_COLORS[analysis.confidence]}22`,
                  color: CONFIDENCE_COLORS[analysis.confidence],
                  border: `1px solid ${CONFIDENCE_COLORS[analysis.confidence]}44`,
                  borderRadius: 9999, padding: '1px 10px', fontSize: '0.65rem',
                }}>{analysis.confidence} Confidence</span>
              </div>
              {[
                { label: 'Why Retrieved', value: analysis.whyRetrieved },
                { label: 'Similar Aspects', value: analysis.similarAspects },
                { label: 'Potential Overlap', value: analysis.potentialOverlap },
                { label: 'Confidence Reasoning', value: analysis.confidenceReasoning },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.65 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* External link */}
          {patent.url && (
            <a href={patent.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: '0.8rem', textDecoration: 'none' }}>
              View on {patent.source === 'EPO_OPS' ? 'Espacenet' : 'SureChEMBL'} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
