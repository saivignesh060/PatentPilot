import mongoose from 'mongoose';

// Chain A output — per query-patent pair
const analysisSchema = new mongoose.Schema({
  queryId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Query', required: true, index: true },
  patentId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Patent', required: true },
  patentNumber:        { type: String, required: true },
  whyRetrieved:        { type: String, default: '' },
  similarAspects:      { type: String, default: '' },
  potentialOverlap:    { type: String, default: '' },
  confidence:          { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  confidenceReasoning: { type: String, default: '' },
  generatedAt:         { type: Date, default: Date.now },
});

analysisSchema.index({ queryId: 1, patentId: 1 }, { unique: true });

export default mongoose.model('Analysis', analysisSchema);
