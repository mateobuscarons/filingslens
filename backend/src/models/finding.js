import mongoose from 'mongoose';

const findingSchema = new mongoose.Schema(
  {
    comparisonId: { type: mongoose.Schema.Types.ObjectId, ref: 'FilingComparison', required: true, index: true },
    type: { type: String, enum: ['modified', 'added', 'removed'], required: true },
    // The LLM-emitted topic label ("Board compensation", "Pension provisions").
    section: { type: String, default: 'Untitled' },
    currentParagraphId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paragraph', default: null },
    previousParagraphId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paragraph', default: null },
    materialityScore: { type: Number, default: 0 },  // sort key only — derived from impact bucket
    impact: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
    summary: { type: String, default: null },
    excerpt: { type: String, default: '' },           // current paragraph text for fallback display
  },
  { timestamps: true }
);

findingSchema.index({ comparisonId: 1, materialityScore: -1 });

export const Finding = mongoose.model('Finding', findingSchema);
