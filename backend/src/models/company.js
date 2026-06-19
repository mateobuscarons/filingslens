import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  isin: { type: String, required: true, unique: true },
  sector: { type: String, required: true },
});

export const Company = mongoose.model('Company', companySchema);
