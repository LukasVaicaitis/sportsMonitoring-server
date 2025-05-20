const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator'); // Input validation

// Import the User model
const User = require('../models/User'); // Adjust path if needed

// --- Registration Route ---
// POST /api/auth/register
router.post(
    '/register',
    [
        // --- Input Validation ---
        body('name', 'Name is required').not().isEmpty().trim(),
        body('email', 'Please include a valid email').isEmail().normalizeEmail(),
        body('password', 'Password must be 6 or more characters').isLength({ min: 6 })
        // Add validation for other required fields if needed (e.g., dateOfBirth)
        // body('dateOfBirth', 'Date of birth is required').not().isEmpty().isISO8601().toDate(),
    ],
    async (req, res) => {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() }); // Bad request
        }

        const { name, email, password /*, dateOfBirth, etc */ } = req.body;

        try {
            // 1. Check if user already exists
            let user = await User.findOne({ email });
            if (user) {
                // Use a generic message for security
                return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
            }

            // 2. Create new user instance (password will be hashed by pre-save hook in User.js)
            user = new User({
                name,
                email,
                password,
               // dateOfBirth // Add other fields from req.body here
            });

            // 3. Save user to database (triggers pre-save hook for hashing)
            await user.save();

            // 4. Generate JWT (Optional: Log user in immediately after registration)
            const payload = {
                user: {
                    id: user.id // Use the user's MongoDB _id
                    // Do NOT include sensitive info like password hash
                }
            };

            jwt.sign(
                payload,
                process.env.JWT_SECRET, // Your secret from .env
                { expiresIn: '1h' }, // Token expiration (e.g., 1 hour, 1 day '1d')
                (err, token) => {
                    if (err) throw err;
                    // Send token back (and maybe user ID or name, but not sensitive data)
                    res.status(201).json({ token }); // 201 Created
                }
            );

            // --- OR --- If not logging in immediately:
            // res.status(201).json({ msg: 'User registered successfully' });

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server error');
        }
    }
);

// --- Login Route ---
// POST /api/auth/login
router.post(
    '/login',
    [
        // --- Input Validation ---
        body('email', 'Please include a valid email').isEmail().normalizeEmail(),
        body('password', 'Password is required').exists()
    ],
    async (req, res) => {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        try {
            // 1. Find user by email (include password hash for comparison)
            let user = await User.findOne({ email }).select('+password');

            // 2. Check if user exists AND password matches
            if (!user) {
               // Avoid revealing whether email exists or password was wrong
                return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
            }

            // Use the comparePassword method from the User model
            const isMatch = await user.comparePassword(password);

            if (!isMatch) {
                return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
            }

            // 3. User exists and password is correct - Generate JWT
            const payload = {
                user: {
                    id: user.id,
                    role: user.isAdministrator, // Optional: Include role for authorization checks
                    name: user.name // Optional: Include name for convenience
                    // You could add other non-sensitive info if needed often, like name or role
                    // name: user.name,
                    // isAdministrator: user.isAdministrator
                }
            };

            jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: '1h' }, // Adjust expiration as needed
                (err, token) => {
                    if (err) throw err;
                    // Send token back (and maybe some user details)
                    // Exclude sensitive fields like password hash!
                    res.json({
                        token,
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.isAdministrator // Optional: Include role for authorization checks
                            // Add other non-sensitive fields you want the app to have immediately
                        }
                     });
                }
            );

        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server error');
        }
    }
);

module.exports = router;