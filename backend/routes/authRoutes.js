import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Generate JWT Helper
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'convoy_coordinator_secret', {
    expiresIn: '30d'
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
  const { name, email, password, bikeModel, moto } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'Rider already exists with this email' });
    }

    const user = await User.create({
      name,
      email,
      password,
      bikeModel: bikeModel || moto || 'Foot Passenger'
    });

    if (user) {
      res.status(201).json({
        message: 'Rider registered successfully',
        userId: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        bikeModel: user.bikeModel,
        token: generateToken(user._id)
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.status(200).json({
        message: 'Login successful',
        token: generateToken(user._id),
        _id: user._id,
        name: user.name,
        email: user.email,
        bikeModel: user.bikeModel,
        user: {
          id: user._id,
          name: user.name,
          bikeModel: user.bikeModel
        }
      });
    } else {
      res.status(400).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('friends', 'name email');
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get all users (excluding self) to discover friends
// @route   GET /api/auth/users
// @access  Private
router.get('/users', protect, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select('name email');
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Add a friend
// @route   POST /api/auth/add-friend
// @access  Private
router.post('/add-friend', protect, async (req, res) => {
  const { friendId } = req.body;

  try {
    if (!friendId) {
      return res.status(400).json({ message: 'Friend ID is required' });
    }

    const user = await User.findById(req.user._id);
    const friend = await User.findById(friendId);

    if (!friend) {
      return res.status(404).json({ message: 'Friend user not found' });
    }

    if (user.friends.includes(friendId)) {
      return res.status(400).json({ message: 'Already friends' });
    }

    // Add friend bidirectionally for ease of simulation
    user.friends.push(friendId);
    friend.friends.push(user._id);

    await user.save();
    await friend.save();

    res.json({ message: 'Friend added successfully', friends: user.friends });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get friend list
// @route   GET /api/auth/friends
// @access  Private
router.get('/friends', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('friends', 'name email');
    res.json(user.friends);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Fetch all registered riders
// @route   GET /api/auth/crew
// @access  Private
router.get('/crew', protect, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch crew', error: error.message });
  }
});

// @desc    Forgot password (simulated OTP)
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No user registered with this callsign / email' });
    }
    // Simulate sending OTP 123456
    res.status(200).json({ 
      message: 'Reset instructions dispatched to commlink', 
      otp: '123456' 
    });
  } catch (error) {
    res.status(500).json({ message: 'Password recovery failed', error: error.message });
  }
});

// @desc    Reset password using OTP
// @route   POST /api/auth/reset-password
// @access  Public
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    if (otp !== '123456') {
      return res.status(400).json({ message: 'Invalid override code / OTP' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No user registered with this callsign / email' });
    }
    user.password = newPassword;
    await user.save();
    res.status(200).json({ message: 'Access code reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Reset failed', error: error.message });
  }
});

// @desc    Google Sign In Simulation
// @route   POST /api/auth/google-login
// @access  Public
router.post('/google-login', async (req, res) => {
  const { email, name } = req.body;
  try {
    let user = await User.findOne({ email });
    if (!user) {
      // Create user if they don't exist
      user = await User.create({
        name,
        email,
        password: Math.random().toString(36).slice(-8), // random secure password
        bikeModel: 'Google Cruiser'
      });
    }
    res.status(200).json({
      message: 'Google login successful',
      token: generateToken(user._id),
      _id: user._id,
      name: user.name,
      email: user.email,
      bikeModel: user.bikeModel,
      user: {
        id: user._id,
        name: user.name,
        bikeModel: user.bikeModel
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Google authentication failed', error: error.message });
  }
});

export default router;
