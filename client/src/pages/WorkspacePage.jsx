import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMolecule, getMoleculePatents,
  triggerAnalysis, triggerReport, getHistoryEntry,
} from '../api/client';
import PatentCard from '../components/PatentCard';

const STATUS_LABELS = {
  pending:    { label: 'Pending…',          color: 'var(--text-muted)' },
  retrieving: { label: 'Retrieving patents…',color: 'var(--accent)' },
  scoring:    { label: 'Scoring patents…',   color: 'var(--accent)' },
  ready:      { label: 'Ready',              color: 'var(--success)' },
  error:      { label: 'Error',              color: 'var(--danger)' },
};

export default function WorkspacePage({ fromHistory = false }) {
  const { queryId } = useParams();
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const [sort, setSort]     = useState('score');
  const [source, setSource] = useState('');
  const [analyzeTrigered, setAnalyzeTriggered] = useState(false);

  // Poll molecule status
  const { data: molecule } = useQuery({
    queryKey: ['molecule', queryId],
    queryFn:  () => fromHistory ? getHistoryEntry(queryId).then(r => r.query) : getMolecule(queryId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'ready' || s === 'error' ? false : 2000;
    },
  });

  // Load patents when ready
  const { data: patentData, isLoading: patentsLoading } = useQuery({
    queryKey: ['patents', queryId, sort, source],
    queryFn:  () => getMoleculePatents(queryId, { sort, source: source || undefined }),
    enabled:  molecule?.status === 'ready',
    refetchInterval: analyzeTrigered ? 4000 : false,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => triggerAnalysis(queryId),
    onSuccess:  () => { setAnalyzeTriggered(true); },
  });

  const reportMutation = useMutation({
    mutationFn: () => triggerReport(queryId),
    onSuccess:  (data) => navigate(`/report/${data.reportId}`),
  });

  const status = molecule?.status;
  const patents = patentData?.patents || [];
  const analysedCount = patents.filter((p) => p.analysis).length;
  const hasAnalysis = analysedCount > 0;
  const allAnalysed = hasAnalysis && analysedCount >= Math.min(patents.length, 15);

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Review Workspace</h1>
            {status && (
              <span style={{
                background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
                color: STATUS_LABELS[status]?.color, borderRadius: 9999,
                padding: '2px 12px', fontSize: '0.75rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {(status === 'retrieving' || status === 'scoring') && (
                  <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                )}
                {STATUS_LABELS[status]?.label}
              </span>
            )}
          </div>
          {molecule && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              <span className="mono" style={{ color: 'var(--accent)', marginRight: 12 }}>
                {molecule.canonicalSmiles || molecule.smiles}
              </span>
              {molecule.target && <span>Target: <strong>{molecule.target}</strong>  </span>}
              {molecule.indication && <span>Indication: <strong>{molecule.indication}</strong></span>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {analyzeTrigered && !allAnalysed && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              Analysing {analysedCount}/{Math.min(patents.length, 15)} patents…
            </span>
          )}
          {status === 'ready' && !analyzeTrigered && (
            <button
              className="btn-ghost"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? 'Starting…' : '🧠 Run AI Analysis'}
            </button>
          )}
          {hasAnalysis && (
            <button
              className="btn-primary"
              onClick={() => reportMutation.mutate()}
              disabled={reportMutation.isPending}
            >
              {reportMutation.isPending ? 'Generating…' : '📄 Generate Report'}
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {molecule?.status === 'error' && (
        <div className="glass-card" style={{
          padding: 20, borderColor: 'rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.05)', color: '#fca5a5',
        }}>
          ⚠️ Retrieval error: {molecule.errorMessage}
        </div>
      )}

      {/* Loading skeleton */}
      {(status === 'retrieving' || status === 'scoring' || status === 'pending') && (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1,2,3].map((i) => (
            <div key={i} className="glass-card" style={{ padding: 24 }}>
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: '75%' }} />
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      {status === 'ready' && patents.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {patents.length} patents found
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <select
              value={sort} onChange={(e) => setSort(e.target.value)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', borderRadius: 6, padding: '6px 12px',
                fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              <option value="score">Sort: Relevance Score</option>
              <option value="date">Sort: Date</option>
            </select>
            <select
              value={source} onChange={(e) => setSource(e.target.value)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', borderRadius: 6, padding: '6px 12px',
                fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              <option value="">All Sources</option>
              <option value="PubChem">PubChem (Structural)</option>
              <option value="EPO_OPS">EPO OPS (Keyword)</option>
            </select>
          </div>
        </div>
      )}

      {/* Patent cards */}
      {status === 'ready' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {patents.length === 0 ? (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No patents retrieved. Try adding a target or indication to improve keyword matching.
            </div>
          ) : (
            patents.map((patent) => <PatentCard key={patent._id} patent={patent} />)
          )}
        </div>
      )}
    </div>
  );
}
