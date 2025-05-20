const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Workout = require('../models/Workout');
const Machine = require('../models/Machine');
const User = require('../models/User');
const axios = require('axios');

const { format, subDays } = require('date-fns');

router.get(
    '/',
    [authMiddleware,
        query('year', 'Year must be a valid number').optional({ checkFalsy: true }).isInt(),
        query('month', 'Month must be valid number 1-12').optional({ checkFalsy: true }).isInt({ min: 1, max: 12 }),
        query('status', 'Invalid status').optional().isIn(['planned', 'completed']),
        query('isCoachAssigned', 'Invalid boolean value for isCoachAssigned').optional().isBoolean(),
    ],

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userIdString = req.user.id;
        const { year, month, status, isCoachAssigned } = req.query;

        try {
            const datePrefix = `${year}-${String(month).padStart(2, '0')}-`;
            let userIdObject;
            try {
                userIdObject = new mongoose.Types.ObjectId(userIdString);
            } catch (idError) {
                return res.status(400).json({ msg: 'Invalid user ID format' });
            }

            const mongoQuery = { userId: userIdObject };

            if (year && month) {
                const datePrefix = `${year}-${String(month).padStart(2, '0')}-`;
                mongoQuery.date = { $regex: `^${datePrefix}` };
            }

            if (status) {
                mongoQuery.status = status;
            } else {
                if (isCoachAssigned === undefined) {
                    mongoQuery.status = 'completed';
                }
            }

            if (isCoachAssigned !== undefined) {
                mongoQuery.isCoachAssigned = (String(isCoachAssigned).toLowerCase() === 'true');
            }

            const workouts = await Workout.find(mongoQuery)
                .sort({ date: -1, startTime: -1 })
                .lean();

            res.json(workouts);

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.put(
    '/:workoutId/exercises/:exerciseId',
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        param('exerciseId', 'Invalid Exercise ID').isMongoId(),
        body('exerciseName', 'Exercise Name cannot be empty').optional().notEmpty().trim(),
        body('exerciseType', 'Invalid Exercise Type').optional().notEmpty().trim(),
        body('trainedMuscle', 'Invalid Trained Muscle').optional().notEmpty().trim(),
        body('startTime', 'Invalid Start Time').optional().isISO8601().toDate(),
        body('endTime', 'Invalid End Time').optional().isISO8601().toDate(),
        body('durationSeconds', 'Duration must be a non-negative integer').optional({ nullable: true }).isInt({ min: 0 }),
        body('repetitions', 'Repetitions must be a non-negative integer').optional({ nullable: true }).isInt({ min: 0 }),
        body('weight', 'Weight must be a non-negative number').optional({ nullable: true }).isFloat({ min: 0 }),
        body('weightUnit', 'Invalid weight unit').optional({ nullable: true }).isIn(['kg', 'lbs'])
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workoutId, exerciseId } = req.params;
        const userId = req.user.id;
        const updatesFromBody = req.body;

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            const exerciseIdObject = new mongoose.Types.ObjectId(exerciseId);
            const updateFields = {};
            let latestEndTime = null;

            for (const key in updatesFromBody) {
                if (Object.hasOwnProperty.call(updatesFromBody, key)) {
                    if ((key === 'startTime' || key === 'endTime') && updatesFromBody[key]) {
                        const dateValue = new Date(updatesFromBody[key]);
                        updateFields[`exercises.$[elem].${key}`] = dateValue;
                        if (key === 'endTime') {
                            latestEndTime = dateValue;
                        }
                    } else if (updatesFromBody[key] !== undefined) {
                        updateFields[`exercises.$[elem].${key}`] = updatesFromBody[key];
                    }
                }
            }
            if (latestEndTime) {
                updateFields['endTime'] = latestEndTime;
            }
            updateFields['status'] = 'completed';

            const updatedWorkout = await Workout.findOneAndUpdate(
                { _id: workoutId, userId: userIdObject, "exercises._id": exerciseIdObject },
                { $set: updateFields },
                { arrayFilters: [{ "elem._id": exerciseIdObject }], new: true });

            if (!updatedWorkout) {
                return res.status(404).json({ msg: 'Workout or Exercise not found, or user unauthorized' });
            }

            if (updatedWorkout.exercises && updatedWorkout.exercises.length > 0) {
                const types = [...new Set(updatedWorkout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                let derivedType = 'Other';
                if (types.length === 1) { derivedType = types[0]; }
                else if (types.length > 1) { derivedType = 'Mixed'; }
                if (updatedWorkout.workoutType !== derivedType) {
                    updatedWorkout.workoutType = derivedType;
                    await updatedWorkout.save();
                }
            }
            res.json({ msg: 'Exercise updated successfully', workout: updatedWorkout });

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.post(
    '/startExercise',
    [
        authMiddleware,
        body('machineId', 'Valid Machine ID is required').isMongoId(),
        body('startTime', 'Valid Start Time is required').isISO8601().toDate(),
        body('localDateString', 'Local date string (YYYY-MM-DD) is required').matches(/^\d{4}-\d{2}-\d{2}$/),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { machineId, startTime, localDateString } = req.body;
        const userIdString = req.user.id;

        try {
            let userIdObject;
            try {
                userIdObject = new mongoose.Types.ObjectId(userIdString);
            } catch (idError) {
                return res.status(400).json({ msg: 'Invalid user ID format' });
            }

            const startTimeDate = new Date(startTime);
            let workout = await Workout.findOneAndUpdate(
                { userId: userIdObject, date: localDateString, status: { $in: ['planned', 'in-progress'] } },
                { $set: { status: 'completed', startTime: startTimeDate },
                    $setOnInsert: { userId: userIdObject, date: localDateString, createdByUserId: userIdObject, isCoachAssigned: false, exercises: [], workoutType: 'Mixed' }
                },
                { new: true, upsert: true, sort: { date: 1 } } 
            );
            workout.endTime = undefined;
            workout.status = 'completed';

            const machine = await Machine.findById(machineId);
            if (!machine) {
                return res.status(404).json({ msg: 'Machine details not found' });
            }
            await Machine.updateOne( { _id: machineId }, { $inc: { scanCount: 1 } } );

            const newExercise = {
                machineId: machineId,
                exerciseName: machine.exerciseName,
                exerciseType: machine.exerciseType,
                trainedMuscle: machine.trainedMuscle,
                startTime: startTimeDate 
            };
            workout.exercises.push(newExercise);

            if (workout.exercises && workout.exercises.length > 0) {
                const types = [...new Set(workout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                if (types.length === 1) { workout.workoutType = types[0]; }
                else if (types.length > 1) { workout.workoutType = 'Mixed'; }
                else { workout.workoutType = 'Other'; }
            } else { workout.workoutType = 'Other'; }

            await workout.save();
            const addedExerciseIndex = workout.exercises.length - 1;
            res.status(200).json({
                msg: 'Exercise started successfully',
                workoutId: workout._id,
                exerciseIndex: addedExerciseIndex
            });

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.delete(
    '/:workoutId',
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { workoutId } = req.params;
        const userId = req.user.id;

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            const result = await Workout.findOneAndDelete({
                _id: workoutId,
                userId: userIdObject
            });

            if (!result) {
                return res.status(404).json({ msg: 'Workout not found or unauthorized to delete.' });
            }

            res.json({ msg: 'Workout plan deleted successfully.' });

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.delete(
    '/:workoutId/exercises/:exerciseId',
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        param('exerciseId', 'Invalid Exercise ID').isMongoId(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workoutId, exerciseId } = req.params;
        const userId = req.user.id;

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            const workout = await Workout.findOneAndUpdate(
                { _id: workoutId, userId: userIdObject },
                { $pull: { exercises: { _id: exerciseId }}},
                { new: true }
            );
            if (!workout) {
                return res.status(404).json({ msg: 'Workout not found or user unauthorized' });
            }
            res.json({ msg: 'Exercise removed successfully', workout });

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.post(
    '/:workoutId/exercises',
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        body().custom((value, { req }) => {
            if (!req.body.machineId && !req.body.exerciseName) {
                throw new Error('Either machineId or exerciseName is required');
            }
            return true;
        }),
        body('machineId', 'Invalid Machine ID').optional().isMongoId(),
        body('exerciseName', 'Exercise Name is required if machineId not provided').if(body('machineId').not().exists()).notEmpty().trim(),
        body('exerciseType', 'Exercise Type is required if machineId not provided').if(body('machineId').not().exists()).notEmpty().trim(),
        body('trainedMuscle', 'Trained Muscle is required if machineId not provided').if(body('machineId').not().exists()).notEmpty().trim(),
        body('startTime', 'Start Time is required').isISO8601().toDate(),
        body('endTime', 'End Time is required').isISO8601().toDate(),
        body('durationSeconds', 'Duration must be a non-negative integer').optional({ nullable: true }).isInt({ min: 0 }),
        body('repetitions', 'Repetitions must be a non-negative integer').optional({ nullable: true }).isInt({ min: 0 }),
        body('weight', 'Weight must be a non-negative number').optional({ nullable: true }).isFloat({ min: 0 }),
        body('weightUnit', 'Invalid weight unit').optional({ nullable: true }).isIn(['kg', 'lbs']),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workoutId } = req.params;
        const userId = req.user.id;
        const exerciseData = req.body;

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            const workout = await Workout.findOne({ _id: workoutId, userId: userIdObject });

            if (!workout) {
                return res.status(404).json({ msg: 'Workout not found or user unauthorized' });
            }

            let machineDetails = {};
            if (exerciseData.machineId) {
                const machine = await Machine.findById(exerciseData.machineId);
                if (!machine) return res.status(404).json({ msg: 'Machine details not found for provided machineId' });
                machineDetails = {
                    exerciseName: machine.exerciseName,
                    exerciseType: machine.exerciseType,
                    trainedMuscle: machine.trainedMuscle,
                };
            }

            const newExercise = {
                machineId: exerciseData.machineId || null,
                exerciseName: exerciseData.exerciseName || machineDetails.exerciseName,
                exerciseType: exerciseData.exerciseType || machineDetails.exerciseType,
                trainedMuscle: exerciseData.trainedMuscle || machineDetails.trainedMuscle,
                startTime: exerciseData.startTime,
                endTime: exerciseData.endTime,
                durationSeconds: exerciseData.durationSeconds,
                repetitions: exerciseData.repetitions,
                weight: exerciseData.weight,
                weightUnit: exerciseData.weightUnit || 'kg',
            };

            workout.exercises.push(newExercise);
            workout.exercises.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

            if (newExercise.startTime < workout.startTime) {
                workout.startTime = newExercise.startTime;
            }
            if (!workout.endTime || newExercise.endTime > workout.endTime) {
                workout.endTime = newExercise.endTime;
            }
            await workout.save();
            res.status(201).json(workout);

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.post('/generateAI', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const userIdObject = new mongoose.Types.ObjectId(userId);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("Gemini API Key missing in environment variables.");
        return res.status(500).json({ msg: "AI configuration error." });
    }

    try {
        const user = await User.findById(userIdObject).select('activeGymId preferences').populate('activeGymId');
        if (!user?.activeGymId) {
            return res.status(400).json({ msg: "Please select an active gym first." });
        }
        const userGymId = user.activeGymId._id;
        const gymName = user.activeGymId.name || 'your selected gym';
        const prefs = user.preferences || {};
        const exp = user.experienceLevel || 'Beginner';
        const prefWorkoutType = prefs.workoutType || 'Any';
        const prefMuscleFocus = prefs.muscleFocus || 'Auto';
        const prefNumExercises = prefs.numExercises || 5;
        const prefRepRange = prefs.repRange || '8-12';

        const availableMachines = await Machine.find({ gymId: userGymId }).lean();
        if (!availableMachines || availableMachines.length === 0) {
            return res.status(404).json({ msg: `No machines registered for ${gymName}. Cannot generate AI plan.` });
        }
        const machineListString = availableMachines.map(m => `${m.exerciseName} (Type: ${m.exerciseType}, Muscle: ${m.trainedMuscle})`).join(', ');

        const historyLimit = 10;
        const thirtyDaysAgoDate = subDays(new Date(), 30);
        const thirtyDaysAgoString = format(thirtyDaysAgoDate, 'yyyy-MM-dd');

        const recentWorkouts = await Workout.find({
            userId: userIdObject,
            status: 'completed',
            date: { $gte: thirtyDaysAgoString }
        }).sort({ date: -1 }).limit(historyLimit).select('date exercises.exerciseName exercises.trainedMuscle exercises.repetitions exercises.weight exercises.weightUnit').lean();

        const majorGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Abs'];
        const lastTrained = {};
        const lastPerformance = {};
        majorGroups.forEach(g => lastTrained[g] = 'Never');

        for (const workout of recentWorkouts) {
            for (const exercise of workout.exercises) {
                const majorGroup = getMajorMuscleGroup(exercise.trainedMuscle);
                if (majorGroups.includes(majorGroup) && lastTrained[majorGroup] === 'Never') {
                    lastTrained[majorGroup] = workout.date;
                }
                if (majorGroups.includes(majorGroup) && !lastPerformance[majorGroup] && exercise.weight && exercise.repetitions) {
                    lastPerformance[majorGroup] = `${exercise.exerciseName}: ${exercise.weight}${exercise.weightUnit || 'kg'} x ${exercise.repetitions} reps on ${workout.date}`;
                }
            }
        }
        const historySummary = majorGroups.map(g => `${g}: ${lastTrained[g]}`).join(', ');
        const performanceSummary = Object.entries(lastPerformance).map(([group, perf]) => perf).join('; ');

        const prompt = `
            You are a helpful fitness assistant creating a workout plan.
            User's preferences:
            - Target workout type: ${prefWorkoutType}
            - Muscle focus: ${prefMuscleFocus} (If 'Auto', prioritize least recently trained based on provided history)
            - Target Number of Exercises: ${prefNumExercises}
            - Preferred Rep Range (for Strength): ${prefRepRange}
            - Users' erxperience level: ${exp}

            User's Recent Training History (Approx. last trained date for major groups): ${historySummary}.
            If Muscle Focus is 'Auto', please prioritize muscle groups trained least recently based on the history. If a specific Muscle Focus is selected, prioritize that group but still consider the history for secondary/complementary exercises if appropriate (e.g., pair Chest focus with Triceps if Triceps weren't trained very recently).

            Available Equipment/Exercises at their gym (${gymName}): ${machineListString}.
            **Strictly use ONLY exercises derivable from this available equipment list.** Do not invent exercises.

            Generate a suitable workout plan for today.

            Respond ONLY with a valid JSON array where each object represents one exercise for the plan.
            Each exercise object MUST have these exact keys:
            - "exerciseName": string (Must exactly match one from the available equipment list)
            - "exerciseType": string (Should match the type from the available equipment list, e.g., "Strength", "Cardio")
            - "trainedMuscle": string (Should match the muscle from the available equipment list)
            - "repetitions": number (Set based on preference '${prefRepRange}' if type is 'Strength' or 'Mixed', otherwise null)
            - "weight": number | null (Suggest a starting weight in kg appropriate for the exercise/reps, or null if not applicable e.g., Cardio)
            - "weightUnit": string (use "kg")

            Generate exactly ${prefNumExercises} exercises if possible using the available equipment. Ensure variety if appropriate for the focus. Do not include any other text, just the JSON array.
            JSON array:
        `;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const geminiRequestBody = {
            contents: [{ parts: [{ text: prompt }] }],
        };

        const geminiResponse = await axios.post(geminiUrl, geminiRequestBody, {
            headers: { 'Content-Type': 'application/json' }
        });

        const aiResponseText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!aiResponseText) {
            throw new Error('AI response format was invalid.');
        }

        let cleanedJsonString = null;
        const jsonMatch = aiResponseText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);

        if (jsonMatch && jsonMatch[0]) {
            cleanedJsonString = jsonMatch[0];
        } 
        else {
            throw new Error('Failed to extract valid JSON block from AI response.');
        }
        let plannedExercisesRaw = [];

        try {
            plannedExercisesRaw = JSON.parse(cleanedJsonString);

            if (!Array.isArray(plannedExercisesRaw)) {
                throw new Error("AI response was not a JSON array.");
            }
        } catch (parseError) {
            throw new Error('Failed to parse workout plan from AI response.');
        }

        const plannedExercises = [];
        const machineMap = new Map(availableMachines.map(m => [m.exerciseName.toLowerCase(), m]));

        for (const aiEx of plannedExercisesRaw) {
            if (!aiEx.exerciseName) continue;

            const foundMachine = machineMap.get(aiEx.exerciseName.toLowerCase());

            plannedExercises.push({
                machineId: foundMachine._id,
                exerciseName: foundMachine.exerciseName,
                exerciseType: foundMachine.exerciseType,
                trainedMuscle: foundMachine.trainedMuscle,
                repetitions: aiEx.repetitions !== null && !isNaN(parseInt(aiEx.repetitions)) ? parseInt(aiEx.repetitions) : undefined,
                weight: aiEx.weight !== null && !isNaN(parseFloat(aiEx.weight)) ? parseFloat(aiEx.weight) : undefined,
                weightUnit: 'kg'
            });
            if (plannedExercises.length >= prefNumExercises) break;
        }

        if (plannedExercises.length === 0) {
            return res.status(404).json({ msg: "AI could not generate a valid plan with available machines." });
        }

        const planDate = new Date(); planDate.setHours(12, 0, 0, 0);
        const planDateString = planDate.toLocaleDateString('sv-SE');
        let finalWorkoutType = 'Mixed'; 
        const typesInPlan = [...new Set(plannedExercises.map(e => e.exerciseType))];
        if (typesInPlan.length === 1) finalWorkoutType = typesInPlan[0];
        if (prefWorkoutType !== 'Any' && prefWorkoutType !== 'Mixed') finalWorkoutType = prefWorkoutType;

        const newWorkout = new Workout({
            userId: userIdObject, createdByUserId: userIdObject, date: planDateString,
            status: 'planned', exercises: plannedExercises, workoutType: finalWorkoutType,
            isCoachAssigned: false
        });

        await newWorkout.save();
        res.status(201).json(newWorkout);

    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data?.error) {
            return res.status(500).json({ msg: `AI Generation Error: ${err.response.data.error.message}` });
        }
        res.status(500).send('Server Error');
    }
});

router.get('/latestPlanned', authMiddleware, async (req, res) => {
    try {
        const userIdObject = new mongoose.Types.ObjectId(req.user.id);
        const latestPlan = await Workout.findOne({ userId: userIdObject, status: 'planned', isCoachAssigned: false }).sort({ createdAt: -1 });

        if (!latestPlan) {
            return res.json(null);
        }
        res.json(latestPlan);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

router.post('/generate', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const userIdObject = new mongoose.Types.ObjectId(userId);

    try {
        const user = await User.findById(userIdObject).select('activeGymId preferences');
        if (!user) {
             return res.status(404).json({ msg: "User not found." });
        }
        if (!user.activeGymId) {
            return res.status(400).json({ msg: "Please select an active gym in your profile first." });
        }

        const userGymId = user.activeGymId;
        const prefs = user.preferences || {};
        const prefWorkoutType = prefs.workoutType && prefs.workoutType !== 'Any' ? prefs.workoutType : 'Any';
        const prefMuscleFocus = prefs.muscleFocus || 'Auto';
        const prefNumExercises = prefs.numExercises || 5;
        const prefRepRange = prefs.repRange || '8-12';

        let plannedExercises = [];
        let finalWorkoutType = prefWorkoutType;

        if (prefWorkoutType === 'Cardio') {
            const cardioMachinesAvailable = await Machine.find({
                gymId: userGymId,
                exerciseType: 'Cardio'
            }).lean();

            if (cardioMachinesAvailable.length === 0) {
                return res.status(404).json({ msg: "No cardio machines found in the selected gym." });
            }

            let shuffledCardio = shuffleArray(cardioMachinesAvailable);
            let countToTake = Math.min(prefNumExercises, shuffledCardio.length);

            for (let i = 0; i < countToTake; i++) {
                plannedExercises.push({
                    machineId: shuffledCardio[i]._id,
                    exerciseName: shuffledCardio[i].exerciseName,
                    exerciseType: shuffledCardio[i].exerciseType,
                    trainedMuscle: shuffledCardio[i].trainedMuscle,
                    weightUnit: 'kg'
                });
            }
            finalWorkoutType = 'Cardio';

        } else {
            const historyLimit = 10;
            const recentWorkouts = await Workout.find({ userId: userIdObject, status: 'completed' })
                .sort({ date: -1 }).limit(historyLimit).select('date exercises.trainedMuscle').lean();

            const majorGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Abs'];
            const lastTrained = {};
            majorGroups.forEach(g => lastTrained[g] = new Date('1970-01-01'));
            for (const workout of recentWorkouts) {
                 const workoutDate = new Date(workout.date);
                for (const exercise of workout.exercises) {
                    const majorGroup = getMajorMuscleGroup(exercise.trainedMuscle);
                    if (majorGroups.includes(majorGroup) && workoutDate > lastTrained[majorGroup]) {
                        lastTrained[majorGroup] = workoutDate;
                    }
                }
            }

            let primaryTargetGroup = majorGroups[0];
            if (prefMuscleFocus !== 'Auto' && prefMuscleFocus !== 'Full Body' && majorGroups.includes(prefMuscleFocus)) {
                primaryTargetGroup = prefMuscleFocus;
            }
            else if (prefMuscleFocus === 'Auto' || prefMuscleFocus === 'Full Body') {
                let oldestDate = new Date('3000-01-01');
                majorGroups.forEach(group => {
                    if (lastTrained[group] < oldestDate) {
                         oldestDate = lastTrained[group];
                         primaryTargetGroup = group;
                    }
                });
            }

            let secondaryTargetGroups = [];
            const totalExerciseTarget = prefNumExercises;
            let primaryExerciseCount = Math.max(1, Math.round(totalExerciseTarget * 0.6));
            let secondaryExerciseCount = totalExerciseTarget - primaryExerciseCount;
            const pairings = { 'Chest': ['Triceps'], 'Back': ['Biceps'], 'Legs': ['Abs'], 'Shoulders': ['Triceps'], 'Biceps': ['Back'], 'Triceps': ['Chest'], 'Abs': ['Legs'] };

            if (prefMuscleFocus === 'Full Body') {
                secondaryTargetGroups = [];
                primaryExerciseCount = Math.max(1, Math.round(totalExerciseTarget * 0.4));
                secondaryExerciseCount = totalExerciseTarget - primaryExerciseCount;
            } else if (pairings[primaryTargetGroup]) {
                secondaryTargetGroups = pairings[primaryTargetGroup];
                if (secondaryTargetGroups.length === 0) {
                    secondaryExerciseCount = 0; primaryExerciseCount = totalExerciseTarget;
                } else {
                    secondaryExerciseCount = Math.max(0, totalExerciseTarget - primaryExerciseCount);
                    if (secondaryExerciseCount > 0) {
                        const countPerSecondaryGroup = Math.max(1, Math.floor(secondaryExerciseCount / secondaryTargetGroups.length));
                        secondaryExerciseCount = countPerSecondaryGroup * secondaryTargetGroups.length;
                        primaryExerciseCount = totalExerciseTarget - secondaryExerciseCount;
                    } else {
                        primaryExerciseCount = totalExerciseTarget;
                    }
                }
            } else {
                primaryExerciseCount = totalExerciseTarget;
                secondaryExerciseCount = 0;
            }

            const queryMachineFilter = { gymId: userGymId };
            if (prefWorkoutType === 'Strength') {
                queryMachineFilter.exerciseType = 'Strength';
                finalWorkoutType = 'Strength';
            }
            const primaryMachinesAvailable = await Machine.find({ ...queryMachineFilter, trainedMuscle: primaryTargetGroup }).lean();
            const secondaryMachinesAvailable = secondaryTargetGroups.length > 0 ? await Machine.find({
                ...queryMachineFilter, trainedMuscle: { $in: secondaryTargetGroups }}).lean() : [];

             const fillerMachinesAvailable = (prefMuscleFocus === 'Full Body' || primaryMachinesAvailable.length < primaryExerciseCount || secondaryMachinesAvailable.length < secondaryExerciseCount)
                ? await Machine.find({
                    ...queryMachineFilter,
                    trainedMuscle: { $nin: [primaryTargetGroup, ...secondaryTargetGroups] }
                  }).lean()
                : [];

            const selectedMachineIds = new Set();

            if (primaryMachinesAvailable.length > 0) {
                let shuffledPrimary = shuffleArray(primaryMachinesAvailable);
                let countToTake = Math.min(primaryExerciseCount, shuffledPrimary.length);
                for (let i = 0; i < countToTake; i++) {
                    plannedExercises.push({
                        machineId: shuffledPrimary[i]._id, exerciseName: shuffledPrimary[i].exerciseName,
                        exerciseType: shuffledPrimary[i].exerciseType, trainedMuscle: shuffledPrimary[i].trainedMuscle, weightUnit: 'kg'
                    });
                    selectedMachineIds.add(shuffledPrimary[i]._id.toString());
                }
            }

            let remainingSlots = totalExerciseTarget - plannedExercises.length;
            if (remainingSlots > 0 && secondaryTargetGroups.length > 0 && secondaryMachinesAvailable.length > 0) {
                 let shuffledSecondary = shuffleArray(secondaryMachinesAvailable);
                 let secondaryToTake = Math.min(remainingSlots, secondaryExerciseCount);
                 for (let i = 0; plannedExercises.length < totalExerciseTarget && i < shuffledSecondary.length && secondaryToTake > 0; i++) {
                    if (!selectedMachineIds.has(shuffledSecondary[i]._id.toString())) {
                        plannedExercises.push({
                            machineId: shuffledSecondary[i]._id, exerciseName: shuffledSecondary[i].exerciseName,
                            exerciseType: shuffledSecondary[i].exerciseType, trainedMuscle: shuffledSecondary[i].trainedMuscle, weightUnit: 'kg'
                        });
                        selectedMachineIds.add(shuffledSecondary[i]._id.toString());
                        secondaryToTake--;
                    }
                 }
            }

             remainingSlots = totalExerciseTarget - plannedExercises.length;
             if (remainingSlots > 0 && fillerMachinesAvailable.length > 0) {
                 let shuffledFillers = shuffleArray(fillerMachinesAvailable);
                 for (let i = 0; plannedExercises.length < totalExerciseTarget && i < shuffledFillers.length; i++) {
                    if (!selectedMachineIds.has(shuffledFillers[i]._id.toString())) {
                        plannedExercises.push({
                            machineId: shuffledFillers[i]._id, exerciseName: shuffledFillers[i].exerciseName,
                            exerciseType: shuffledFillers[i].exerciseType, trainedMuscle: shuffledFillers[i].trainedMuscle, weightUnit: 'kg'
                        });
                        selectedMachineIds.add(shuffledFillers[i]._id.toString());
                    }
                 }
             }

            if (plannedExercises.length === 0) {
                return res.status(404).json({ msg: "Could not find any suitable machines matching your preferences in the selected gym." });
            }

             if (finalWorkoutType === 'Any' || finalWorkoutType === 'Mixed') {
                 const typesInPlan = [...new Set(plannedExercises.map(e => e.exerciseType))];
                 if (typesInPlan.length === 1) finalWorkoutType = typesInPlan[0];
                 else if (typesInPlan.length > 1) finalWorkoutType = 'Mixed';
                 else finalWorkoutType = 'Unknown';
             }
        }

        if (finalWorkoutType === 'Strength' || finalWorkoutType === 'Mixed') {
            plannedExercises = plannedExercises.map(ex => {
                const defaultReps = ex.exerciseType === 'Strength'
                    ? (prefRepRange === '5-8' ? 6 : prefRepRange === '12-15' ? 12 : 10)
                    : undefined;
                return { ...ex, repetitions: ex.repetitions ?? defaultReps };
            });
        }

        const planDate = new Date();
        planDate.setHours(12, 0, 0, 0);
        const planDateString = planDate.toLocaleDateString('sv-SE');

        const newWorkout = new Workout({
            userId: userIdObject,
            createdByUserId: userIdObject,
            date: planDateString,
            status: 'planned',
            exercises: plannedExercises,
            workoutType: finalWorkoutType,
            isCoachAssigned: false
        });

        await newWorkout.save();
        res.status(201).json(newWorkout);

    } catch (err) {
        console.error("Workout Generation Error:", err.message);
        res.status(500).send('Server Error');
    }
});

router.put(
    '/:workoutId',
    [
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        body('exercises', 'Exercises array is required').isArray()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { workoutId } = req.params;
        const userId = req.user.id;
        const { exercises } = req.body;

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            const workout = await Workout.findOne({ _id: workoutId, userId: userIdObject, status: 'planned' });

            if (!workout) {
                return res.status(404).json({ msg: 'Planned workout not found or user unauthorized' });
            }

            workout.exercises = exercises;
            workout.markModified('exercises'); 

            if (workout.exercises && workout.exercises.length > 0) {
                const types = [...new Set(workout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                if (types.length === 1) { workout.workoutType = types[0]; }
                else if (types.length > 1) { workout.workoutType = 'Mixed'; }
                else { workout.workoutType = 'Other'; }
            } else {
                workout.workoutType = 'Other';
            }

            await workout.save();
            res.json(workout); 

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.put(
    '/:workoutId/endExercise/:exerciseIndex',
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        param('exerciseIndex', 'Invalid Exercise Index').isInt({ min: 0 }),
        body('endTime', 'End time is required').isISO8601().toDate(),
        body('durationSeconds', 'Duration is required').isInt({ min: 0 }),
        body('repetitions', 'Repetitions must be a non-negative integer').optional({ nullable: true }).isInt({ min: 0 }),
        body('weight', 'Weight must be a non-negative number').optional({ nullable: true }).isFloat({ min: 0 }),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workoutId, exerciseIndex } = req.params;
        const userIdString = req.user.id;
        const { endTime, durationSeconds, repetitions, weight } = req.body;

        try {
            let userIdObject;
            try {
                userIdObject = new mongoose.Types.ObjectId(userIdString);
            } catch (idError) {
                return res.status(400).json({ msg: 'Invalid user ID' });
            }
            const workout = await Workout.findOne({ _id: workoutId, userId: userIdObject });

            if (!workout) {
                return res.status(404).json({ msg: 'Workout session not found' });
            }

            const index = parseInt(exerciseIndex, 10);
            if (isNaN(index) || index < 0 || index >= workout.exercises.length) {
                return res.status(400).json({ msg: 'Invalid exercise index' });
            }

            const exercise = workout.exercises[index];

            if (exercise.endTime) {
                return res.status(400).json({ msg: 'This exercise has already been ended' });
            }

            const exerciseUpdates = { endTime: endTime, durationSeconds, ...(repetitions !== undefined && { repetitions: repetitions }), ...(weight !== undefined && { weight: weight }) };
            exercise.set(exerciseUpdates);

            workout.endTime = exercise.endTime;
            workout.status = 'completed'; 

            if (workout.exercises && workout.exercises.length > 0) {
                const types = [...new Set(workout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                if (types.length === 1) { workout.workoutType = types[0]; }
                else if (types.length > 1) { workout.workoutType = 'Mixed'; }
                else { workout.workoutType = 'Other'; }
            } else { workout.workoutType = 'Other'; }

            await workout.save();

            res.json({ msg: 'Exercise ended successfully', updatedExercise: workout.exercises[index] });

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.post(
    '/assignPlan',
    [
        authMiddleware,
        body('clientEmail', 'Client email is required').isEmail().normalizeEmail(),
        body('planDate', 'Plan date (YYYY-MM-DD) is required').matches(/^\d{4}-\d{2}-\d{2}$/),
        body('exercises', 'Exercises array is required and must not be empty').isArray({ min: 1 }),
        body('exercises.*.exerciseName', 'Exercise name is required').notEmpty().trim(),
        body('exercises.*.exerciseType', 'Exercise type is required').notEmpty().trim(),
        body('exercises.*.trainedMuscle', 'Trained muscle is required').notEmpty().trim(),
        body('exercises.*.machineId', 'Machine ID must be valid').optional().isMongoId(),
        body('exercises.*.repetitions', 'Reps must be number').optional({nullable: true}).isInt({ min: 0 }),
        body('exercises.*.weight', 'Weight must be number').optional({nullable: true}).isFloat({ min: 0 }),
        body('exercises.*.weightUnit', 'Invalid unit').optional({nullable: true}).isIn(['kg', 'lbs']),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const trainerUserId = req.user.id;
        const { clientEmail, planDate, exercises } = req.body;

        try {
            const clientUser = await User.findOne({ email: clientEmail }).select('_id');
            if (!clientUser) {
                return res.status(404).json({ errors: [{ msg: `User not found with email: ${clientEmail}` }] });
            }
            const clientUserIdObject = clientUser._id;

            if (clientUserIdObject.equals(trainerUserId)) {
                return res.status(400).json({ errors: [{ msg: 'Cannot assign workout plan to yourself.' }] });
            }

            let finalWorkoutType = 'Mixed';
            const typesInPlan = [...new Set(exercises.map(e => e.exerciseType).filter(Boolean))];
            if (typesInPlan.length === 1) finalWorkoutType = typesInPlan[0];

            const newWorkout = new Workout({
                userId: clientUserIdObject,
                createdByUserId: trainerUserId,
                date: planDate,
                status: 'planned',
                exercises: exercises,
                workoutType: finalWorkoutType,
                isCoachAssigned: true,
            });

            await newWorkout.save();
            res.status(201).json(newWorkout);

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

router.put(
    '/:workoutId/complete',
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workoutId } = req.params;
        const userId = req.user.id;

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            const workout = await Workout.findOne({ _id: workoutId, userId: userIdObject });

            if (!workout) {
                return res.status(404).json({ msg: 'Workout session not found or user unauthorized.' });
            }

            if (workout.status === 'completed') {
                return res.status(400).json({ msg: 'Workout already marked as completed.'});
            }

            if (workout.exercises && workout.exercises.length > 0) {
                const types = [...new Set(workout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                if (types.length === 1) { workout.workoutType = types[0]; }
                else if (types.length > 1) { workout.workoutType = 'Mixed'; }
                else { workout.workoutType = workout.workoutType || 'Other'; }
            }
            workout.status = 'completed';
            workout.endTime = new Date();
            await workout.save();

            res.json({ msg: 'Workout completed successfully', workout });

        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
);

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
    if (['cardio', 'full body', 'running', 'elliptical'].some(m => muscle.includes(m))) return 'Cardio';
    return 'Other';
};

module.exports = router;