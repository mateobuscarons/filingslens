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

// One note in the thread under a report item. Multiple notes per item;
// any author allowed when the report is shared with the firm.
const noteSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, default: '' },     // denormalized so we don't populate on read
    text: { type: String, required: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const reportItemSchema = new mongoose.Schema(
  {
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchReport', required: true, index: true },
    kind: { type: String, enum: ['finding', 'answer'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    addedByName: { type: String, default: '' },
    // Analyst override for the displayed summary/answer text. When non-empty,
    // it replaces the LLM-generated text in the report rendering and PDF.
    // Empty string = use the canonical Finding/Question text. Stored at the
    // item level so the underlying Finding/Question stays untouched.
    userSummary: { type: String, default: '' },
    notes: { type: [noteSchema], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

reportItemSchema.index({ reportId: 1, order: 1 });

export const ReportItem = mongoose.model('ReportItem', reportItemSchema);
