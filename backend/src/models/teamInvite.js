import mongoose from 'mongoose';

// One invite per row. Admin creates it, returns the code to share. The
// invitee enters the code at register-time and gets attached to the firm.
const teamInviteSchema = new mongoose.Schema(
  {
    firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentFirm', required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const TeamInvite = mongoose.model('TeamInvite', teamInviteSchema);
