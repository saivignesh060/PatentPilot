import { Router } from 'express';
import Query   from '../models/Query.js';
import Report  from '../models/Report.js';
import PatentScore from '../models/PatentScore.js';
import Analysis from '../models/Analysis.js';

const router = Router();

// GET /api/history — list all past queries with report summaries
router.get('/', async (req, res, next) => {
  try {
    const queries = await Query.find({ status: 'ready' })
      .sort({ submittedAt: -1 })
      .lean();

    const history = await Promise.all(
      queries.map(async (q) => {
        const report = q.reportId
          ? await Report.findById(q.reportId).select('recommendation generatedAt').lean()
          : null;
        return {
          _id:            q._id,
          smiles:         q.smiles,
          canonicalSmiles: q.canonicalSmiles,
          target:         q.target,
          indication:     q.indication,
          submittedAt:    q.submittedAt,
          status:         q.status,
          recommendation: report?.recommendation || null,
          reportId:       report?._id || null,
          reportGeneratedAt: report?.generatedAt || null,
        };
      })
    );

    res.json(history);
  } catch (err) { next(err); }
});

// GET /api/history/:id — reopen full report + patent list for a past query
router.get('/:id', async (req, res, next) => {
  try {
    const query = await Query.findById(req.params.id).lean();
    if (!query) return res.status(404).json({ error: 'History entry not found' });

    const report = query.reportId
      ? await Report.findById(query.reportId).lean()
      : null;

    const scores = await PatentScore.find({ queryId: query._id })
      .populate('patentId')
      .sort({ compositeScore: -1 })
      .lean();

    const analyses = await Analysis.find({ queryId: query._id }).lean();
    const analysisMap = Object.fromEntries(analyses.map((a) => [String(a.patentId), a]));

    const patents = scores
      .filter((s) => s.patentId)
      .map((s) => ({
        ...s.patentId,
        score:    s,
        analysis: analysisMap[String(s.patentId._id)] || null,
      }));

    res.json({ query, report, patents });
  } catch (err) { next(err); }
});

export default router;
