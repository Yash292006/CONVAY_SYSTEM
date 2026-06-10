import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';

// Load env variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5000',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.indexOf(origin) !== -1 ||
                      origin.startsWith('capacitor://') ||
                      origin.startsWith('http://localhost') ||
                      origin.startsWith('https://localhost') ||
                      origin.includes('10.0.2.2') ||
                      origin.includes('192.168.');

    if (isAllowed) {
      return callback(null, true);
    } else {
      var msg = 'The CORS policy for this site does not allow access from ' + origin;
      return callback(new Error(msg), false);
    }
  },
  credentials: true
}));

app.use(express.json()); // Allows us to read JSON data from the frontend

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/expenses', expenseRoutes);

// Fallback Route
app.get('/', (req, res) => {
  res.send('Convoy Coordinator API is running...');
});

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

const PORT = process.env.PORT || 5000;

// Create HTTP Server for WebSockets
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.indexOf(origin) !== -1 ||
                        origin.startsWith('capacitor://') ||
                        origin.startsWith('http://localhost') ||
                        origin.startsWith('https://localhost') ||
                        origin.includes('10.0.2.2') ||
                        origin.includes('192.168.');
      if (isAllowed) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'), false);
      }
    },
    methods: ["GET", "POST"]
  }
});


// The Radar Tower: Upgraded with Private Rooms
io.on('connection', (socket) => {
  console.log('📡 Radar ping - New connection:', socket.id);

  // A. Listen for a rider wanting to join a specific trip
  socket.on('joinTrip', (tripId) => {
    socket.join(tripId);
    console.log(`🏍️ Rider ${socket.id} tuned into trip frequency: ${tripId}`);
  });

  // B. Listen for location updates, but ONLY broadcast to the specific room
  socket.on('updateLocation', (data) => {
    // We now expect 'data' to include the tripId
    // socket.to(room) sends the data to everyone in that room EXCEPT the sender
    socket.to(data.tripId).emit('riderMoved', data);
  });

  // C. Listen for custom ping signals and broadcast to the trip room
  socket.on('pingRider', (data) => {
    socket.to(data.tripId).emit('pingReceived', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Rider dropped off radar:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Convoy API & Radar running on http://localhost:${PORT}`);
});
