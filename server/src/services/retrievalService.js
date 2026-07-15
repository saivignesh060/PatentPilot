/**
 * retrievalService.js
 * Hybrid retrieval:
 *   Structural → PubChem fastsimilarity_2d → PubChem patent xrefs (/xrefs/PatentID)
 *   Keyword    → EPO OPS CQL search (skipped gracefully if keys not set)
 * No SureChEMBL — their public REST API was discontinued.
 */
import axios from 'axios';
import Bottleneck from 'bottleneck';
import Patent from '../models/Patent.js';

// ── Rate limiters ─────────────────────────────────────────────────────────────
const pubchemLimiter = new Bottleneck({ minTime: 400, maxConcurrent: 3 });
const epoLimiter     = new Bottleneck({ minTime: 500, maxConcurrent: 2 });

// ── EPO OPS OAuth2 token cache ────────────────────────────────────────────────
let _epoToken = null;
let _epoTokenExpiry = 0;

async function getEpoToken() {
  if (_epoToken && Date.now() < _epoTokenExpiry - 60000) return _epoToken;
  const key    = process.env.EPO_OPS_CONSUMER_KEY?.trim();
  const secret = process.env.EPO_OPS_CONSUMER_SECRET?.trim();
  if (!key || !secret) return null; // graceful — no keys yet
  try {
    const creds = Buffer.from(`${key}:${secret}`).toString('base64');
    const resp  = await axios.post(
      'https://ops.epo.org/3.2/auth/accesstoken',
      'grant_type=client_credentials',
      { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    _epoToken       = resp.data.access_token;
    _epoTokenExpiry = Date.now() + resp.data.expires_in * 1000;
    return _epoToken;
  } catch (err) {
    console.warn('[EPO OPS] Token fetch failed:', err.message);
    return null;
  }
}

// ── PubChem helpers ───────────────────────────────────────────────────────────

/** Validate SMILES + return canonical form + CID */
export async function resolveSMILES(smiles) {
  const enc  = encodeURIComponent(smiles.trim());
  const url  = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${enc}/property/IsomericSMILES,CanonicalSMILES,IUPACName,MolecularFormula/JSON`;
  const resp = await pubchemLimiter.schedule(() => axios.get(url, { timeout: 15000 }));
  const props = resp.data?.PropertyTable?.Properties?.[0];
  if (!props) throw new Error('PubChem could not parse this SMILES string.');
  return {
    cid:             String(props.CID),
    canonicalSmiles: props.CanonicalSMILES,
    iupacName:       props.IUPACName || '',
    molecularFormula: props.MolecularFormula || '',
  };
}

/** Top-10 synonyms for keyword building */
export async function getPubChemSynonyms(cid) {
  try {
    const url  = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`;
    const resp = await pubchemLimiter.schedule(() => axios.get(url, { timeout: 10000 }));
    const syns = resp.data?.InformationList?.Information?.[0]?.Synonym || [];
    // filter to short, useful names (skip InChI, SMILES-like strings, very long names)
    return syns
      .filter(s => s.length < 60 && !s.startsWith('InChI') && !s.includes('='))
      .slice(0, 10);
  } catch { return []; }
}

/** PubChem 2D fingerprint similarity → list of similar CIDs above threshold */
export async function getPubChemSimilarCIDs(canonicalSmiles, threshold = 85) {
  try {
    const enc  = encodeURIComponent(canonicalSmiles);
    const url  = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastsimilarity_2d/smiles/${enc}/cids/JSON?Threshold=${threshold}&MaxRecords=30`;
    const resp = await pubchemLimiter.schedule(() => axios.get(url, { timeout: 20000 }));
    return (resp.data?.IdentifierList?.CID || []).map(String);
  } catch (err) {
    console.warn('[PubChem] Similarity search failed:', err.message);
    return [];
  }
}

/**
 * PubChem patent xrefs — structure-to-patent mapping (free, no key).
 * Returns up to `limit` patent IDs for a given CID.
 * Assigns an estimated tanimoto score based on whether the CID is the query itself (1.0) or similar (0.87).
 */
export async function getPubChemPatentsForCID(cid, queryCid, estimatedTanimoto = 0.87) {
  try {
    const url  = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/xrefs/PatentID/JSON`;
    const resp = await pubchemLimiter.schedule(() => axios.get(url, { timeout: 15000 }));
    const ids  = resp.data?.InformationList?.Information?.[0]?.PatentID || [];
    const tanimoto = cid === queryCid ? 1.0 : estimatedTanimoto;
    return ids.slice(0, 20).map(id => ({ patentNumber: id.replace(/\s+/g, ''), tanimoto, source: 'PubChem', cid }));
  } catch { return []; }
}

// ── EPO OPS helpers ───────────────────────────────────────────────────────────

/** Keyword search via EPO OPS CQL — skipped if no token */
export async function getEPOPatents(terms) {
  const token = await getEpoToken();
  if (!token) return []; // graceful degradation

  const cleanTerms = terms.filter(Boolean).slice(0, 5);
  if (!cleanTerms.length) return [];

  try {
    const cql  = cleanTerms.map(t => `ti="${t}" OR ab="${t}"`).join(' OR ');
    const resp = await epoLimiter.schedule(() =>
      axios.get('https://ops.epo.org/3.2/rest-services/published-data/search', {
        timeout: 20000,
        params: { q: cql, Range: '1-25' },
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
    );
    const entries = resp.data?.['ops:world-patent-data']
      ?.['ops:biblio-search']?.['ops:search-result']?.['ops:publication-reference'] || [];
    const list = Array.isArray(entries) ? entries : [entries];
    return list
      .map(e => {
        const d = e?.['document-id'];
        const country = d?.country?.['$'] || '';
        const docNum  = d?.['doc-number']?.['$'] || '';
        const kind    = d?.kind?.['$'] || '';
        const date    = d?.date?.['$'] || '';
        return {
          patentNumber: `${country}-${docNum}-${kind}`.replace(/--/, '-'),
          publicationDate: date,
          source: 'EPO_OPS',
          tanimoto: 0,
          url: `https://worldwide.espacenet.com/patent/search?q=${country}${docNum}`,
        };
      })
      .filter(p => p.patentNumber.length > 3);
  } catch (err) {
    console.warn('[EPO OPS] Search failed:', err.message);
    return [];
  }
}

/** Enrich a patent with title + abstract from EPO OPS biblio */
export async function enrichPatentWithEPO(patentNumber, token) {
  if (!token) return {};
  try {
    // EPO OPS uses epodoc format: country+number without hyphens
    const epodoc = patentNumber.replace(/-/g, '');
    const url    = `https://ops.epo.org/3.2/rest-services/published-data/publication/epodoc/${epodoc}/biblio`;
    const resp   = await epoLimiter.schedule(() =>
      axios.get(url, {
        timeout: 15000,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
    );
    const bib = resp.data?.['ops:world-patent-data']
      ?.['exchange-documents']?.['exchange-document'];
    if (!bib) return {};

    const invTitle = bib?.['bibliographic-data']?.['invention-title'];
    const title = Array.isArray(invTitle)
      ? (invTitle.find(t => t?.['@lang'] === 'en')?.['$'] || invTitle[0]?.['$'] || '')
      : (invTitle?.['$'] || '');

    const abstObj = bib?.abstract;
    const abstract = Array.isArray(abstObj)
      ? (abstObj.find(a => a?.['@lang'] === 'en')?.p?.['$'] || '')
      : (abstObj?.p?.['$'] || '');

    const assignees = bib?.['bibliographic-data']?.parties?.assignees?.assignee;
    const assignee  = Array.isArray(assignees)
      ? assignees[0]?.['applicant-name']?.name?.['$'] || ''
      : assignees?.['applicant-name']?.name?.['$'] || '';

    return { title, abstract, assigneeName: assignee };
  } catch { return {}; }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function runRetrievalPipeline({ canonicalSmiles, target, indication, synonyms, cid }) {
  const errors = [];

  // ── 1. PubChem structural path ────────────────────────────────────────────
  let structuralPatents = [];
  try {
    // Get similar CIDs (threshold 85%)
    const similarCIDs = await getPubChemSimilarCIDs(canonicalSmiles, 85);
    // Include the query CID itself
    const cidsToCheck = [...new Set([cid, ...similarCIDs])].slice(0, 15);

    console.log(`[Retrieval] Checking ${cidsToCheck.length} similar CIDs for patent xrefs…`);

    // Get patent IDs for each CID in parallel (rate-limited)
    const patentGroups = await Promise.all(
      cidsToCheck.map((c, idx) => {
        // Estimate tanimoto: query CID = 1.0, others decay slightly by rank
        const est = c === cid ? 1.0 : Math.max(0.85, 0.97 - idx * 0.01);
        return getPubChemPatentsForCID(c, cid, est);
      })
    );
    structuralPatents = patentGroups.flat();
    console.log(`[Retrieval] PubChem xrefs: ${structuralPatents.length} raw patent links`);
  } catch (err) {
    errors.push({ source: 'PubChem', error: err.message });
    console.error('[Retrieval] PubChem structural path failed:', err.message);
  }

  // ── 2. EPO OPS keyword path (graceful — skipped if no keys) ───────────────
  let keywordPatents = [];
  const epoToken = await getEpoToken();
  if (epoToken) {
    try {
      const terms = [target, indication, ...synonyms.slice(0, 3)].filter(Boolean);
      keywordPatents = await getEPOPatents(terms);
      console.log(`[Retrieval] EPO OPS keyword: ${keywordPatents.length} patents`);
    } catch (err) {
      errors.push({ source: 'EPO_OPS', error: err.message });
    }
  } else {
    console.log('[Retrieval] EPO OPS skipped — keys not configured yet');
    errors.push({ source: 'EPO_OPS', error: 'Keys not configured — add EPO_OPS_CONSUMER_KEY/SECRET to .env' });
  }

  // ── 3. Merge + dedupe by patentNumber ────────────────────────────────────
  const seen   = new Map(); // patentNumber → best entry
  for (const p of [...structuralPatents, ...keywordPatents]) {
    if (!p.patentNumber) continue;
    const existing = seen.get(p.patentNumber);
    if (!existing || p.tanimoto > existing.tanimoto) {
      seen.set(p.patentNumber, p);
    }
  }
  const merged = Array.from(seen.values());
  console.log(`[Retrieval] Merged unique patents: ${merged.length}`);

  // ── 4. Enrich with EPO OPS biblio (title/abstract) if token available ────
  const cached = await Promise.all(
    merged.map(async (p) => {
      try {
        // Try to enrich with EPO OPS
        let enriched = {};
        if (epoToken && !p.title) {
          enriched = await enrichPatentWithEPO(p.patentNumber, epoToken);
        }

        // Upsert into Patent cache
        const doc = await Patent.findOneAndUpdate(
          { patentNumber: p.patentNumber },
          {
            $setOnInsert: {
              patentNumber:    p.patentNumber,
              title:           enriched.title || p.title || '',
              abstract:        enriched.abstract || p.abstract || '',
              assigneeName:    enriched.assigneeName || p.assigneeName || '',
              publicationDate: p.publicationDate || extractDateFromPatentNumber(p.patentNumber),
              filingDate:      p.filingDate || '',
              source:          p.source || 'PubChem',
              url:             p.url || buildPatentUrl(p.patentNumber),
            },
          },
          { upsert: true, new: true }
        );
        return { patent: doc, tanimoto: p.tanimoto || 0 };
      } catch (err) {
        console.warn(`[Retrieval] Cache upsert failed for ${p.patentNumber}:`, err.message);
        return null;
      }
    })
  );

  return {
    patents: cached.filter(Boolean),
    errors,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Try to extract a year from common patent number formats */
function extractDateFromPatentNumber(pn) {
  const m = pn.match(/\b(19|20)\d{2}\b/);
  return m ? `${m[0]}0101` : '';
}

/** Build a viewer URL for a patent number */
function buildPatentUrl(patentNumber) {
  const clean = patentNumber.replace(/-/g, '');
  if (clean.startsWith('US')) {
    return `https://patents.google.com/patent/${clean}`;
  }
  return `https://worldwide.espacenet.com/patent/search?q=${encodeURIComponent(patentNumber)}`;
}
