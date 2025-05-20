const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const gymSchema = new Schema({
    name: { type: String, required: true, trim: true, unique: true },
    address: {  street: { type: String, trim: true }, city: { type: String, trim: true }, 
                postalCode: { type: String, trim: true }, country: { type: String, trim: true } },
}, { timestamps: true });

module.exports = mongoose.model('Gym', gymSchema);