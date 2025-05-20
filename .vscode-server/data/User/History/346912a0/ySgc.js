const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// --- Logging Middleware ---
// Logs every incoming request BEFORE it hits any specific route
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  // Log method, URL, and source IP
  console.log(`[${timestamp}] >>> Received Request: ${req.method} ${req.originalUrl} from ${req.ip}`);
  next(); // Continue to next middleware/route
};
// --- END Logging Middleware ---


// Standard Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded request bodies

// --- USE THE LOGGER ---
app.use(requestLogger); // Add the logger HERE

// --- Database Connection ---
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// --- Basic Route ---
app.get('/', (req, res) => {
  res.send('Hello from Backend!');
});

// --- API Routes ---
// Mounts your login/register routes. Requests to /api/auth/* will be handled by routes/auth.js
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));

// --- Start the Server ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));