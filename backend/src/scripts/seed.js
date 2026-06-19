import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb } from '../db.js';
import { PricingPlan } from '../models/pricingPlan.js';
import { Company } from '../models/company.js';
import { Filing } from '../models/filing.js';
import { InvestmentFirm } from '../models/firm.js';
import { User } from '../models/user.js';
import { Subscription } from '../models/subscription.js';

const DEMO_PASSWORD = 'Demo1234!';

async function ensurePlans() {
  const plans = [
    { key: 'solo', name: 'Solo', seatLimit: 1, monthlyPrice: 29 },
    { key: 'team', name: 'Team', seatLimit: 5, monthlyPrice: 149 },
  ];
  for (const p of plans) {
    await PricingPlan.updateOne({ key: p.key }, { $set: p }, { upsert: true });
  }
  console.log('[seed] plans ok');
}

async function ensureCompanies() {
  const companies = [
    { name: 'Siemens AG', isin: 'DE0007236101', sector: 'Industrials' },
    { name: 'SAP SE', isin: 'DE0007164600', sector: 'Information Technology' },
    { name: 'Allianz SE', isin: 'DE0008404005', sector: 'Financials' },
  ];
  for (const c of companies) {
    await Company.updateOne({ isin: c.isin }, { $set: c }, { upsert: true });
  }
  console.log('[seed] companies ok');
}

async function ensureFilings() {
  const siemens = await Company.findOne({ isin: 'DE0007236101' });
  if (!siemens) return;
  const filings = [
    { companyId: siemens._id, fiscalYear: 2024, documentType: 'annual_report' },
    { companyId: siemens._id, fiscalYear: 2025, documentType: 'annual_report' },
  ];
  for (const f of filings) {
    await Filing.updateOne(
      { companyId: f.companyId, fiscalYear: f.fiscalYear },
      { $set: f },
      { upsert: true }
    );
  }
  console.log('[seed] filings ok');
}

async function ensureDemoUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const teamPlan = await PricingPlan.findOne({ key: 'team' });
  const soloPlan = await PricingPlan.findOne({ key: 'solo' });

  let firm = await InvestmentFirm.findOne({ name: 'Frankfurt Investments' });
  if (!firm) firm = await InvestmentFirm.create({ name: 'Frankfurt Investments', seatLimit: 5 });

  const upsertUser = async (email, name, role, firmId) => {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, name, role, firmId, passwordHash });
    }
    return user;
  };

  const elena = await upsertUser('elena.steiner@frankfurt-investments.de', 'Elena Steiner', 'firm_admin', firm._id);
  const daniel = await upsertUser('daniel.chen@chen-research.de', 'Daniel Chen', 'solo', null);

  const ensureSub = async (subscriberType, subscriberId, planId) => {
    const existing = await Subscription.findOne({ subscriberType, subscriberId });
    if (!existing) await Subscription.create({ subscriberType, subscriberId, planId, status: 'active' });
  };
  await ensureSub('InvestmentFirm', firm._id, teamPlan._id);
  await ensureSub('User', daniel._id, soloPlan._id);

  console.log('[seed] demo users ok');
  console.log(`         Elena:  elena.steiner@frankfurt-investments.de / ${DEMO_PASSWORD}  (firm admin)`);
  console.log(`         Daniel: daniel.chen@chen-research.de / ${DEMO_PASSWORD}  (solo)`);
}

async function main() {
  await connectDb();
  await ensurePlans();
  await ensureCompanies();
  await ensureFilings();
  await ensureDemoUsers();
  console.log('[seed] done');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
