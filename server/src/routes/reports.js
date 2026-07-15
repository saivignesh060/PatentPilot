import { Router } from 'express';
import Report from '../models/Report.js';

const router = Router();

// GET /api/reports/:id
router.get('/:id', async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id).populate('queryId').lean();
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (err) { next(err); }
});

export default router;
