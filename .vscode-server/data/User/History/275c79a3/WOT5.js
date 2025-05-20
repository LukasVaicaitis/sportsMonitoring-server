const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Workout = require('../models/Workout');
const { query, validationResult } = require('express-validator');

const getMajorMuscleGroup = (muscle) => {
    if (!muscle) return 'Other';
    muscle = muscle.toLowerCase();
    if (['chest', 'pecs'].some(m => muscle.includes(m))) return 'Chest';
    if (['back', 'lats', 'traps', 'rhomboids'].some(m => muscle.includes(m))) return 'Back';
    if (['legs', 'quads', 'hamstrings', 'glutes', 'calves'].some(m => muscle.includes(m))) return 'Legs';
    if (['shoulders', 'deltoids'].some(m => muscle.includes(m))) return 'Shoulders';
    if (['biceps'].some(m => muscle.includes(m))) return 'Biceps';
    if (['triceps'].some(m => muscle.includes(m))) return 'Triceps';
    if (['abs', 'core', 'abdominals'].some(m => muscle.includes(m))) return 'Abs';
    if (['cardio', 'full body'].some(m => muscle.includes(m))) return 'Cardio';
    return 'Other';
};

const { startOfWeek, format, subDays } = require('date-fns');

// --- GET /api/statistics/summary ---
// @desc    Get summary statistics for the logged-in user
// @access  Private
router.get('/summary', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const userIdObject = new mongoose.Types.ObjectId(userId);

    try {
        // Calculate date ranges
        const now = new Date();

        const startOfWeekDate = startOfWeek(now, { weekStartsOn: 1 });
        const thirtyDaysAgoDate = subDays(now, 30); // Use subDays for accuracy

        const startOfWeekString = format(startOfWeekDate, 'yyyy-MM-dd');
        const thirtyDaysAgoString = format(thirtyDaysAgoDate, 'yyyy-MM-dd');
        const todayString = format(now, 'yyyy-MM-dd'); // End date for queries
        // -----

        const recentWorkouts = await Workout.find({
            userId: userIdObject,
            status: 'completed',
            // Fetch slightly more than 30 days back to ensure accurate filtering below
            date: { $gte: thirtyDaysAgoString, $lte: todayString }
        })
        .select('date startTime endTime workoutType exercises.trainedMuscle') // Ensure trainedMuscle is selected
        .lean();

        // --- Calculate Stats ---
        let workoutsThisWeek = 0;
        let durationThisWeekMinutes = 0;
        const typeCounts = {};

        recentWorkouts.forEach(workout => {
            // Weekly Stats Check using startOfWeekString
            if (workout.date >= startOfWeekString) {
                workoutsThisWeek++;
                if (workout.startTime && workout.endTime) {
                    const durationMillis = new Date(workout.endTime).getTime() - new Date(workout.startTime).getTime();
                    // Avoid negative duration just in case
                    if (durationMillis > 0) {
                       durationThisWeekMinutes += Math.round(durationMillis / (1000 * 60));
                    }
                }
            }

            // Monthly Type Count (already correct as it uses all recentWorkouts)
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
            // periodDays: // We can calculate this or pass back start/end dates
            startDate: thirtyDaysAgoString, // Or startOfWeekString for weekly focus?
            endDate: todayString,
            workoutsThisWeek: workoutsThisWeek,
            durationThisWeek: durationThisWeekMinutes,
            dominantTypeLastMonth: dominantType, // Based on last 30 days fetched
            // Add other calculated stats (PRs, muscle weight, avg rest) here if needed in summary
        };

        res.json(summary);

    } catch (err) {
        console.error("Error fetching statistics summary:", err.message);
        res.status(500).send('Server Error');
    }
});

router.get(
    '/detailed',
    [
        authMiddleware,
        // Optional: Add query param for period later ?period=7days etc.
        // query('period').optional().isIn(['7days', '20days', '30days', '90days'])
    ],
    async (req, res) => {
        // For now, hardcode 20 days, add query param handling later if needed
        const periodDays = 20;
        const userId = req.user.id;
        const userIdObject = new mongoose.Types.ObjectId(userId);

        try {
            // --- Calculate Date Range ---
            const endDate = new Date(); // Now
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - periodDays);
            // Convert to YYYY-MM-DD strings for querying the 'date' field
            const startDateString = startDate.toLocaleDateString('sv-SE');
            const endDateString = endDate.toLocaleDateString('sv-SE');

            // --- Fetch Completed Workouts in Range ---
            // Select fields needed for ALL calculations to minimize data transfer
            const workouts = await Workout.find({
                userId: userIdObject,
                status: 'completed',
                date: { $gte: startDateString, $lte: endDateString } // Query by date string range
            })
            .select('workoutType exercises date') // Select needed fields
            .sort({ date: 1, 'exercises.startTime': 1 }) // Sort oldest first for rest time calculation
            .lean(); // Use plain JS objects

            // --- Initialize Results ---
            const prs = {}; // { "Bench Press": { maxWeight: 100, unit: 'kg', date: '...' }, ... }
            const typeDistribution = {}; // { "Strength": 5, "Cardio": 2, ... }
            const weightByMuscle = {}; // { "Chest": 1500, "Back": 1200, ... }
            let totalRestSeconds = 0;
            let restIntervalCount = 0;

            // --- Process Workouts ---
            for (const workout of workouts) {
                // 1. Workout Type Distribution
                const type = workout.workoutType || 'Other';
                typeDistribution[type] = (typeDistribution[type] || 0) + 1;

                // Ensure exercises are sorted by startTime within the workout
                const sortedExercises = workout.exercises?.sort((a, b) =>
                     new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                     ) || [];

                // 2. PRs, Muscle Weight, Rest Times (Iterate Exercises)
                for (let i = 0; i < sortedExercises.length; i++) {
                    const ex = sortedExercises[i];

                    // Calculate PRs (Max Weight for Strength exercises)
                    if (ex.exerciseType === 'Strength' && typeof ex.weight === 'number') {
                        const currentPR = prs[ex.exerciseName]?.maxWeight || 0;
                        if (ex.weight > currentPR) {
                            prs[ex.exerciseName] = {
                                maxWeight: ex.weight,
                                unit: ex.weightUnit || 'kg',
                                date: workout.date // Date the PR was achieved
                            };
                        }
                    }

                    // Calculate Total Weight per Muscle Group
                    if (typeof ex.weight === 'number' && ex.weight > 0) {
                         const majorGroup = getMajorMuscleGroup(ex.trainedMuscle);
                         // Simple sum of weight lifted (NOTE: Not volume weight*reps)
                         weightByMuscle[majorGroup] = (weightByMuscle[majorGroup] || 0) + ex.weight;
                     }

                    // Calculate Rest Time (Time between this exercise END and NEXT exercise START)
                    if (i + 1 < sortedExercises.length) { // If there's a next exercise
                         const currentEndTime = ex.endTime ? new Date(ex.endTime).getTime() : null;
                         const nextStartTime = sortedExercises[i+1].startTime ? new Date(sortedExercises[i+1].startTime).getTime() : null;

                         if (currentEndTime && nextStartTime && nextStartTime > currentEndTime) {
                             const restMillis = nextStartTime - currentEndTime;
                             // Ignore very long rests (e.g., > 1 hour) as likely different sessions or error
                             if (restMillis < (60 * 60 * 1000)) {
                                 totalRestSeconds += (restMillis / 1000);
                                 restIntervalCount++;
                             }
                         }
                     }
                } // End exercise loop
            } // End workout loop

            // Final Calculations
            const avgRestSeconds = restIntervalCount > 0 ? Math.round(totalRestSeconds / restIntervalCount) : 0;
            // Convert PRs object to array for easier frontend mapping
            const prList = Object.entries(prs).map(([name, data]) => ({ name, ...data }));
            prList.sort((a, b) => a.name.localeCompare(b.name)); // Sort PRs alphabetically

            // --- Respond ---
            res.json({
                startDate: startDateString,
                endDate: endDateString,
                periodDays,
                prs: prList,
                typeDistribution,
                weightByMuscle,
                avgRestSeconds
            });

        } catch (err) {
            console.error("Error fetching detailed statistics:", err.message, err.stack);
            res.status(500).send('Server Error');
        }
    }
);

module.exports = router;