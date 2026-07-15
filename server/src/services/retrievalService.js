/**
 * retrievalService.js
 * Hybrid retrieval: PubChem structural → SureChEMBL mapping + EPO OPS keyword
 * Returns a merged, deduped array of patent candidates.
 */
import axios from 'axios';
import Bottleneck from 'bottleneck';
import Patent from '../models/Patent.js';

// ── Rate limiters (respect free-tier limits) ──────────────────────────────────
const pubchemLimiter = new Bottleneck({ minTime: 300 });   // ~3 req/s
const surechemblLimiter = new Bottleneck({ minTime: 500 }); // ~2 req/s
const epoLimiter = new Bottleneck({ minTime: 500 });        // ~2 req/s

// ── EPO OPS OAuth2 token cache ────────────────────────────────────────────────
let epoToken = null;
let epoTokenExpiry = 0;

async function getEpoToken() {
  if (epoToken && Date.now() < epoTokenExpiry - 60000) return epoToken;
  const key = process.env.EPO_OPS_CONSUMER_KEY;
  const secret = process.env.EPO_OPS_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('EPO_OPS_CONSUMER_KEY/SECRET not set in .env');
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
  const resp = await axios.post(
    'https://ops.epo.org/3.2/auth/accesstoken',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  epoToken = resp.data.access_token;
  epoTokenExpiry = Date.now() + resp.data.expires_in * 1000;
  return epoToken;
}

// ── 1. PubChem: validate SMILES + get CID + synonyms ─────────────────────────
export async function resolveSMILES(smiles) {
  const encoded = encodeURIComponent(smiles);
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/property/IsomericSMILES,CanonicalSMILES,IUPACName,MolecularFormula/JSON`;
  const resp = await pubchemLimiter.schedule(() => axios.get(url, { timeout: 15000 }));
  const props = resp.data.PropertyTable?.Properties?.[0];
  if (!props) throw new Error('PubChem could not parse this SMILES string.');
  return {
    cid: String(props.CID),
    canonicalSmiles: props.CanonicalSMILES,
    iupacName: props.IUPACName,
    molecularFormula: props.MolecularFormula,
  };
}

export async function getPubChemSynonyms(cid) {
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`;
    const resp = await pubchemLimiter.schedule(() => axios.get(url, { timeout: 10000 }));
    const syns = resp.data.InformationList?.Information?.[0]?.Synonym || [];
    return syns.slice(0, 10); // top 10 synonyms for keyword queries
  } catch {
    return [];
  }
}

// ── 2. PubChem: 2D fingerprint similarity search ─────────────────────────────
export async function getPubChemSimilarCIDs(canonicalSmiles, threshold = 85) {
  try {
    const encoded = encodeURIComponent(canonicalSmiles);
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastsimilarity_2d/smiles/${encoded}/cids/JSON?Threshold=${threshold}&MaxRecords=50`;
    const resp = await pubchemLimiter.schedule(() => axios.get(url, { timeout: 20000 }));
    return resp.data.IdentifierList?.CID?.map(String) || [];
  } catch {
    return [];
  }
}

// ── 3. SureChEMBL: CID/SMILES → patent mapping ───────────────────────────────
export async function getSureChEMBLPatents(smiles) {
  try {
    const encoded = encodeURIComponent(smiles);
    const url = `https://www.surechembl.org/api/search?q=${encoded}&format=json&limit=50`;
    const resp = await surechemblLimiter.schedule(() =>
      axios.get(url, { timeout: 20000, headers: { Accept: 'application/json' } })
    );
    const hits = resp.data?.results || resp.data?.hits || [];
    return hits.map((h) => ({
      patentNumber: h.patent_id || h.patent_number || h.id,
      title:        h.title || h.patent_title || '',
      abstract:     h.abstract || '',
      assigneeName: h.assignee || '',
      publicationDate: h.publication_date || h.pub_date || '',
      filingDate:   h.filing_date || '',
      source:       'SureChEMBL',
      url:          h.url || `https://www.surechembl.org/compound/${h.id}`,
      tanimoto:     h.tanimoto || h.similarity || 0,
    })).filter((p) => p.patentNumber);
  } catch (err) {
    console.warn('[SureChEMBL] retrieval failed:', err.message);
    return [];
  }
}

// ── 4. EPO OPS: keyword search ────────────────────────────────────────────────
export async function getEPOPatents(terms) {
  if (!terms.length) return [];
  try {
    const token = await getEpoToken();
    // Build CQL query from up to 5 terms
    const cqlTerms = terms
      .slice(0, 5)
      .map((t) => `ti="${t}" OR ab="${t}"`)
      .join(' OR ');
    const url = `https://ops.epo.org/3.2/rest-services/published-data/search`;
    const resp = await epoLimiter.schedule(() =>
      axios.get(url, {
        timeout: 20000,
        params: { q: cqlTerms, Range: '1-25' },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
    );
    const entries = resp.data?.['ops:world-patent-data']?.['ops:biblio-search']?.['ops:search-result']?.['ops:publication-reference'] || [];
    const list = Array.isArray(entries) ? entries : [entries];
    return list.map((e) => {
      const docId = e?.['document-id'];
      const country = docId?.country?.['$'] || '';
      const docNum  = docId?.['doc-number']?.['$'] || '';
      const kind    = docId?.kind?.['$'] || '';
      return {
        patentNumber: `${country}${docNum}${kind}`,
        title:        '',
        abstract:     '',
        assigneeName: '',
        publicationDate: docId?.date?.['$'] || '',
        filingDate:   '',
        source:       'EPO_OPS',
        url:          `https://worldwide.espacenet.com/patent/search/family/search?q=${country}${docNum}`,
        tanimoto:     0,
      };
    }).filter((p) => p.patentNumber && p.patentNumber.length > 2);
  } catch (err) {
    console.warn('[EPO OPS] retrieval failed:', err.message);
    return [];
  }
}

// ── 5. Fetch full patent metadata for EPO candidates ─────────────────────────
export async function enrichEPOPatent(patentNumber) {
  try {
    const token = await getEpoToken();
    const url = `https://ops.epo.org/3.2/rest-services/published-data/publication/epodoc/${patentNumber}/biblio`;
    const resp = await epoLimiter.schedule(() =>
      axios.get(url, {
        timeout: 15000,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
    );
    const bib = resp.data?.['ops:world-patent-data']?.['exchange-documents']?.['exchange-document'];
    if (!bib) return {};
    const inv = bib?.['bibliographic-data']?.['invention-title'];
    const title = Array.isArray(inv)
      ? (inv.find((t) => t?.['@lang'] === 'en')?.['$'] || inv[0]?.['$'] || '')
      : (inv?.['$'] || '');
    const abstObj = bib?.abstract;
    const abstract = Array.isArray(abstObj)
      ? (abstObj.find((a) => a?.['@lang'] === 'en')?.p?.['$'] || '')
      : (abstObj?.p?.['$'] || '');
    return { title, abstract };
  } catch {
    return {};
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function runRetrievalPipeline({ canonicalSmiles, target, indication, synonyms }) {
  const results = { surechembl: [], epo: [], errors: [] };

  // Parallel fetch
  const [surechemblPatents, epoPatents] = await Promise.allSettled([
    getSureChEMBLPatents(canonicalSmiles),
    getEPOPatents([target, indication, ...synonyms].filter(Boolean)),
  ]);

  if (surechemblPatents.status === 'fulfilled') {
    results.surechembl = surechemblPatents.value;
  } else {
    results.errors.push({ source: 'SureChEMBL', error: surechemblPatents.reason?.message });
  }
  if (epoPatents.status === 'fulfilled') {
    results.epo = epoPatents.value;
  } else {
    results.errors.push({ source: 'EPO_OPS', error: epoPatents.reason?.message });
  }

  // Merge + dedupe by patentNumber
  const seen = new Set();
  const merged = [];
  for (const p of [...results.surechembl, ...results.epo]) {
    if (p.patentNumber && !seen.has(p.patentNumber)) {
      seen.add(p.patentNumber);
      merged.push(p);
    }
  }

  // Upsert into Patent cache
  const cached = await Promise.all(
    merged.map(async (p) => {
      try {
        let enriched = {};
        if (p.source === 'EPO_OPS' && !p.title) {
          enriched = await enrichEPOPatent(p.patentNumber);
        }
        const doc = await Patent.findOneAndUpdate(
          { patentNumber: p.patentNumber },
          {
            $setOnInsert: {
              patentNumber:    p.patentNumber,
              title:           enriched.title || p.title,
              abstract:        enriched.abstract || p.abstract,
              assigneeName:    p.assigneeName,
              publicationDate: p.publicationDate,
              filingDate:      p.filingDate,
              source:          p.source,
              url:             p.url,
            },
          },
          { upsert: true, new: true }
        );
        return { patent: doc, tanimoto: p.tanimoto || 0 };
      } catch {
        return null;
      }
    })
  );

  return {
    patents: cached.filter(Boolean),
    errors:  results.errors,
  };
}
