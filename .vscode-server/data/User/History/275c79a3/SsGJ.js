// routes/statistics.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Workout = require('../models/Workout'); // Assuming path is correct

// --- GET /api/statistics/summary ---
// @desc    Get summary statistics for the logged-in user
// @access  Private
router.get('/summary', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const userIdObject = new mongoose.Types.ObjectId(userId);

    try {
        // Calculate date ranges
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        // --- Fetch workouts within the last 30 days ---
        // We need date (string), startTime (Date), endTime (Date), workoutType
        const recentWorkouts = await Workout.find({
            userId: userIdObject,
            status: 'completed',
            date: { $gte: thirtyDaysAgo.toLocaleDateString('sv-SE') } // Filter by date string >= 30 days ago
        })
        .select('date startTime endTime workoutType') // Select necessary fields
        .lean(); // Use lean for plain objects

        // --- Calculate Stats ---
        let workoutsThisWeek = 0;
        let durationThisWeekMinutes = 0;
        const typeCounts = {};
        const sevenDaysAgoString = sevenDaysAgo.toLocaleDateString('sv-SE');

        recentWorkouts.forEach(workout => {
            // Weekly Stats
            if (workout.date >= sevenDaysAgoString) {
                workoutsThisWeek++;
                if (workout.startTime && workout.endTime) {
                    const durationMillis = new Date(workout.endTime).getTime() - new Date(workout.startTime).getTime();
                    durationThisWeekMinutes += Math.round(durationMillis / (1000 * 60)); // Add duration in minutes
                }
            }

            // Monthly Type Count
            if (workout.workoutType) {
                typeCounts[workout.workoutType] = (typeCounts[workout.workoutType] || 0) + 1;
            }
        });

        // Find dominant type
        let dominantType = 'N/A';
        let maxCount = 0;
        for (const type in typeCounts) {
            if (typeCounts[type] > maxCount) {
                maxCount = typeCounts[type];
                dominantType = type;
            }
        }

        // --- Prepare Summary Response ---
        const summary = {
            workoutsThisWeek: workoutsThisWeek,
            durationThisWeek: durationThisWeekMinutes, // Duration in minutes
            dominantTypeLastMonth: dominantType,
        };

        res.json(summary);

    } catch (err) {
        console.error("Error fetching statistics summary:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;