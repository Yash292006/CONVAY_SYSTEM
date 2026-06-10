import mongoose from 'mongoose';

const waypointSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  type:        { type: String, enum: ['fuel', 'food', 'rest', 'checkpoint', 'custom'], default: 'checkpoint' },
  note:        { type: String, default: '' },
  reached:     { type: Boolean, default: false },
  reachedAt:   { type: Date },
  lat:         { type: Number },
  lng:         { type: Number },
  estimatedTime: { type: String }
}, { timestamps: true });

const tripSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  origin: {
    type: String,
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  distanceKm: {
    type: Number
  },
  notes: {
    type: String,
    default: ''
  },
  routePoints: [{
    lat: Number,
    lng: Number
  }],
  waypoints: [waypointSchema],
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['planning', 'active', 'completed'],
    default: 'planning'
  },
  startDate: {
    type: Date
  }
}, {
  timestamps: true
});

const Trip = mongoose.model('Trip', tripSchema);
export default Trip;
