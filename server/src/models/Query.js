import mongoose from 'mongoose';

const querySchema = new mongoose.Schema({
  smiles:          { type: String, required: true },
  canonicalSmiles: { type: String },
  pubchemCid:      { type: String },
  target:          { type: String, default: '' },
  indication:      { type: String, default: '' },
  submittedAt:     { type: Date, default: Date.now },
  status:          {
    type: String,
    enum: ['pending', 'retrieving', 'scoring', 'ready', 'error'],
    default: 'pending',
  },
  errorMessage:    { type: String },
  reportId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
});

export default mongoose.model('Query', querySchema);
