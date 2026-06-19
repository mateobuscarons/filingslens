import mongoose from 'mongoose';

const qaSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  },
  { timestamps: true }
);

qaSessionSchema.index({ userId: 1, companyId: 1 }, { unique: true });

export const QASession = mongoose.model('QASession', qaSessionSchema);

const questionSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QASession', required: true, index: true },
    text: { type: String, required: true },
    answer: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'ready', 'failed', 'no_evidence'], default: 'pending' },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

export const Question = mongoose.model('Question', questionSchema);
