const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email address is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/\S+@\S+\.\S+/, 'Please use a valid email address'],
        index: true
    },
    dateOfBirth: { type: Date },
    name: { type: String, trim: true, required: [true, 'Name is required'] },
    experience: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    weight: { type: Number, min: 0 },
    remindertime: { type: Number, min: 0, required: false, default: 2880 },
    password: { type: String,
        required: function() {
            return !this.provider || this.provider === 'email'; 
        },
        select: false
    },
    provider: { type: String, index: true },
    providerId: { type: String, index: true, sparse: true },
    isAdministrator: { type: Boolean, required: true, default: false },
    activeGymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: false, index: true },
    preferences: {
        workoutType: { type: String, default: 'Any' },
        muscleFocus: { type: String, default: 'Auto' },
        numExercises: { type: Number, default: 5, min: 2, max: 10 },
        repRange: { type: String, default: '8-12' }
    },
    failedLoginAttempts: { type: Number, required: true, default: 0 },
    lockoutUntil: { type: Date, default: null},
}, {timestamps: true});

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};
const User = mongoose.model('User', userSchema);

module.exports = User;