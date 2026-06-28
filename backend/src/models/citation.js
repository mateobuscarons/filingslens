import mongoose from 'mongoose';

// A Citation points at an exact span inside a paragraph so the UI can
// render `[N]` markers with inline highlighting. Span fields are required
// for new citations; legacy rows without them just render the whole
// excerpt without a highlight.
const citationSchema = new mongoose.Schema({
  sourceType: { type: String, enum: ['Finding', 'Question'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  paragraphId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paragraph', required: true },
  filingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Filing', required: true },
  filingYear: { type: Number, required: true },
  page: { type: Number, required: true },
  // Wider excerpt for the card body. The cited span sits inside it.
  excerpt: { type: String, default: '' },
  // The exact span the LLM grounded its claim in.
  claimText: { type: String, default: '' },
  charStart: { type: Number, default: null },
  charEnd: { type: Number, default: null },
  // Display order: which `[N]` does this map to?
  marker: { type: Number, default: null },
});

citationSchema.index({ sourceType: 1, sourceId: 1 });

export const Citation = mongoose.model('Citation', citationSchema);
