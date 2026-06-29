import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    subscriberType: { type: String, enum: ['User', 'InvestmentFirm'], required: true },
    subscriberId: { type: mongoose.Schema.Types.ObjectId, required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'PricingPlan', required: true },
    status: { type: String, enum: ['active', 'past_due', 'canceled'], default: 'active' },
    startedAt: { type: Date, default: Date.now },
    canceledAt: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    currentPeriodEnd: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
