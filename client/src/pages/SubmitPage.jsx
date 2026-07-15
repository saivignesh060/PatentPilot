import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitMolecule } from '../api/client';

const EXAMPLE_SMILES = [
  { label: 'Aspirin',    smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { label: 'Ibuprofen',  smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O' },
  { label: 'Caffeine',   smiles: 'Cn1c(=O)c2c(ncn2C)n(C)c1=O' },
];

export default function SubmitPage() {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ smiles: '', target: '', indication: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.smiles.trim()) { setError('SMILES is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await submitMolecule(form);
      navigate(`/workspace/${result.queryId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed. Is the server running?');
      setLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          display: 'inline-block', padding: '4px 14px',
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 9999, fontSize: '0.75rem', color: 'var(--accent)',
          fontWeight: 600, marginBottom: 16, letterSpacing: '0.05em',
        }}>FREEDOM-TO-OPERATE SCREENING</div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.2, marginBottom: 12 }}>
          Patent<span style={{ color: 'var(--accent)' }}>Pilot</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: 480, margin: '0 auto' }}>
          Submit a molecule SMILES and get an AI-assisted, evidence-backed initial FTO signal
          with ranked patents and a structured patentability report.
        </p>
      </div>

      {/* Form */}
      <div className="glass-card" style={{ padding: 32 }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="smiles">SMILES String <span style={{ color: 'var(--danger)' }}>*</span></label>
            <textarea
              id="smiles" name="smiles" className="input mono"
              placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
              value={form.smiles}
              onChange={handleChange}
              rows={3}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
            {/* Quick examples */}
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EXAMPLE_SMILES.map((ex) => (
                <button
                  key={ex.label} type="button"
                  onClick={() => setForm(f => ({ ...f, smiles: ex.smiles }))}
                  style={{
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    color: 'var(--text-secondary)', borderRadius: 6, padding: '3px 10px',
                    fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.target.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.target.style.borderColor = 'var(--border)'}
                >{ex.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <label htmlFor="target">Biological Target <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <input
                id="target" name="target" className="input"
                placeholder="e.g. COX-1, EGFR, CDK4/6"
                value={form.target} onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="indication">Indication <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <input
                id="indication" name="indication" className="input"
                placeholder="e.g. Pain, NSCLC, Breast cancer"
                value={form.indication} onChange={handleChange}
              />
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.875rem',
            }}>{error}</div>
          )}

          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span className="spinner" style={{ width: 18, height: 18 }} />
                Validating molecule…
              </span>
            ) : 'Analyse Molecule →'}
          </button>
        </form>
      </div>

      {/* Pipeline explanation */}
      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[
          { icon: '🔬', title: 'Structural', desc: 'PubChem 2D fingerprint similarity + SureChEMBL mapping' },
          { icon: '🔑', title: 'Keyword', desc: 'EPO OPS CQL search across patent titles & abstracts' },
          { icon: '🧠', title: 'Semantic', desc: 'Gemini Embedding 2 cosine similarity ranking' },
        ].map((c) => (
          <div key={c.title} className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.875rem' }}>{c.title}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: 1.5 }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
