import mongoose from 'mongoose';

const comparisonSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentFirm', default: null, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    currentFilingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Filing', required: true },
    previousFilingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Filing', required: true },
    status: {
      type: String,
      enum: ['pending', 'comparing', 'summarizing', 'completed', 'failed'],
      default: 'pending',
    },
    progress: { type: Number, default: 0 },
    counts: {
      modified: { type: Number, default: 0 },
      added: { type: Number, default: 0 },
      removed: { type: Number, default: 0 },
    },
    overallScore: { type: Number, default: 0 },
    error: { type: String, default: null },
    isShared: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const FilingComparison = mongoose.model('FilingComparison', comparisonSchema);
