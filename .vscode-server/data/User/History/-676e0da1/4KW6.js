const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth'); // Assuming your middleware is here
const User = require('../models/User'); // Adjust path if needed

// --- GET /api/profile/me ---
// @desc    Get current user's profile
// @access  Private
router.get('/me', authMiddleware, async (req, res) => {
    try {
        // req.user.id is added by the authMiddleware from the JWT payload
        const user = await User.findById(req.user.id).select('-password'); // Exclude password hash

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        console.error("Error fetching profile:", err.message);
        res.status(500).send('Server Error');
    }
});

// --- PUT /api/profile/me ---
// @desc    Update current user's profile
// @access  Private
router.put(
    '/me',
    [
        authMiddleware, // Apply auth middleware first
        // Add validation for the fields you allow updating
        body('name', 'Name cannot be empty').optional().not().isEmpty().trim(),
        body('dateOfBirth', 'Invalid date format').optional({ checkFalsy: true }).isISO8601().toDate(), // checkFalsy allows null/empty string to pass optional
        body('height', 'Height must be a non-negative number').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        body('weight', 'Weight must be a non-negative number').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        body('experience', 'Experience must be a non-negative number').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        // Add validation for reminderTime format if needed '^\d{2}:\d{2}$'
        body('remindertime', 'Reminder time must be a non-negative integer')
                .optional({ nullable: true, checkFalsy: false })
                .isInt({ min: 0 }),
        // DO NOT allow updating email or isAdministrator here without extra security checks
    ],
    async (req, res) => {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Build object with fields to update from request body
        const { name, dateOfBirth, height, weight, experience, remindertime } = req.body;
        const profileFields = {};
        if (name !== undefined) profileFields.name = name;
        if (dateOfBirth !== undefined) profileFields.dateOfBirth = dateOfBirth;
        if (height !== undefined) profileFields.height = height;
        if (weight !== undefined) profileFields.weight = weight;
        if (experience !== undefined) profileFields.experience = experience;
        if (remindertime !== undefined) profileFields.remindertime = remindertime;

        try {
            let user = await User.findById(req.user.id);

            if (!user) {
                return res.status(404).json({ msg: 'User not found' });
            }

            // Find user and update specified fields
            user = await User.findByIdAndUpdate(
                req.user.id,
                { $set: profileFields },
                { new: true, runValidators: true } // Return updated doc, run schema validators
            ).select('-password'); // Exclude password

            res.json(user); // Send back updated user profile

        } catch (err) {
            console.error("Error updating profile:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

module.exports = router;