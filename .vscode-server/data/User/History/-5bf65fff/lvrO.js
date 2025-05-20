// models/Machine.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const machineSchema = new Schema({
    tagId: { // The unique ID read from the NFC tag
        type: String,
        required: true,
        unique: true, // Ensure each tag ID is registered only once
        index: true   // Index for faster lookups
    },
    exerciseType: { // E.g., 'Cardio', 'Strength', 'Flexibility'
        type: String,
        required: true,
        trim: true
        // enum: ['Cardio', 'Strength', 'Flexibility', 'Other'] // Optional: Use enum for predefined types
    },
    exerciseName: { // E.g., 'Treadmill #3', 'Leg Press', 'Bicep Curl Machine'
        type: String,
        required: true,
        trim: true
    },
    instructionsLink: { // Optional URL to instructions/video
        type: String,
        trim: true
        // Add validation for URL format if desired
    },
    trainedMuscle: { // E.g., 'Legs', 'Biceps', 'Full Body'
        type: String,
        trim: true
        // Could also be an array: type: [String]
    },
    registeredBy: { // Track who registered the machine (optional but good)
        type: Schema.Types.ObjectId,
        ref: 'User' // Link to your User model
    }
    // Add location fields if needed (e.g., 'Gym Section A')
}, { timestamps: true }); // Add createdAt and updatedAt automatically

module.exports = mongoose.model('Machine', machineSchema);