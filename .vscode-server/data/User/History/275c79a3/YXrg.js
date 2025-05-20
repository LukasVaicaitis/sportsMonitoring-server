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

router.get('/summary', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const userIdObject = new mongoose.Types.ObjectId(userId);

    try {
        const now = new Date();
        const startOfWeekDate = startOfWeek(now, { weekStartsOn: 1 });
        const thirtyDaysAgoDate = subDays(now, 30);

        const startOfWeekString = format(startOfWeekDate, 'yyyy-MM-dd');
        const thirtyDaysAgoString = format(thirtyDaysAgoDate, 'yyyy-MM-dd');
        const todayString = format(now, 'yyyy-MM-dd');

        const recentWorkouts = await Workout.find({
            userId: userIdObject,
            status: 'completed',
            date: { $gte: thirtyDaysAgoString, $lte: todayString }
        }).select('date startTime endTime workoutType exercises.trainedMuscle').lean();

        let workoutsThisWeek = 0;
        let durationThisWeekMinutes = 0;
        const typeCounts = {};

        recentWorkouts.forEach(workout => {
            if (workout.date >= startOfWeekString) {
                workoutsThisWeek++;
                if (workout.startTime && workout.endTime) {
                    const durationMillis = new Date(workout.endTime).getTime() - new Date(workout.startTime).getTime();
                    if (durationMillis > 0) {
                        durationThisWeekMinutes += Math.round(durationMillis / (1000 * 60));
                    }
                }
            }
            if (workout.workoutType) {
                typeCounts[workout.workoutType] = (typeCounts[workout.workoutType] || 0) + 1;
            }
        });

        let dominantType = 'N/A';
        let maxCount = 0;
        for (const type in typeCounts) {
            if (typeCounts[type] > maxCount) {
                maxCount = typeCounts[type];
                dominantType = type;
            }
        }
        const summary = {
            startDate: thirtyDaysAgoString,
            endDate: todayString,
            workoutsThisWeek: workoutsThisWeek,
            durationThisWeek: durationThisWeekMinutes,
            dominantTypeLastMonth: dominantType,
        };
        res.json(summary);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get(
    '/detailed',
    [
        authMiddleware,
    ],
    async (req, res) => {
        const periodDays = 20;
        const userId = req.user.id;
        const userIdObject = new mongoose.Types.ObjectId(userId);

        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - periodDays);
            const startDateString = startDate.toLocaleDateString('lt-LT');
            const endDateString = endDate.toLocaleDateString('lt-LT');

            const workouts = await Workout.find({
                userId: userIdObject,
                status: 'completed',
                date: { $gte: startDateString, $lte: endDateString }
            }).select('workoutType exercises date').sort({ date: 1, 'exercises.startTime': 1 }).lean();

            const prs = {};
            const typeDistribution = {};
            const weightByMuscle = {};
            let totalRestSeconds = 0;
            let restIntervalCount = 0;

            for (const workout of workouts) {
                const type = workout.workoutType || 'Other';
                typeDistribution[type] = (typeDistribution[type] || 0) + 1;

                const sortedExercises = workout.exercises?.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) || [];

                for (let i = 0; i < sortedExercises.length; i++) {
                    const ex = sortedExercises[i];

                    if (ex.exerciseType === 'Strength' && typeof ex.weight === 'number') {
                        const currentPR = prs[ex.exerciseName]?.maxWeight || 0;
                        if (ex.weight > currentPR) {
                            prs[ex.exerciseName] = {
                                maxWeight: ex.weight,
                                unit: ex.weightUnit || 'kg',
                                date: workout.date
                            };
                        }
                    }
                    if (typeof ex.weight === 'number' && ex.weight > 0) {
                        const majorGroup = getMajorMuscleGroup(ex.trainedMuscle);
                        weightByMuscle[majorGroup] = (weightByMuscle[majorGroup] || 0) + ex.weight;
                    }
                    if (i + 1 < sortedExercises.length) {
                        const currentEndTime = ex.endTime ? new Date(ex.endTime).getTime() : null;
                        const nextStartTime = sortedExercises[i + 1].startTime ? new Date(sortedExercises[i + 1].startTime).getTime() : null;

                        if (currentEndTime && nextStartTime && nextStartTime > currentEndTime) {
                            const restMillis = nextStartTime - currentEndTime;
                            if (restMillis < (60 * 60 * 1000)) {
                                totalRestSeconds += (restMillis / 1000);
                                restIntervalCount++;
                            }
                        }
                    }
                }
            }

            const avgRestSeconds = restIntervalCount > 0 ? Math.round(totalRestSeconds / restIntervalCount) : 0;
            const prList = Object.entries(prs).map(([name, data]) => ({ name, ...data }));
            prList.sort((a, b) => a.name.localeCompare(b.name));

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
            res.status(500).send('Server Error');
        }
    }
);

module.exports = router;