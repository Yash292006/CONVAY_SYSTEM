import express from 'express';
import Trip from '../models/Trip.js';
import Expense from '../models/Expense.js';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Get all trips for authenticated user
// @route   GET /api/trips
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Filter by user's admin/memberships.
    const query = { $or: [{ admin: userId }, { members: userId }] };

    const trips = await Trip.find(query)
      .sort({ startDate: 1 })
      .populate('admin', 'name email')
      .populate('members', 'name email');

    res.status(200).json(trips);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trips', error: error.message });
  }
});

// @desc    Get single trip details (with expenses)
// @route   GET /api/trips/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate('admin', 'name email')
      .populate('members', 'name email');

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const expenses = await Expense.find({ tripId: trip._id })
      .populate('paidBy', 'name email')
      .populate('splitAmong', 'name email');

    res.json({ trip, expenses });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Create a new trip
// @route   POST /api/trips
// @access  Private
router.post('/', protect, async (req, res) => {
  const { title, destination, startDate, origin, description } = req.body;

  try {
    const adminId = req.user._id;

    const trip = await Trip.create({
      title: title || 'New Convoy Run',
      destination: destination || 'Gokarna',
      origin: origin || 'Start Point',
      description: description || '',
      admin: adminId,
      members: [adminId],
      startDate: startDate || Date.now(),
      status: 'planning'
    });

    const populatedTrip = await Trip.findById(trip._id)
      .populate('admin', 'name email')
      .populate('members', 'name email');

    res.status(201).json(populatedTrip);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create trip', error: error.message });
  }
});

// @desc    Add member to trip
// @route   POST /api/trips/:id/members
// @access  Private
router.post('/:id/members', protect, async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const userToAdd = await User.findOne({ email });
    if (!userToAdd) {
      return res.status(404).json({ message: 'User not found with this email' });
    }

    if (trip.members.includes(userToAdd._id)) {
      return res.status(400).json({ message: 'User is already a member of this trip' });
    }

    trip.members.push(userToAdd._id);
    await trip.save();

    const updatedTrip = await Trip.findById(trip._id)
      .populate('admin', 'name email')
      .populate('members', 'name email');

    res.json(updatedTrip);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Add expense to trip
// @route   POST /api/trips/:id/expenses
// @access  Private
router.post('/:id/expenses', protect, async (req, res) => {
  const { description, amount, paidById, splitAmongIds } = req.body;

  try {
    if (!description || !amount || !paidById || !splitAmongIds || splitAmongIds.length === 0) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const expense = await Expense.create({
      tripId: trip._id,
      description,
      amount: parseFloat(amount),
      paidBy: paidById,
      splitAmong: splitAmongIds
    });

    const populatedExpense = await Expense.findById(expense._id)
      .populate('paidBy', 'name email')
      .populate('splitAmong', 'name email');

    res.status(201).json(populatedExpense);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Delete expense from trip
// @route   DELETE /api/trips/:id/expenses/:expenseId
// @access  Private
router.delete('/:id/expenses/:expenseId', protect, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.expenseId);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    await Expense.findByIdAndDelete(expense._id);
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Update trip status
// @route   PATCH /api/trips/:id/status
// @access  Private
router.patch('/:id/status', protect, async (req, res) => {
  const { status } = req.body;
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (trip.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the convoy lead can change status' });
    }
    trip.status = status;
    await trip.save();
    res.json({ status: trip.status });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Update trip notes
// @route   PATCH /api/trips/:id/notes
// @access  Private
router.patch('/:id/notes', protect, async (req, res) => {
  const { notes } = req.body;
  try {
    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      { notes },
      { new: true }
    );
    res.json({ notes: trip.notes });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Add waypoint to trip
// @route   POST /api/trips/:id/waypoints
// @access  Private
router.post('/:id/waypoints', protect, async (req, res) => {
  const { name, type, note, estimatedTime } = req.body;
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    trip.waypoints.push({ name, type: type || 'checkpoint', note: note || '', estimatedTime: estimatedTime || '' });
    await trip.save();
    res.status(201).json(trip.waypoints);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Toggle waypoint reached
// @route   PATCH /api/trips/:id/waypoints/:wid/reached
// @access  Private
router.patch('/:id/waypoints/:wid/reached', protect, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    const wp = trip.waypoints.id(req.params.wid);
    if (!wp) return res.status(404).json({ message: 'Waypoint not found' });
    wp.reached = !wp.reached;
    wp.reachedAt = wp.reached ? new Date() : null;
    await trip.save();
    res.json(trip.waypoints);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Delete waypoint
// @route   DELETE /api/trips/:id/waypoints/:wid
// @access  Private
router.delete('/:id/waypoints/:wid', protect, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    trip.waypoints.pull({ _id: req.params.wid });
    await trip.save();
    res.json(trip.waypoints);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
