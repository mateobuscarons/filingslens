import mongoose from 'mongoose';

const citationSchema = new mongoose.Schema({
  sourceType: { type: String, enum: ['Finding', 'Question'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  paragraphId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paragraph', required: true },
  filingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Filing', required: true },
  filingYear: { type: Number, required: true },
  page: { type: Number, required: true },
  excerpt: { type: String, default: '' },
});

citationSchema.index({ sourceType: 1, sourceId: 1 });

export const Citation = mongoose.model('Citation', citationSchema);
