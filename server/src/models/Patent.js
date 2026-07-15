import mongoose from 'mongoose';

// Cached globally — keyed by patentNumber to avoid re-fetching
const patentSchema = new mongoose.Schema({
  patentNumber:    { type: String, required: true, unique: true, index: true },
  title:           { type: String, default: '' },
  abstract:        { type: String, default: '' },
  assigneeName:    { type: String, default: '' },
  publicationDate: { type: String },
  filingDate:      { type: String },
  source:          { type: String, enum: ['SureChEMBL', 'EPO_OPS', 'PubChem'], required: true },
  url:             { type: String },
  fetchedAt:       { type: Date, default: Date.now },
  // Embedding cached to avoid re-computation
  abstractEmbedding: { type: [Number], default: undefined },
});

export default mongoose.model('Patent', patentSchema);
