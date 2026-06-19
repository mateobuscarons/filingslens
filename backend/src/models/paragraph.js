import mongoose from 'mongoose';

const paragraphSchema = new mongoose.Schema({
  filingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Filing', required: true, index: true },
  page: { type: Number, required: true },
  index: { type: Number, required: true },
  section: { type: String, default: 'Unclassified' },
  text: { type: String, required: true },
  embedding: { type: [Number], default: [] },
});

paragraphSchema.index({ filingId: 1, page: 1, index: 1 });

export const Paragraph = mongoose.model('Paragraph', paragraphSchema);
