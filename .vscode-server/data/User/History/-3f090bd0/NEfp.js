const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Workout = require('../models/Workout');
const Machine = require('../models/Machine');
const User = require('../models/User');


// --- GET /api/workouts?year=YYYY&month=MM ---
// @desc    Get logged-in user's workouts for a specific month
// @access  Private
router.get(
    '/',
    [authMiddleware,
        query('year', 'Year is required and must be a number').notEmpty().isInt(),
        query('month', 'Month is required and must be a number between 1-12').notEmpty().isInt({ min: 1, max: 12 })
    ],

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // 4. Proceed only if middleware and validation passed
        const userIdString = req.user.id; // req.user should now be defined
        const { year, month } = req.query;

        try {
            const datePrefix = `${year}-${String(month).padStart(2, '0')}-`;
            let userIdObject;
            try {
                userIdObject = new mongoose.Types.ObjectId(userIdString);
            } catch (idError) {
                console.error("Invalid userId format from token:", userIdString);
                return res.status(400).json({ msg: 'Invalid user ID format' });
            }

            // console.log(`[GET /workouts] Querying for userId (ObjectId): ${userIdObject}, datePrefix: ^${datePrefix}`); // Keep logs if needed

            const mongoQuery = {
                userId: userIdObject,
                date: { $regex: `^${datePrefix}` },
                status: 'completed'
            };
            // console.log('[GET /workouts] Final MongoDB Query Object:', JSON.stringify(mongoQuery)); // Keep logs if needed

            // console.log('[GET /workouts] >>> EXECUTING Workout.find()...'); // Keep logs if needed
            const workouts = await Workout.find(mongoQuery)
                .sort({ date: -1, startTime: -1 })
                .lean();
            // console.log('[GET /workouts] <<< Workout.find() FINISHED.'); // Keep logs if needed

            // console.log(`[GET /workouts] Found ${workouts.length} workouts in DB.`); // Keep logs if needed

            res.json(workouts);

        } catch (err) {
            console.error("Error fetching workouts:", err.message);
            console.error("Full error object:", err);
            res.status(500).send('Server Error');
        }
    }
    // --- End Route Handler Function ---
);

// --- PUT /api/workouts/:workoutId/exercises/:exerciseId ---
// @desc    Update a specific exercise within a workout
// @access  Private
router.put(
    '/:workoutId/exercises/:exerciseId',
    [ // Keep middleware and validations the same
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        param('exerciseId', 'Invalid Exercise ID').isMongoId(),
        // Body validations...
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
        const updatesFromBody = req.body; // Raw updates from the request body

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            const exerciseIdObject = new mongoose.Types.ObjectId(exerciseId); // Convert exerciseId too

            // --- Build the $set object for MongoDB update ---
            const updateFields = {};
            let latestEndTime = null; // To track the latest end time for the overall workout

            // Construct fields to set using "arrayFilters" positional operator syntax
            for (const key in updatesFromBody) {
                if (Object.hasOwnProperty.call(updatesFromBody, key)) {
                    // Handle dates explicitly if needed, though validation might handle it
                    if ((key === 'startTime' || key === 'endTime') && updatesFromBody[key]) {
                        const dateValue = new Date(updatesFromBody[key]);
                        updateFields[`exercises.$[elem].${key}`] = dateValue;
                        // Track the latest endTime being set
                        if (key === 'endTime') {
                            latestEndTime = dateValue;
                        }
                    } else if (updatesFromBody[key] !== undefined) {
                        updateFields[`exercises.$[elem].${key}`] = updatesFromBody[key];
                    }
                }
            }

            // --- Update parent workout fields ---
            if (latestEndTime) {
                updateFields['endTime'] = latestEndTime; // Update overall workout endTime
            }
            updateFields['status'] = 'completed'; // Ensure status is completed

            // --- Execute the Update Query ---
            const updatedWorkout = await Workout.findOneAndUpdate(
                { // Find criteria for the parent document
                    _id: workoutId,
                    userId: userIdObject,
                    "exercises._id": exerciseIdObject // Ensure the exercise exists in the array
                },
                { // The update operation
                    $set: updateFields
                },
                { // Options
                    arrayFilters: [{ "elem._id": exerciseIdObject }], // Target the specific sub-document using its _id
                    new: true // Return the updated document
                }
            );
            // --- End Update Query ---


            if (!updatedWorkout) {
                // This means either the workout wasn't found, user didn't match,
                // OR the specific exerciseId wasn't found within that workout's array.
                return res.status(404).json({ msg: 'Workout or Exercise not found, or user unauthorized' });
            }

            // --- Optional: Re-calculate workoutType based on updatedWorkout.exercises ---
            // (Add derivation logic here if needed, operating on updatedWorkout.exercises)
            if (updatedWorkout.exercises && updatedWorkout.exercises.length > 0) {
                const types = [...new Set(updatedWorkout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                let derivedType = 'Other';
                if (types.length === 1) { derivedType = types[0]; }
                else if (types.length > 1) { derivedType = 'Mixed'; }
                // Only update if it changed (optional optimization)
                if (updatedWorkout.workoutType !== derivedType) {
                    updatedWorkout.workoutType = derivedType;
                    // Need to save again if type is derived *after* findOneAndUpdate
                    await updatedWorkout.save();
                }
            }
            // --- End Workout Type ---


            res.json({ msg: 'Exercise updated successfully', workout: updatedWorkout });

        } catch (err) {
            console.error("Error updating exercise:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

// --- POST /api/workouts/startExercise ---
// @desc    Start tracking a new exercise within today's workout session
// @access  Private
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
            // --- Convert userId to ObjectId ---
            let userIdObject;
            try {
                userIdObject = new mongoose.Types.ObjectId(userIdString);
            } catch (idError) {
                console.error("Invalid userId format from token:", userIdString);
                return res.status(400).json({ msg: 'Invalid user ID format' });
            }
            // -----------------------------------

            const startTimeDate = new Date(startTime); // Convert ISO string to Date

            // --- Find or Create Workout for the Day ---
            let workout = await Workout.findOneAndUpdate(
                { // Find criteria
                    userId: userIdObject,       // Use ObjectId
                    date: localDateString,
                    status: { $in: ['planned', 'in-progress'] }
                },
                { // Updates to apply
                    $set: {
                        status: 'completed', // Set to completed when an exercise starts
                        startTime: startTimeDate // Ensure startTime reflects first actual start
                    },
                    $setOnInsert: { // Fields ONLY if creating new
                        userId: userIdObject,
                        date: localDateString,
                        createdByUserId: userIdObject, // User created this performance log
                        isCoachAssigned: false,
                        exercises: [],
                        workoutType: 'Mixed'
                    }
                },
                { new: true, upsert: true, sort: { date: 1 } } // Options
            );

            // --- Important: If updating existing workout, reset endTime & ensure status ---
            // findOneAndUpdate returns the found doc if it existed *before* $setOnInsert ran
            // We need to ensure endTime is cleared if we're adding a new exercise
            workout.endTime = undefined; // Clear any previous overall end time
            workout.status = 'completed'; // Ensure status is 'completed' even if it was 'planned'

            // --- Get Machine Details (Same) ---
            const machine = await Machine.findById(machineId);
            if (!machine) {
                return res.status(404).json({ msg: 'Machine details not found' });
            }

            try {
                await Machine.updateOne(
                    { _id: machineId },
                    { $inc: { scanCount: 1 } }
                );
                console.log(`[Start Exercise] Incremented scanCount for machine ${machineId}`);
            } catch (incError) {
                console.error(`[Start Exercise] Failed to increment scanCount for machine ${machineId}:`, incError.message);
            }

            // --- Create and Add Exercise Sub-document (Same) ---
            const newExercise = {
                machineId: machineId,
                exerciseName: machine.exerciseName,
                exerciseType: machine.exerciseType,
                trainedMuscle: machine.trainedMuscle,
                startTime: startTimeDate // Use Date object
            };
            workout.exercises.push(newExercise);

            // --- Optional: Derive Workout Type (Same logic as before) ---
            if (workout.exercises && workout.exercises.length > 0) {
                const types = [...new Set(workout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                if (types.length === 1) { workout.workoutType = types[0]; }
                else if (types.length > 1) { workout.workoutType = 'Mixed'; }
                else { workout.workoutType = 'Other'; }
            } else { workout.workoutType = 'Other'; }
            // --- End Optional Type Derivation ---


            // --- Save and Respond ---
            await workout.save(); // Saves new exercise AND the cleared endTime/updated status
            const addedExerciseIndex = workout.exercises.length - 1;
            res.status(200).json({
                msg: 'Exercise started successfully',
                workoutId: workout._id,
                exerciseIndex: addedExerciseIndex
            });

        } catch (err) {
            console.error("Error starting exercise:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

// --- DELETE /api/workouts/:workoutId/exercises/:exerciseId ---
// @desc    Remove a specific exercise from a workout
// @access  Private
router.delete(
    '/:workoutId/exercises/:exerciseId', // Use DELETE method
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        param('exerciseId', 'Invalid Exercise ID').isMongoId(), // ID of the sub-document
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

            // Find the workout and pull the specific exercise sub-document
            // $pull removes items from an array that match a condition
            const workout = await Workout.findOneAndUpdate(
                { // Find criteria
                    _id: workoutId,
                    userId: userIdObject
                },
                { // Update operation
                    $pull: {
                        exercises: { _id: exerciseId } // Remove exercise with matching _id
                    }
                },
                { new: true } // Return the updated document
            );

            if (!workout) {
                // Workout not found or didn't belong to user
                return res.status(404).json({ msg: 'Workout not found or user unauthorized' });
            }

            // Optional: Recalculate workout startTime/endTime/type if needed after removal
            // For simplicity, we might skip this unless required

            res.json({ msg: 'Exercise removed successfully', workout });

        } catch (err) {
            console.error("Error removing exercise:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

// --- POST /api/workouts/:workoutId/exercises ---
// @desc    Add a new exercise to an existing workout
// @access  Private
router.post(
    '/:workoutId/exercises',
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        // Validation for the new exercise data in the body
        // Allowing flexibility: require machineId OR exercise details
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

            // Fetch machine details if machineId provided, otherwise use provided details
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

            // Construct the new exercise sub-document
            const newExercise = {
                machineId: exerciseData.machineId || null, // Can be null if entered manually
                exerciseName: exerciseData.exerciseName || machineDetails.exerciseName,
                exerciseType: exerciseData.exerciseType || machineDetails.exerciseType,
                trainedMuscle: exerciseData.trainedMuscle || machineDetails.trainedMuscle,
                startTime: exerciseData.startTime, // Already validated as Date
                endTime: exerciseData.endTime,     // Already validated as Date
                durationSeconds: exerciseData.durationSeconds,
                repetitions: exerciseData.repetitions,
                weight: exerciseData.weight,
                weightUnit: exerciseData.weightUnit || 'kg', // Default if not provided
            };

            // Optional: Recalculate overall workout startTime/endTime/Type based on new exercise
            workout.exercises.push(newExercise);
            workout.exercises.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)); // Keep sorted

            // Update overall times if needed
            if (newExercise.startTime < workout.startTime) {
                workout.startTime = newExercise.startTime;
            }
            // Update endTime only if this new exercise ends later than current endTime
            if (!workout.endTime || newExercise.endTime > workout.endTime) {
                workout.endTime = newExercise.endTime;
            }
            // Re-derive workout type (optional)
            // ... (workout type derivation logic) ...


            await workout.save();
            res.status(201).json(workout); // Return the updated workout

        } catch (err) {
            console.error("Error adding exercise:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

//POST generate workout with AI 
router.post('/generateAI', authMiddleware, async (req, res) => {
    console.log('AI Generation endpoint called - Not implemented yet.');
    // TODO: Implement AI generation logic here
    res.status(501).json({ msg: 'AI workout generation is not yet implemented.' });
});

//GET latest workout with planned status
router.get('/latestPlanned', authMiddleware, async (req, res) => {
    try {
        const userIdObject = new mongoose.Types.ObjectId(req.user.id);
        const latestPlan = await Workout.findOne({
            userId: userIdObject,
            status: 'planned',
            isCoachAssigned: false // Only user's own plans
        }).sort({ createdAt: -1 }); // Get the most recently created one

        if (!latestPlan) {
            return res.json(null); // Send null if no plan found
        }
        res.json(latestPlan);
    } catch (err) {
        console.error("Error fetching latest planned workout:", err.message);
        res.status(500).send('Server Error');
    }
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
    return array;
}

//POST generate workout plan
router.post('/generate', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const userIdObject = new mongoose.Types.ObjectId(userId);

    try {
        // 1. Fetch User Preferences & Active Gym
        const user = await User.findById(userIdObject).select('activeGymId preferences');
        if (!user?.activeGymId) {
            return res.status(400).json({ msg: "Please select an active gym in your profile first." });
        }
        const userGymId = user.activeGymId;
        const prefs = user.preferences || {};
        const prefWorkoutType = prefs.workoutType || 'Any';
        const prefMuscleFocus = prefs.muscleFocus || 'Auto';
        const prefNumExercises = prefs.numExercises || 5;
        const prefRepRange = prefs.repRange || '8-12';
        console.log(`[Generate V4] User Prefs - Type: ${prefWorkoutType}, Focus: ${prefMuscleFocus}, Num: ${prefNumExercises}, Reps: ${prefRepRange}`);

        // 2. Fetch Recent History
        const historyLimit = 10;
        const recentWorkouts = await Workout.find({ userId: userIdObject, status: 'completed' })
            .sort({ date: -1 }).limit(historyLimit).select('date exercises.trainedMuscle').lean();

        // 3. Analyze Muscle Recency
        const majorGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Abs']; // Groups for recency calculation
        const lastTrained = {};
        majorGroups.forEach(g => lastTrained[g] = '1970-01-01');
        for (const workout of recentWorkouts) {
            for (const exercise of workout.exercises) {
                const majorGroup = getMajorMuscleGroup(exercise.trainedMuscle);
                if (majorGroups.includes(majorGroup) && workout.date > lastTrained[majorGroup]) {
                    lastTrained[majorGroup] = workout.date;
                }
            }
        }

        // 4. Determine Primary Target Group
        let primaryTargetGroup = majorGroups[0]; // Default
        if (prefMuscleFocus !== 'Auto' && prefMuscleFocus !== 'Full Body' && majorGroups.includes(prefMuscleFocus)) {
            primaryTargetGroup = prefMuscleFocus;
            console.log(`[Generate V4] Using user focus: ${primaryTargetGroup}`);
        } else {
            let oldestDate = '3000-01-01';
            for (const group of majorGroups) {
                if (lastTrained[group] < oldestDate) { oldestDate = lastTrained[group]; primaryTargetGroup = group; }
            }
            console.log(`[Generate V4] Using least recent group: ${primaryTargetGroup}`);
        }

        // 5. Determine Secondary Group(s) & Target Counts
        let secondaryTargetGroups = [];
        const totalExerciseTarget = prefNumExercises;
        let primaryExerciseCount = Math.max(1, Math.round(totalExerciseTarget * 0.6));
        let secondaryExerciseCount = totalExerciseTarget - primaryExerciseCount;
        const pairings = { 'Chest': ['Triceps'], 'Back': ['Biceps'], 'Legs': ['Abs'], 'Shoulders': ['Triceps'], 'Biceps': ['Back'], 'Triceps': ['Chest'], 'Abs': ['Legs'] };

        if (prefMuscleFocus === 'Full Body') {
            // For Full Body pref, maybe override targets to pick 1 from several groups instead of pairing
            // For simplicity now, just target the least recent group primarily
            console.log(`[Generate V4] Full Body focus selected, targeting least recent: ${primaryTargetGroup}`);
            secondaryTargetGroups = []; // Reset pairings for full body? Or let pairings apply? User choice. Let's clear for now.
            primaryExerciseCount = totalExerciseTarget;
            secondaryExerciseCount = 0;
        } else if (pairings[primaryTargetGroup]) {
            secondaryTargetGroups = pairings[primaryTargetGroup];
            if (secondaryTargetGroups.length === 0) {
                secondaryExerciseCount = 0; primaryExerciseCount = totalExerciseTarget;
            } else {
                // Ensure counts don't exceed total target and adjust split if secondary count became 0
                secondaryExerciseCount = Math.max(0, totalExerciseTarget - primaryExerciseCount);
                if (secondaryExerciseCount > 0) {
                    secondaryExerciseCount = Math.max(1, Math.floor(secondaryExerciseCount / secondaryTargetGroups.length));
                    primaryExerciseCount = totalExerciseTarget - (secondaryTargetGroups.length * secondaryExerciseCount);
                } else {
                    primaryExerciseCount = totalExerciseTarget; // Fallback if secondary calc is 0
                }
            }
        } else {
            primaryExerciseCount = totalExerciseTarget;
            secondaryExerciseCount = 0;
        }
        console.log(`[Generate V4] Aiming for up to ${primaryExerciseCount} primary (${primaryTargetGroup}) and ${secondaryExerciseCount} secondary (${secondaryTargetGroups.join('/') || 'None'}) exercises.`);

        // 6. Find Available Exercises for Target Groups at the Gym
        const queryMachineFilter = { gymId: userGymId };
        if (prefWorkoutType !== 'Any' && prefWorkoutType !== 'Mixed') {
            queryMachineFilter.exerciseType = prefWorkoutType;
        }

        const primaryMachinesAvailable = await Machine.find({
            ...queryMachineFilter,
            trainedMuscle: primaryTargetGroup
        }).lean();

        const secondaryMachinesAvailable = secondaryTargetGroups.length > 0 ? await Machine.find({
            ...queryMachineFilter,
            trainedMuscle: { $in: secondaryTargetGroups }
        }).lean() : [];

        console.log(`[Generate V4] Found ${primaryMachinesAvailable.length} available primary, ${secondaryMachinesAvailable.length} secondary machines.`);

        // 7. Select Exercises Randomly, Respecting Counts
        let plannedExercises = [];
        const selectedMachineIds = new Set(); // Track selected IDs

        // Select Primary
        if (primaryMachinesAvailable.length > 0) {
            let shuffledPrimary = shuffleArray(primaryMachinesAvailable);
            let countToTake = Math.min(primaryExerciseCount, shuffledPrimary.length);
            for (let i = 0; i < countToTake; i++) {
                plannedExercises.push({ /* details from shuffledPrimary[i] */
                    machineId: shuffledPrimary[i]._id, exerciseName: shuffledPrimary[i].exerciseName,
                    exerciseType: shuffledPrimary[i].exerciseType, trainedMuscle: shuffledPrimary[i].trainedMuscle, weightUnit: 'kg'
                });
                selectedMachineIds.add(shuffledPrimary[i]._id.toString());
            }
        }

        // Select Secondary
        let remainingSlots = totalExerciseTarget - plannedExercises.length; // How many more needed?
        let secondaryStillNeeded = Math.min(remainingSlots, secondaryExerciseCount * secondaryTargetGroups.length); // Max secondary needed

        if (secondaryStillNeeded > 0 && secondaryMachinesAvailable.length > 0) {
            let shuffledSecondary = shuffleArray(secondaryMachinesAvailable);
            for (let i = 0; plannedExercises.length < totalExerciseTarget && i < shuffledSecondary.length; i++) {
                // Avoid adding duplicates
                if (!selectedMachineIds.has(shuffledSecondary[i]._id.toString())) {
                    plannedExercises.push({ /* details from shuffledSecondary[i] */
                        machineId: shuffledSecondary[i]._id, exerciseName: shuffledSecondary[i].exerciseName,
                        exerciseType: shuffledSecondary[i].exerciseType, trainedMuscle: shuffledSecondary[i].trainedMuscle, weightUnit: 'kg'
                    });
                    selectedMachineIds.add(shuffledSecondary[i]._id.toString());
                }
            }
        }

        // 8. Error if no exercises selected at all
        if (plannedExercises.length === 0) {
            return res.status(404).json({ msg: "Could not find any suitable machines matching your preferences in the selected gym." });
        }

        console.log(`[Generate V4] Selected ${plannedExercises.length} exercises for the plan.`);

        // 9. Add Rep Range Logic
        let finalWorkoutType = 'Mixed'; // Determine final type
        const typesInPlan = [...new Set(plannedExercises.map(e => e.exerciseType))];
        if (typesInPlan.length === 1) finalWorkoutType = typesInPlan[0];
        if (prefWorkoutType !== 'Any' && prefWorkoutType !== 'Mixed') finalWorkoutType = prefWorkoutType;

        if (finalWorkoutType === 'Strength' || finalWorkoutType === 'Mixed') {
            plannedExercises = plannedExercises.map(ex => {
                const defaultReps = ex.exerciseType === 'Strength'
                    ? (prefRepRange === '5-8' ? 6 : prefRepRange === '12-15' ? 12 : 10)
                    : undefined;
                return { ...ex, repetitions: ex.repetitions ?? defaultReps };
            });
        }

        // 10. Create Workout Document
        const planDate = new Date();
        planDate.setHours(12, 0, 0, 0);
        const planDateString = planDate.toLocaleDateString('sv-SE'); // YYYY-MM-DD

        const newWorkout = new Workout({
            userId: userIdObject, createdByUserId: userIdObject, date: planDateString,
            status: 'planned', exercises: plannedExercises, workoutType: finalWorkoutType,
            isCoachAssigned: false
        });

        // 11. Save & Respond
        await newWorkout.save();
        console.log(`[Generate V4] Saved generated planned workout ${newWorkout._id}.`);
        res.status(201).json(newWorkout);

    } catch (err) {
        console.error("[Generate V4] Error:", err.message, err.stack);
        res.status(500).send('Server Error');
    }
});

//PUT /api/workouts/:workoutId Saves updated exercise list
router.put(
    '/:workoutId', // Using PUT on the workout ID itself
    [
        authMiddleware,
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        body('exercises', 'Exercises array is required').isArray()
        // Add more validation for the structure of exercises array items if needed
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workoutId } = req.params;
        const userId = req.user.id;
        const { exercises } = req.body; // Expecting the full updated array

        try {
            const userIdObject = new mongoose.Types.ObjectId(userId);
            const workout = await Workout.findOne({
                _id: workoutId,
                userId: userIdObject,
                status: 'planned' // Can only save/update 'planned' workouts this way
            });

            if (!workout) {
                return res.status(404).json({ msg: 'Planned workout not found or user unauthorized' });
            }

            // Overwrite the exercises array completely
            workout.exercises = exercises;
            workout.markModified('exercises'); // Tell Mongoose the array was changed

            // Optional: Re-derive workoutType based on new exercises
            if (workout.exercises && workout.exercises.length > 0) {
                const types = [...new Set(workout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                if (types.length === 1) { workout.workoutType = types[0]; }
                else if (types.length > 1) { workout.workoutType = 'Mixed'; }
                else { workout.workoutType = 'Other'; }
            } else {
                workout.workoutType = 'Other';
            }

            await workout.save();
            res.json(workout); // Return updated plan

        } catch (err) {
            console.error("Error updating planned workout:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

// --- PUT /api/workouts/:workoutId/endExercise/:exerciseIndex ---
// @desc    End a specific exercise within a workout, save details
// @access  Private
router.put(
    '/:workoutId/endExercise/:exerciseIndex',
    [
        authMiddleware, // User must be logged in
        // Validation (keep existing validation)
        param('workoutId', 'Invalid Workout ID').isMongoId(),
        param('exerciseIndex', 'Invalid Exercise Index').isInt({ min: 0 }),
        body('endTime', 'End time is required').isISO8601().toDate(), // Validator converts to Date object
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
        const userIdString = req.user.id; // Get user ID string from token
        // Get updates from request body (endTime is now a Date object thanks to .toDate())
        const { endTime, durationSeconds, repetitions, weight } = req.body;

        try {
            // --- Convert userId to ObjectId ---
            let userIdObject;
            try {
                userIdObject = new mongoose.Types.ObjectId(userIdString);
            } catch (idError) {
                console.error("Invalid userId format from token:", userIdString);
                return res.status(400).json({ msg: 'Invalid user ID format' });
            }
            // ----------------------------------

            // 1. Find the specific workout belonging to the user (removed status check)
            const workout = await Workout.findOne({
                _id: workoutId,
                userId: userIdObject,
                // status: 'in-progress' // No longer needed - find any workout matching ID/User
            });

            if (!workout) {
                // Workout might be missing or doesn't belong to user
                return res.status(404).json({ msg: 'Workout session not found' });
            }

            // 2. Validate the exercise index (Same)
            const index = parseInt(exerciseIndex, 10);
            if (isNaN(index) || index < 0 || index >= workout.exercises.length) {
                return res.status(400).json({ msg: 'Invalid exercise index' });
            }

            // 3. Get the specific exercise sub-document (Same)
            const exercise = workout.exercises[index];

            // 4. Check if exercise already ended (Same)
            if (exercise.endTime) {
                return res.status(400).json({ msg: 'This exercise has already been ended' });
            }

            // 5. Prepare the updates for the exercise sub-document (Use Date object for endTime)
            const exerciseUpdates = {
                endTime: endTime, // Already a Date object from validation
                durationSeconds,
                ...(repetitions !== undefined && { repetitions: repetitions }),
                ...(weight !== undefined && { weight: weight }),
            };
            exercise.set(exerciseUpdates); // Update sub-document

            // --- 6. Update Parent Workout ---
            workout.endTime = exercise.endTime; // Set overall workout endTime
            workout.status = 'completed';     // Ensure status is 'completed'
            // ---------------------------------

            // --- 7. Optional: Derive Workout Type (Same logic as in startExercise) ---
            if (workout.exercises && workout.exercises.length > 0) {
                const types = [...new Set(workout.exercises.map(ex => ex.exerciseType).filter(Boolean))];
                if (types.length === 1) { workout.workoutType = types[0]; }
                else if (types.length > 1) { workout.workoutType = 'Mixed'; }
                else { workout.workoutType = 'Other'; }
            } else { workout.workoutType = 'Other'; }
            // ------------------------------------

            // 8. Save the parent Workout document (persists sub-doc changes AND parent changes)
            await workout.save();

            // 9. Respond (Same)
            res.json({
                msg: 'Exercise ended successfully',
                updatedExercise: workout.exercises[index] // Send back the final state
            });

        } catch (err) {
            console.error("Error ending exercise:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

//Maps muscles to body parts
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
    if (['cardio', 'full body', 'running', 'elliptical'].some(m => muscle.includes(m))) return 'Cardio'; // Treat Cardio as a group
    return 'Other';
};

module.exports = router;