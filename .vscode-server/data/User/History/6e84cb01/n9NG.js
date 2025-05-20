const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Machine = require('../models/Machine');
// Assuming your authMiddleware adds req.user = { id: ..., role: ... } from JWT

// Simple middleware to check if user is admin (or coach, etc.)
// Adjust the role check based on what you store in the JWT ('role: true' ?)
const isAdmin = (req, res, next) => {
    // Check if req.user exists and the role property is true
    if (!req.user || req.user.role !== true) {
        return res.status(403).json({ msg: 'User not authorized' }); // Forbidden
    }
    next();
};

// GET /api/machines/byTag/:tagId
// @desc    Get machine data by NFC Tag ID
// @access  Private (Any logged-in user can check a tag - adjust if needed)
router.get(
    '/byTag/:tagId',
    [
        authMiddleware, // User must be logged in to use this
        // Validation: Check tagId URL parameter exists and is not empty
        param('tagId', 'Tag ID parameter is required').not().isEmpty().trim()
    ],
    async (req, res) => {
        // Check for validation errors from the param() check above
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() }); // 400 Bad Request
        }

        // Get tagId from the URL parameter (/api/machines/byTag/THE_ID_HERE)
        const { tagId } = req.params;

        try {
            // Find one machine document where the 'tagId' field matches the parameter
            const machine = await Machine.findOne({ tagId: tagId });

            // If no machine is found with that tagId
            if (!machine) {
                // Send a 404 Not Found response
                return res.status(404).json({ msg: 'Machine not found for this tag' });
            }

            // If found, send the machine data back as JSON
            res.json(machine);

        } catch (err) {
            // Handle potential server/database errors
            console.error("Error fetching machine by tag:", err.message);
            res.status(500).send('Server error'); // 500 Internal Server Error
        }
    }
);

// --- POST /api/machines/register ---
// @desc    Register a new machine linked to an NFC tag
// @access  Private (Admin/Coach only)
router.post(
    '/register',
    [
        authMiddleware, // First, ensure user is logged in
        isAdmin,        // Second, ensure user has admin privileges
        // --- Input Validation ---
        body('tagId', 'NFC Tag ID is required').not().isEmpty().trim(),
        body('exerciseType', 'Exercise type is required').not().isEmpty().trim(),
        body('exerciseName', 'Exercise name is required').not().isEmpty().trim(),
        body('instructionsLink', 'Invalid URL format').optional({ checkFalsy: true }).isURL(),
        body('trainedMuscle', 'Trained muscle group is required').not().isEmpty().trim()
    ],
    async (req, res) => {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { tagId, exerciseType, exerciseName, instructionsLink, trainedMuscle } = req.body;

        try {
            // 1. Check if tagId already exists
            let existingMachine = await Machine.findOne({ tagId });
            if (existingMachine) {
                return res.status(400).json({ errors: [{ msg: 'This NFC Tag is already registered to another machine.' }] });
            }

            // 2. Create new machine instance
            const newMachine = new Machine({
                tagId,
                exerciseType,
                exerciseName,
                instructionsLink,
                trainedMuscle,
                registeredBy: req.user.id // Link to the admin/coach who registered it
            });

            // 3. Save machine to database
            await newMachine.save();

            res.status(201).json(newMachine); // Respond with the created machine data

        } catch (err) {
            console.error("Machine registration error:", err.message);
            // Handle potential database errors (e.g., unique index conflict if check above failed somehow)
            if (err.code === 11000) { // Duplicate key error code
                 return res.status(400).json({ errors: [{ msg: 'This NFC Tag ID is already registered (duplicate key).' }] });
            }
            res.status(500).send('Server error');
        }
    }
);

// Add other machine routes here later (e.g., GET /api/machines, GET /api/machines/:tagId, etc.)

module.exports = router;