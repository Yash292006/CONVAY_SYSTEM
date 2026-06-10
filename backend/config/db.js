import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const connStr = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/convoy_coordinator';
    console.log(`Connecting to MongoDB at: ${connStr}`);
    
    // Configure Mongoose options
    const conn = await mongoose.connect(connStr);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    console.log('Ensure MongoDB is running locally. Continuing in fallback mode if necessary.');
    // We do not exit the process, allowing server to boot so front-end does not crash
  }
};

export default connectDB;
