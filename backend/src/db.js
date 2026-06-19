import mongoose from 'mongoose';

export async function connectDb() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/filinglens';
  await mongoose.connect(uri);
  console.log(`[db] connected ${uri}`);
}
