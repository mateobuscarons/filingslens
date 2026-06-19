import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentFirm', default: null, index: true },
    comparisonId: { type: mongoose.Schema.Types.ObjectId, ref: 'FilingComparison', default: null },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    isShared: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const ResearchReport = mongoose.model('ResearchReport', reportSchema);

const reportItemSchema = new mongoose.Schema(
  {
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchReport', required: true, index: true },
    kind: { type: String, enum: ['finding', 'answer'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    note: { type: String, default: '' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

reportItemSchema.index({ reportId: 1, order: 1 });

export const ReportItem = mongoose.model('ReportItem', reportItemSchema);
