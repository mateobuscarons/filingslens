import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentFirm', default: null },
    role: { type: String, enum: ['solo', 'firm_admin', 'firm_analyst'], required: true },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
