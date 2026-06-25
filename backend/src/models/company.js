import mongoose from 'mongoose';

// Companies are created dynamically when a user uploads the first filing for
// them. We dedup by `nameLower` (lowercase, trimmed) so that "Siemens AG" and
// "siemens ag" upload into the same Company row. The original casing is
// preserved in `name` for display.
const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    nameLower: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

export const Company = mongoose.model('Company', companySchema);
