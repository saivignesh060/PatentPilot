import mongoose from 'mongoose';

// Chain B output — one per query
const reportSchema = new mongoose.Schema({
  queryId:               { type: mongoose.Schema.Types.ObjectId, ref: 'Query', required: true, unique: true },
  executiveSummary:      { type: String, default: '' },
  keySimilarPatents:     [{ patentNumber: String, rationale: String }],
  noveltyConcerns:       [String],
  manualReviewPatents:   [{ patentNumber: String, reason: String }],
  recommendation:        {
    type: String,
    enum: ['Low Patent Risk', 'Requires Expert Review', 'High Patent Risk'],
    required: true,
  },
  recommendationRationale: { type: String, default: '' },
  generatedAt:           { type: Date, default: Date.now },
});

export default mongoose.model('Report', reportSchema);
