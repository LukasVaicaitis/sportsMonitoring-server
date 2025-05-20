const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded request bodies

// --- Database Connection ---
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// --- Basic Route ---
app.get('/', (req, res) => {
  res.send('Hello from Backend!');
});

app.use('/api/auth', require('./routes/auth'));

// --- Import User Model (Example - not used yet) ---
// const User = require('./models/User'); // You'll use this in your API routes later

// --- Define API Routes (You'll add these later) ---
// Example: app.use('/api/auth', require('./routes/auth')); // You'll create routes/auth.js later

// --- Start the Server ---
const PORT = process.env.PORT || 3000; // Use port from .env or default to 3000

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));