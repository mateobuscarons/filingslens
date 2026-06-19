import mongoose from 'mongoose';

const pricingPlanSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  seatLimit: { type: Number, required: true },
  monthlyPrice: { type: Number, required: true },
});

export const PricingPlan = mongoose.model('PricingPlan', pricingPlanSchema);
