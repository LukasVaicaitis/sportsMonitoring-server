const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Gym = require('../models/Gym');

const isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== true) {
        return res.status(403).json({ msg: 'User not authorized' }); // Forbidden
    }
    next();
};

// --- GET /api/gyms ---
// @desc    Get list of all gyms (e.g., for selection)
// @access  Private (Any logged-in user can see list)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const gyms = await Gym.find().sort({ name: 1 }); // Sort by name
        res.json(gyms);
    } catch (err) {
        console.error("Error fetching gyms:", err.message);
        res.status(500).send('Server Error');
    }
});

// --- POST /api/gyms ---
// @desc    Create a new gym
// @access  Private (Admin only)
router.post(
    '/',
    [
        authMiddleware,
        isAdmin, // Ensure only admins can create gyms
        body('name', 'Gym name is required').not().isEmpty().trim(),
        // Add other validations for address fields if needed
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, address } = req.body;

        try {
            let gym = await Gym.findOne({ name }); // Check if name already exists
            if (gym) {
                return res.status(400).json({ errors: [{ msg: 'Gym with that name already exists' }] });
            }

            gym = new Gym({ name, address });
            await gym.save();
            res.status(201).json(gym);

        } catch (err) {
            console.error("Error creating gym:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

// TODO: Add PUT /:id (update) and DELETE /:id (delete) routes later if needed (Admin only)

module.exports = router;