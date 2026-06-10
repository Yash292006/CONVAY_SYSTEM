import express from 'express';
import Expense from '../models/Expense.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/expenses - Fetch all global expenses
router.get('/', protect, async (req, res) => {
  try {
    const expenses = await Expense.find()
      .populate('paidBy', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch expenses', error: error.message });
  }
});

// POST /api/expenses - Add a new global expense
router.post('/', protect, async (req, res) => {
  try {
    const newExpense = new Expense({
      description: req.body.description,
      amount: parseFloat(req.body.amount),
      paidBy: req.user._id // From auth middleware
    });

    const savedExpense = await newExpense.save();
    
    // Populate details before returning
    const populatedExpense = await Expense.findById(savedExpense._id).populate('paidBy', 'name');
    
    res.status(201).json(populatedExpense);
  } catch (error) {
    res.status(500).json({ message: 'Failed to add expense', error: error.message });
  }
});

export default router;
