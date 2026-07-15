import mongoose from 'mongoose';

const patentScoreSchema = new mongoose.Schema({
  queryId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Query', required: true, index: true },
  patentId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Patent', required: true },
  patentNumber:        { type: String, required: true },
  structuralSimilarity: { type: Number, default: 0 },   // 0–100
  semanticRelevance:   { type: Number, default: 0 },    // 0–100
  keywordOverlap:      { type: Number, default: 0 },    // 0–100
  recencyWeight:       { type: Number, default: 0 },    // 0–100
  compositeScore:      { type: Number, default: 0 },    // 0–100
  flaggedForReview:    { type: Boolean, default: false },
  reviewerNote:        { type: String },                 // 'reviewed' | 'needs_manual_look'
});

patentScoreSchema.index({ queryId: 1, patentId: 1 }, { unique: true });

export default mongoose.model('PatentScore', patentScoreSchema);
