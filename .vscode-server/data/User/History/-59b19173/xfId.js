const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const gymSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true // Usually gym names are unique
    },
    address: { // Optional address details
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        postalCode: { type: String, trim: true },
        country: { type: String, trim: true }
    },
    // Add other relevant fields like opening hours, contact info etc. later if needed
}, { timestamps: true });

module.exports = mongoose.model('Gym', gymSchema);