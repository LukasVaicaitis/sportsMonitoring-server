// models/Workout.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the Exercise Sub-document Schema first (or import if large)
const exerciseSubSchema = new Schema({
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: true },
    exerciseName: { type: String, required: true },
    exerciseType: { type: String },
    trainedMuscle: { type: String },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    durationSeconds: { type: Number },
    repetitions: { type: Number },
    weight: { type: Number },
    weightUnit: { type: String, enum: ['kg', 'lbs'], default: 'kg' }
}, { _id: true, timestamps: false }); // Use sub-schema _id, don't need separate timestamps per exercise


const workoutSchema = new Schema({
    userId: { // Reference to the user
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index for finding user's workouts
    },
    date: { // Represents the day of the workout
        type: Date,
        required: true,
        index: true // Index for finding workouts by date
    },
    startTime: { // Actual start time of the first exercise
        type: Date,
        required: true
    },
    endTime: { // Actual end time when workout is marked complete
        type: Date
    },
    status: { // Track if workout is ongoing or finished
        type: String,
        enum: ['in-progress', 'completed'],
        default: 'in-progress',
        required: true,
        index: true
    },
    workoutType: { // Overall type (can be derived or set)
        type: String,
        enum: ['Strength', 'Cardio', 'Flexibility', 'Other', 'Mixed'],
        default: 'Mixed'
    },
    exercises: [exerciseSubSchema] // Array containing embedded Exercise documents
}, { timestamps: true }); // Adds createdAt, updatedAt for the Workout document

module.exports = mongoose.model('Workout', workoutSchema);