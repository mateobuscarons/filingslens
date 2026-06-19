import mongoose from 'mongoose';

const findingSchema = new mongoose.Schema(
  {
    comparisonId: { type: mongoose.Schema.Types.ObjectId, ref: 'FilingComparison', required: true, index: true },
    type: { type: String, enum: ['modified', 'added', 'removed'], required: true },
    section: { type: String, default: 'Unclassified' },
    currentParagraphId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paragraph', default: null },
    previousParagraphId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paragraph', default: null },
    similarity: { type: Number, default: 0 },
    materialityScore: { type: Number, default: 0 },
    impact: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
    summary: { type: String, default: null },
    excerpt: { type: String, default: '' },
    diff: {
      type: [
        {
          op: { type: String, enum: ['eq', 'add', 'rem'] },
          text: String,
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

findingSchema.index({ comparisonId: 1, materialityScore: -1 });

export const Finding = mongoose.model('Finding', findingSchema);
