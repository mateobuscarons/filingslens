import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb } from '../db.js';
import { PricingPlan } from '../models/pricingPlan.js';
import { InvestmentFirm } from '../models/firm.js';
import { User } from '../models/user.js';
import { Subscription } from '../models/subscription.js';
import { Payment } from '../models/payment.js';

const PLANS = [
  { key: 'solo', name: 'Solo', basePrice: 29, baseSeats: 1, extraSeatPrice: 0 },
  { key: 'team', name: 'Team', basePrice: 149, baseSeats: 5, extraSeatPrice: 25 },
];

const RECOVERY_EMAIL = 'elena.steiner@frankfurt-investments.de';
const RECOVERY_PASSWORD = 'Demo1234!';

async function ensurePlans() {
  for (const p of PLANS) {
    await PricingPlan.updateOne({ key: p.key }, { $set: p }, { upsert: true });
  }
  console.log('[seed] plans: solo (€29) + team (€149 base + €25/extra seat)');
}

async function ensureRecoveryUser() {
  let firm = await InvestmentFirm.findOne({ name: 'Frankfurt Investments' });
  if (!firm) firm = await InvestmentFirm.create({ name: 'Frankfurt Investments', seatLimit: 5 });

  let elena = await User.findOne({ email: RECOVERY_EMAIL });
  if (!elena) {
    elena = await User.create({
      name: 'Elena Steiner',
      email: RECOVERY_EMAIL,
      passwordHash: await bcrypt.hash(RECOVERY_PASSWORD, 10),
      role: 'firm_admin',
      firmId: firm._id,
      emailVerified: true,
    });
  } else {
    await User.updateOne({ _id: elena._id }, { $set: { emailVerified: true, emailVerifyToken: null } });
  }

  const teamPlan = await PricingPlan.findOne({ key: 'team' });
  let sub = await Subscription.findOne({ subscriberType: 'InvestmentFirm', subscriberId: firm._id });
  if (!sub) {
    sub = await Subscription.create({
      subscriberType: 'InvestmentFirm',
      subscriberId: firm._id,
      planId: teamPlan._id,
      status: 'active',
    });
    await Payment.create({
      subscriptionId: sub._id,
      amount: teamPlan.basePrice,
      currency: 'EUR',
      status: 'succeeded',
      method: 'mock',
    });
  }

  console.log(`[seed] recovery user: ${RECOVERY_EMAIL} / ${RECOVERY_PASSWORD} (firm admin, Team plan, 5 seats)`);
}

async function main() {
  await connectDb();
  await ensurePlans();
  await ensureRecoveryUser();
  console.log('[seed] done');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
