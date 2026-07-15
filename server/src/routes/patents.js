import { Router } from 'express';
import Analysis from '../models/Analysis.js';

const router = Router();

// GET /api/patents/:id/analysis
router.get('/:id/analysis', async (req, res, next) => {
  try {
    const analysis = await Analysis.findOne({ patentId: req.params.id }).lean();
    if (!analysis) return res.status(404).json({ error: 'Analysis not found for this patent' });
    res.json(analysis);
  } catch (err) { next(err); }
});

export default router;
