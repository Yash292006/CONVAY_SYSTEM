import mongoose from 'mongoose';

const connectDB = async () => {
  const primaryConnStr = process.env.MONGO_URI;
  const localConnStr = 'mongodb://127.0.0.1:27017/convoy_coordinator';

  if (!primaryConnStr) {
    try {
      console.log(`Connecting to local MongoDB at: ${localConnStr}`);
      const conn = await mongoose.connect(localConnStr);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return;
    } catch (err) {
      console.error(`Local MongoDB Connection Error: ${err.message}`);
      return;
    }
  }

  try {
    console.log(`Connecting to primary MongoDB...`);
    const conn = await mongoose.connect(primaryConnStr, {
      serverSelectionTimeoutMS: 5000 // Fail fast (5 seconds) to trigger fallback
    });
    console.log(`MongoDB Connected (Primary): ${conn.connection.host}`);
  } catch (error) {
    console.error(`Primary MongoDB Connection Error: ${error.message}`);
    console.log(`Attempting fallback to local MongoDB at: ${localConnStr}...`);
    try {
      const conn = await mongoose.connect(localConnStr);
      console.log(`MongoDB Connected (Local Fallback): ${conn.connection.host}`);
    } catch (fallbackError) {
      console.error(`Local Fallback MongoDB Connection Error: ${fallbackError.message}`);
      console.log('Ensure MongoDB is running locally.');
    }
  }
};

export default connectDB;

