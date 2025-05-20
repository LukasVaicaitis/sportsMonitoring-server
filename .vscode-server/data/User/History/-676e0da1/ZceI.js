const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
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
        // Validation for top-level fields (keep as before)
        body('name', 'Name cannot be empty').optional().not().isEmpty().trim(),
        body('dateOfBirth', 'Invalid date format').optional({ checkFalsy: true }).isISO8601().toDate(),
        body('height', 'Height must be a non-negative number').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        body('weight', 'Weight must be a non-negative number').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        body('experience', 'Experience must be a non-negative number').optional({ nullable: true }).isFloat({ min: 0 }), // Allow null
        body('remindertime', 'Reminder time must be a non-negative integer').optional({ nullable: true }).isInt({ min: 0 }),
        body('activeGymId', 'Invalid Gym ID').optional({ nullable: true }).isMongoId(), // Allow null

        // --- ADD Validation for Preferences (optional fields within the object) ---
        body('preferences').optional().isObject().withMessage('Preferences must be an object'),
        body('preferences.workoutType', 'Invalid Workout Type Preference').optional().isIn(['Strength', 'Cardio', 'Flexibility', 'Mixed', 'Any']),
        body('preferences.muscleFocus', 'Invalid Muscle Focus Preference').optional().isIn(['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Full Body', 'Auto']),
        body('preferences.numExercises', 'Invalid Number of Exercises').optional().isInt({ min: 2, max: 10 }),
        body('preferences.repRange', 'Invalid Rep Range Preference').optional().isIn(['5-8', '8-12', '12-15', '15+'])
        // --- END Preference Validation ---
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.id;
        // Get all potential update fields from the body
        const { name, dateOfBirth, height, weight, experience, remindertime, activeGymId, preferences } = req.body;

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);

            // 1. Find the user document first
            let user = await User.findById(userIdObject);

            if (!user) {
                return res.status(404).json({ msg: 'User not found' });
            }

            // 2. Update top-level fields directly on the document IF they were provided
            if (name !== undefined) user.name = name;
            if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth; // Assumes validation converted to Date
            if (height !== undefined) user.height = height;
            if (weight !== undefined) user.weight = weight;
            // Use null if explicitly sent or field missing after trying parse, otherwise keep existing
            user.experience = (experience !== undefined) ? experience : user.experience;
            user.remindertime = (remindertime !== undefined) ? remindertime : user.remindertime;
            user.activeGymId = (activeGymId !== undefined) ? (activeGymId ? new mongoose.Types.ObjectId(activeGymId) : null) : user.activeGymId;


            // 3. Update preferences IF the preferences object was provided
            if (preferences && typeof preferences === 'object') {
                // Ensure preferences sub-document exists
                user.preferences = user.preferences || {};
                let prefsChanged = false; // Track if sub-doc changed

                // Update individual preference fields if they exist in the request body's preferences object
                if (preferences.workoutType !== undefined) {
                    user.preferences.workoutType = preferences.workoutType;
                    prefsChanged = true;
                }
                if (preferences.muscleFocus !== undefined) {
                    user.preferences.muscleFocus = preferences.muscleFocus;
                    prefsChanged = true;
                }
                if (preferences.numExercises !== undefined) {
                     user.preferences.numExercises = preferences.numExercises;
                     prefsChanged = true;
                 }
                if (preferences.repRange !== undefined) {
                     user.preferences.repRange = preferences.repRange;
                     prefsChanged = true;
                 }

                // If any nested field changed, mark the whole path as modified for Mongoose
                if (prefsChanged) {
                    user.markModified('preferences');
                }
            }

            // 4. Save the updated user document
            const updatedUser = await user.save();

            // 5. Exclude password and send back the updated user
            const userToSend = updatedUser.toObject();
            delete userToSend.password;
            res.json(userToSend);

        } catch (err) {
            console.error("Error updating profile:", err.message, err.stack); // Log stack too
            res.status(500).send('Server Error');
        }
    }
);

module.exports = router;