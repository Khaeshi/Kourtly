import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// GET all users (admin panel - user management page)
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single user by email (called by Auth.js after sign-in to get role)
router.get('/by-email/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upsert user — called by Auth.js on every sign-in
// Creates user if new, updates name/image if existing, never overwrites role
router.post('/upsert', async (req, res) => {
  try {
    const { email, name, image, provider } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        $set:         { name, image, provider },   
        $setOnInsert: { role: 'user' },            
      },
      { upsert: true, new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH toggle role (admin only action — protect this in production with session check)
router.patch('/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be user or admin' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;