import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EUR' },
    status: { type: String, enum: ['succeeded', 'failed', 'refunded'], default: 'succeeded' },
    method: { type: String, default: 'mock' },
    stripePaymentIntentId: { type: String, default: null },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);
