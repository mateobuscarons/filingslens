import mongoose from 'mongoose';

// Solo: basePrice=29, baseSeats=1, extraSeatPrice=0
// Team: basePrice=149, baseSeats=5, extraSeatPrice=25
//   final monthly amount = basePrice + max(0, seats - baseSeats) * extraSeatPrice
const pricingPlanSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  basePrice: { type: Number, required: true },
  baseSeats: { type: Number, required: true },
  extraSeatPrice: { type: Number, required: true, default: 0 },
});

export const PricingPlan = mongoose.model('PricingPlan', pricingPlanSchema);
