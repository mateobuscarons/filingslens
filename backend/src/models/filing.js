import mongoose from 'mongoose';

const filingSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    fiscalYear: { type: Number, required: true },
    fileName: { type: String, default: '' },
    pageCount: { type: Number, default: 0 },
    ingestStatus: {
      type: String,
      enum: ['pending', 'parsing', 'embedding', 'ready', 'failed'],
      default: 'pending',
    },
    ingestError: { type: String, default: null },
  },
  { timestamps: true }
);

filingSchema.index({ companyId: 1, fiscalYear: 1 }, { unique: true });

export const Filing = mongoose.model('Filing', filingSchema);
