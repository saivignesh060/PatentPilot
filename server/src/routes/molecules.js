/**
 * routes/molecules.js
 * POST /api/molecules         — submit molecule
 * GET  /api/molecules/:id     — query status
 * GET  /api/molecules/:id/patents — ranked patent list
 * POST /api/molecules/:id/analyze — trigger Chain A
 * POST /api/molecules/:id/report  — trigger Chain B → report
 */
import { Router } from 'express';
import Query       from '../models/Query.js';
import Patent      from '../models/Patent.js';
import PatentScore from '../models/PatentScore.js';
import Analysis    from '../models/Analysis.js';
import Report      from '../models/Report.js';
import {
  resolveSMILES,
  getPubChemSynonyms,
  runRetrievalPipeline,
} from '../services/retrievalService.js';
import { scorePatents, computeRecommendation, shouldFlagManualReview } from '../services/scoringService.js';
import { runChainA, runChainB } from '../services/aiService.js';

const router = Router();

// ── POST /api/molecules ───────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { smiles, target = '', indication = '' } = req.body;
    if (!smiles?.trim()) return res.status(400).json({ error: 'smiles is required' });

    // Step 1: Validate + resolve via PubChem
    let resolved;
    try {
      resolved = await resolveSMILES(smiles.trim());
    } catch (err) {
      return res.status(422).json({ error: `Invalid SMILES: ${err.message}` });
    }

    // Step 2: Create query record
    const query = await Query.create({
      smiles:          smiles.trim(),
      canonicalSmiles: resolved.canonicalSmiles,
      pubchemCid:      resolved.cid,
      target:          target.trim(),
      indication:      indication.trim(),
      status:          'retrieving',
    });

    res.status(202).json({ queryId: query._id, status: 'retrieving', ...resolved });

    // Step 3: Async retrieval + scoring (non-blocking)
    (async () => {
      try {
        const synonyms = await getPubChemSynonyms(resolved.cid);
        const { patents, errors } = await runRetrievalPipeline({
          canonicalSmiles: resolved.canonicalSmiles,
          cid: resolved.cid,
          target, indication, synonyms,
        });

        if (errors.length) {
          console.warn('[Pipeline] Partial source failures:', errors);
        }

        await query.updateOne({ status: 'scoring' });

        await scorePatents({
          queryId: query._id,
          queryContext: { target, indication, synonyms, canonicalSmiles: resolved.canonicalSmiles },
          patents,
        });

        await query.updateOne({ status: 'ready' });
      } catch (err) {
        console.error('[Pipeline] Fatal error:', err);
        await query.updateOne({ status: 'error', errorMessage: err.message });
      }
    })();
  } catch (err) { next(err); }
});

// ── GET /api/molecules/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });
    res.json(query);
  } catch (err) { next(err); }
});

// ── GET /api/molecules/:id/patents ────────────────────────────────────────────
router.get('/:id/patents', async (req, res, next) => {
  try {
    const { sort = 'score', source } = req.query;
    const scores = await PatentScore.find({ queryId: req.params.id })
      .populate('patentId')
      .lean();

    let filtered = scores.filter((s) => s.patentId);
    if (source) filtered = filtered.filter((s) => s.patentId.source === source);

    const sorted = filtered.sort((a, b) =>
      sort === 'date'
        ? (b.patentId.publicationDate || '').localeCompare(a.patentId.publicationDate || '')
        : b.compositeScore - a.compositeScore
    );

    // Attach analysis if available
    const analyses = await Analysis.find({ queryId: req.params.id }).lean();
    const analysisMap = Object.fromEntries(analyses.map((a) => [String(a.patentId), a]));

    const result = sorted.map((s) => ({
      ...s.patentId,
      score:    s,
      analysis: analysisMap[String(s.patentId._id)] || null,
    }));

    res.json({ patents: result, total: result.length });
  } catch (err) { next(err); }
});

// ── POST /api/molecules/:id/analyze ──────────────────────────────────────────
// Triggers Chain A for top-K (default 15) patents
router.post('/:id/analyze', async (req, res, next) => {
  try {
    const K = parseInt(req.query.k || '15', 10);
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });
    if (query.status !== 'ready') {
      return res.status(409).json({ error: `Query is not ready yet (status: ${query.status})` });
    }

    // Get top-K scores
    const topScores = await PatentScore.find({ queryId: query._id })
      .sort({ compositeScore: -1 })
      .limit(K)
      .populate('patentId')
      .lean();

    res.json({ message: `Triggering Chain A for ${topScores.length} patents`, count: topScores.length });

    // Async AI analysis
    (async () => {
      for (const s of topScores) {
        try {
          await runChainA({
            queryId: query._id,
            patent:  s.patentId,
            score:   s,
            query,
          });
        } catch (err) {
          console.error(`[Chain A] Failed for ${s.patentId?.patentNumber}:`, err.message);
        }
      }
    })();
  } catch (err) { next(err); }
});

// ── POST /api/molecules/:id/report ───────────────────────────────────────────
router.post('/:id/report', async (req, res, next) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });

    const scores    = await PatentScore.find({ queryId: query._id }).lean();
    const analyses  = await Analysis.find({ queryId: query._id }).lean();

    if (!analyses.length) {
      return res.status(409).json({ error: 'Run /analyze first before generating a report' });
    }

    // Deterministic recommendation
    const scoreData = scores.map((s) => ({
      compositeScore:       s.compositeScore,
      structuralSimilarity: s.structuralSimilarity,
      confidence: analyses.find((a) => String(a.patentId) === String(s.patentId))?.confidence || 'Medium',
    }));
    const recommendation = computeRecommendation(scoreData);

    // Flagged patents
    const flaggedPatents = scores
      .filter((s) => {
        const a = analyses.find((a) => String(a.patentId) === String(s.patentId));
        return shouldFlagManualReview({ ...s, confidence: a?.confidence });
      })
      .map((s) => ({ patentNumber: s.patentNumber, reason: 'Low confidence or signal disagreement' }));

    // Chain B
    const chainBResult = await runChainB({
      query,
      analyses,
      scores,
      recommendation,
      flaggedPatents,
    });

    // Save report
    const report = await Report.findOneAndUpdate(
      { queryId: query._id },
      {
        queryId: query._id,
        ...chainBResult,
        recommendation,
        manualReviewPatents: flaggedPatents,
        generatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await query.updateOne({ reportId: report._id });

    res.json({ reportId: report._id, recommendation });
  } catch (err) { next(err); }
});

export default router;
