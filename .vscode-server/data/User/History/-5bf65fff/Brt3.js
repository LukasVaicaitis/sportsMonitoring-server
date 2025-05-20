const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const machineSchema = new Schema({
    tagId: { type: String, required: true, unique: true, index: true },
    exerciseType: { type: String, required: true, trim: true },
    exerciseName: { type: String, required: true, trim: true },
    instructionsLink: { type: String, trim: true },
    trainedMuscle: { type: String, trim: true },
    registeredBy: { type: Schema.Types.ObjectId, ref: 'User' }
    gymId: {
        type: Schema.Types.ObjectId,
        ref: 'Gym',        // Reference the Gym model
        required: true,    // A machine must belong to a gym
        index: true        // Index for finding machines by gym
    }
}, { timestamps: true });

module.exports = mongoose.model('Machine', machineSchema);