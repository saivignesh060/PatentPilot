# PatentPilot — Developer Notes
> Living document for build tracking. Updated after every phase.
> If context limit is hit, a new model can pick up from the last completed phase here.

---

## Project Summary
PatentPilot is a MERN + LangChain web tool for Freedom-to-Operate (FTO) patent screening.

**Flow:** Submit SMILES → Patent Discovery → Review Workspace → AI Analysis → FTO Report → History

**Stack:** React (Vite) + TailwindCSS + React Query | Express + Node.js | MongoDB/Mongoose | LangChain JS

---

## Confirmed Configuration

| Setting | Value |
|---|---|
| LLM Model | `gemini-3.1-flash-lite` |
| Embedding Model | `gemini-embedding-2` |
| LLM Provider | Gemini (Google AI Studio) |
| Database | MongoDB local (`mongodb://localhost:27017/patentpilot`) |
| Keyword Search | EPO Open Patent Services (OPS) — NOT PatentsView/USPTO |

---

## Environment Variables (.env)

```
GEMINI_API_KEY=           ← user will paste this (aistudio.google.com/apikey)
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.1-flash-lite
EMBEDDING_MODEL=gemini-embedding-2
EPO_OPS_CONSUMER_KEY=     ← user registering at developers.epo.org
EPO_OPS_CONSUMER_SECRET=  ← same
MONGODB_URI=mongodb://localhost:27017/patentpilot
PORT=5000
NODE_ENV=development
```

---

## Key Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| SMILES validation | PubChem PUG REST lookup | No RDKit needed, pure Node.js |
| Structural similarity | PubChem `fastsimilarity_2d` → cross-ref SureChEMBL | Free, no key |
| Keyword search | **EPO OPS** (NOT PatentsView/USPTO) | USPTO requires ID.me verification (impossible for non-US without passport). EPO OPS = free email signup, broader coverage (US/EP/WO) |
| AI layer | LangChain JS + Gemini | One key covers both LLM + embeddings |
| Embeddings | `gemini-embedding-2` via Gemini API | Cached per patent in MongoDB |
| Recommendation | Deterministic formula (not LLM) | Auditable, traceable |

---

## EPO OPS Integration Notes
- OAuth2 flow: POST to `https://ops.epo.org/3.2/auth/accesstoken` with `grant_type=client_credentials` + base64(`key:secret`)
- Then use bearer token for all CQL search calls
- CQL search endpoint: `https://ops.epo.org/3.2/rest-services/published-data/search`
- Example CQL: `ti="aspirin" OR ab="kinase inhibitor"` 
- Free tier: 3.5 GB/week — more than enough for screening tool
- Retry with exponential backoff on 429s

---

## Composite Scoring Formula

```
composite = 0.4 × structuralSimilarity
          + 0.3 × semanticRelevance
          + 0.2 × keywordOverlap
          + 0.1 × recencyWeight
```

### Risk Thresholds
- **Low Patent Risk** — max composite < 40 AND no patent ≥ 70
- **Requires Expert Review** — max composite 40–69 OR exactly one ≥ 70 (Med/Low confidence)
- **High Patent Risk** — structural similarity ≥ 85 on any patent OR two+ patents composite ≥ 70

### Manual Review Flag
- Chain A confidence = Low, OR |structuralSimilarity - semanticRelevance| > 30

---

## MongoDB Data Models

| Model | Key Fields |
|---|---|
| `Query` | smiles, canonicalSmiles, pubchemCid, target, indication, submittedAt, status |
| `Patent` | patentNumber (unique key), title, abstract, assigneeName, publicationDate, filingDate, source, url, fetchedAt |
| `PatentScore` | queryId, patentId, structuralSimilarity, semanticRelevance, keywordOverlap, recencyWeight, compositeScore |
| `Analysis` | queryId, patentId, whyRetrieved, similarAspects, potentialOverlap, confidence, confidenceReasoning |
| `Report` | queryId, executiveSummary, keySimilarPatents[], noveltyConcerns[], manualReviewPatents[], recommendation, recommendationRationale |

---

## API Endpoints (Backend)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/molecules` | Submit molecule |
| GET | `/api/molecules/:id` | Query status |
| GET | `/api/molecules/:id/patents` | Ranked patent list |
| POST | `/api/molecules/:id/analyze` | Trigger Chain A (top-K=15) |
| GET | `/api/patents/:id/analysis` | Get one patent's AI explanation |
| POST | `/api/molecules/:id/report` | Trigger Chain B → report |
| GET | `/api/reports/:id` | Fetch report |
| GET | `/api/history` | List past queries |
| GET | `/api/history/:id` | Reopen past report |

---

## LangChain Chains

### Chain A — Per-Patent Explanation (top K=15)
```json
{
  "whyRetrieved": "string",
  "similarAspects": "string",
  "potentialOverlap": "string",
  "confidence": "High | Medium | Low",
  "confidenceReasoning": "string"
}
```

### Chain B — Report Synthesis (once per query)
```json
{
  "executiveSummary": "string",
  "keySimilarPatents": [{ "patentNumber": "string", "rationale": "string" }],
  "noveltyConcerns": ["string"],
  "manualReviewPatents": [{ "patentNumber": "string", "reason": "string" }],
  "recommendation": "Low Patent Risk | Requires Expert Review | High Patent Risk",
  "recommendationRationale": "string"
}
```
> `recommendation` is computed deterministically BEFORE Chain B and passed as input fact.

---

## Project Structure

```
d:\PatentPilot\
├── client/                  ← React (Vite) frontend
│   ├── src/
│   │   ├── pages/           ← SubmitPage, WorkspacePage, ReportPage, HistoryPage
│   │   ├── components/      ← PatentCard, RiskBadge, MoleculeForm, etc.
│   │   ├── hooks/           ← React Query hooks
│   │   ├── api/             ← axios API client
│   │   └── App.jsx
│   ├── index.html
│   └── package.json
├── server/                  ← Express backend
│   ├── src/
│   │   ├── routes/          ← molecules.js, patents.js, reports.js, history.js
│   │   ├── services/        ← retrieval.js, scoring.js, ai.js, report.js
│   │   ├── models/          ← Query.js, Patent.js, PatentScore.js, Analysis.js, Report.js
│   │   ├── middleware/       ← rateLimiter.js, errorHandler.js
│   │   └── index.js
│   └── package.json
├── .env                     ← gitignored
├── .env.example
├── DEV_NOTES.md
├── PatentPilot-PRD.md
└── .gitignore
```

---

## Build Phases & Progress

- [x] **Phase 0** — API keys collected, .env created, DEV_NOTES set up
  - GEMINI_API_KEY: user will paste
  - EPO_OPS keys: user registering at developers.epo.org
  - MongoDB: local
- [x] **Phase 1** — Scaffold complete
  - `server/src/index.js` — Express + CORS + all routes mounted
  - `server/src/db.js` — Mongoose connection
  - `server/src/models/` — Query, Patent, PatentScore, Analysis, Report
  - `server/src/services/retrievalService.js` — PubChem + SureChEMBL + EPO OPS
  - `server/src/services/scoringService.js` — 4 components + composite + recommendation
  - `server/src/services/aiService.js` — LangChain Chain A + Chain B
  - `server/src/routes/` — molecules, patents, reports, history
  - `client/` — React Vite app with 4 pages + PatentCard component + Axios client
- [ ] **Phase 2** — Molecule submission + PubChem integration
- [ ] **Phase 3** — Patent retrieval: SureChEMBL + EPO OPS, merge/dedupe, cache
- [ ] **Phase 4** — Scoring: 4 components → composite; ranked list in Review Workspace
- [ ] **Phase 5** — AI Chain A: per-patent LangChain analysis, wired to UI
- [ ] **Phase 6** — Report: Chain B + deterministic recommendation, Report view
- [ ] **Phase 7** — History: persistence + list/detail views
- [ ] **Phase 8** — Polish: README, loading/error states, rate limiting, graceful degradation

---

## External APIs — Quick Reference

| API | Base URL | Auth |
|---|---|---|
| PubChem PUG REST | `https://pubchem.ncbi.nlm.nih.gov/rest/pug/` | None |
| SureChEMBL | `https://www.surechembl.org/api/` | None |
| EPO OPS | `https://ops.epo.org/3.2/` | OAuth2 (Consumer Key + Secret) |
| Gemini AI | `https://generativelanguage.googleapis.com/` | API Key |

---

## Session Log
| Date | What was done |
|---|---|
| 2026-07-16 | Read PRD (v1 + updated v2), noted EPO OPS replaces PatentsView, confirmed models, created .env + .env.example + DEV_NOTES, Phase 0 complete |
| 2026-07-16 | Phase 1 complete — full server + client scaffold, all 5 models, 3 services, 4 routes, 4 pages, PatentCard component, global CSS design system |

---
*Last updated: 2026-07-16*
