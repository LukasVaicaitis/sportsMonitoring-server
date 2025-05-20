const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.put(
    '/me',
    [
        authMiddleware,
        body('name', 'Name cannot be empty').optional().not().isEmpty().trim(),
        body('dateOfBirth', 'Invalid date format').optional({ checkFalsy: true }).isISO8601().toDate(),
        body('height', 'Height must be a non-negative number').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        body('weight', 'Weight must be a non-negative number').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        body('experience', 'Experience must be a non-negative number').optional({ nullable: true }).isFloat({ min: 0 }),
        body('remindertime', 'Reminder time must be a non-negative integer').optional({ nullable: true }).isInt({ min: 0 }),
        body('activeGymId', 'Invalid Gym ID').optional({ nullable: true }).isMongoId(),

        body('preferences').optional().isObject().withMessage('Preferences must be an object'),
        body('preferences.workoutType', 'Invalid Workout Type Preference').optional().isIn(['Strength', 'Cardio', 'Flexibility', 'Mixed', 'Any']),
        body('preferences.muscleFocus', 'Invalid Muscle Focus Preference').optional().isIn(['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Full Body', 'Auto']),
        body('preferences.numExercises', 'Invalid Number of Exercises').optional().isInt({ min: 2, max: 10 }),
        body('preferences.repRange', 'Invalid Rep Range Preference').optional().isIn(['5-8', '8-12', '12-15', '15+'])
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const userId = req.user.id;
        const { name, dateOfBirth, height, weight, experience, remindertime, activeGymId, preferences } = req.body;

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            let user = await User.findById(userIdObject);
            if (!user) {
                return res.status(404).json({ msg: 'User not found' });
            }

            if (name !== undefined) user.name = name;
            if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
            if (height !== undefined) user.height = height;
            if (weight !== undefined) user.weight = weight;

            user.experience = (experience !== undefined) ? experience : user.experience;
            user.remindertime = (remindertime !== undefined) ? remindertime : user.remindertime;
            user.activeGymId = (activeGymId !== undefined) ? (activeGymId ? new mongoose.Types.ObjectId(activeGymId) : null) : user.activeGymId;

            if (preferences && typeof preferences === 'object') {
                user.preferences = user.preferences || {};
                let prefsChanged = false;

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

                if (prefsChanged) {
                    user.markModified('preferences');
                }
            }
            const updatedUser = await user.save();

            const userToSend = updatedUser.toObject();
            delete userToSend.password;
            res.json(userToSend);

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

module.exports = router;