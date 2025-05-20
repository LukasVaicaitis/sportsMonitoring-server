// models/Workout.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const exerciseSubSchema = new Schema({
    machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: false },
    exerciseName: { type: String, required: true },
    exerciseType: { type: String },
    trainedMuscle: { type: String },
    startTime: { type: Date, required: false }, // <-- Make optional
    endTime: { type: Date },
    durationSeconds: { type: Number },
    repetitions: { type: Number },
    weight: { type: Number },
    weightUnit: { type: String, enum: ['kg', 'lbs'], default: 'kg' }
}, { _id: true, timestamps: false });


const workoutSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: function() { return this.userId; } },
    date: { type: String, required: true, index: true },
    startTime: { type: Date, required: false }, // <-- Make optional
    endTime: { type: Date },
    status: { type: String, enum: ['planned', 'completed'], default: 'planned', required: true, index: true },
    isCoachAssigned: { type: Boolean, default: false, index: true },
    workoutType: { type: String, enum: ['Strength', 'Cardio', 'Flexibility', 'Other', 'Mixed'], default: 'Mixed' },
    exercises: [exerciseSubSchema]
}, { timestamps: true });

module.exports = mongoose.model('Workout', workoutSchema);