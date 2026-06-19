import mongoose from 'mongoose';

const firmSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    seatLimit: { type: Number, default: 5 },
    planStatus: { type: String, enum: ['active', 'past_due', 'canceled'], default: 'active' },
  },
  { timestamps: true }
);

export const InvestmentFirm = mongoose.model('InvestmentFirm', firmSchema);
