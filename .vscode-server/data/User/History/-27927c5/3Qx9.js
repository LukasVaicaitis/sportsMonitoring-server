const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email address is required'], // Make it required
        unique: true,        // Ensure emails are unique across all users
        lowercase: true,     // Store emails in lowercase for consistency
        trim: true,          // Remove leading/trailing whitespace
        match: [/\S+@\S+\.\S+/, 'Please use a valid email address'], // Basic email format validation
        index: true          // Add an index for faster querying by email (unique:true also does this)
    },
    dateOfBirth: {
        type: Date,
        // Not necessarily required for registration, maybe filled in later
    },
    name: {
        type: String,
        trim: true,
        required: [true, 'Name is required'], // Often required during registration
    },
    experience: {
        // Assuming numerical experience, e.g., years. Adjust type if needed (e.g., String for 'Beginner')
        type: Number,
        min: 0
    },
    height: {
        // Assuming numerical height, e.g., in cm.
        type: Number,
        min: 0
    },
    weight: {
        // Assuming numerical weight, e.g., in kg.
        type: Number,
        min: 0
    },
    remindertime: {
        type: Number,
        min: 0,
        required: false,
        default: 2880      //1 day = 1440 min
    },
    password: {
        type: String,
        required: [true, 'Password is required'], // Required for standard registration/login
        select: false        // IMPORTANT: Prevents password hash from being sent back in queries by default
    },
    isAdministrator: {
        type: Boolean,
        required: true,
        default: false       // Default new users to not be administrators
    },
    activeGymId: {
        type: Schema.Types.ObjectId,
        ref: 'Gym',       // Reference the Gym model
        required: false,  // User might not have set one yet
        index: true       // Index if you query users by active gym
    },
    preferences: {
        workoutType: {
            type: String,
            default: 'Any'
        },
        muscleFocus: { 
            type: String,
            default: 'Auto' 
        },
        numExercises: { 
             type: Number,
             default: 5,
             min: 2,
             max: 10
         },
         repRange: { 
             type: String,
             default: '8-12'
         }
    },
}, {timestamps: true});

// --- Password Hashing Middleware ---
// Use a pre-save hook to hash the password BEFORE the document is saved to the DB
userSchema.pre('save', async function (next) {
    // 'this' refers to the document being saved
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) {
        return next(); // If password isn't changed, skip hashing
    }

    try {
        // Generate a salt (randomness factor) - 10 rounds is generally recommended
        const salt = await bcrypt.genSalt(10);
        // Hash the password using the salt
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error); // Pass any error to the next middleware/error handler
    }
});

// --- Password Comparison Method ---
// Add a method to the user schema to compare a candidate password with the stored hash
userSchema.methods.comparePassword = async function (candidatePassword) {
    // 'this' refers to the specific user document instance
    // We need to access the password hash directly here (it was excluded by 'select: false' in queries)
    // Mongoose allows access within instance methods even if select is false.
    // However, if you fetch the user WITHOUT explicitly selecting password, it might be missing.
    // Best practice is to explicitly select '+password' when needed for comparison.
    // Example query: User.findOne({ email }).select('+password');
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error; // Re-throw error to be handled by the calling function
    }
};


// Create and export the User model
const User = mongoose.model('User', userSchema);

module.exports = User;