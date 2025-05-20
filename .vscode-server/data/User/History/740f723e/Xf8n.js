const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator'); // Input validation
const User = require('../models/User');

const { OAuth2Client } = require('google-auth-library');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

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
            let user = await User.findOne({ email });
            if (user) {
                return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
            }

            user = new User({
                name,
                email,
                password,
            });

            await user.save();

            // 4. Generate JWT (Optional: Log user in immediately after registration)
            const payload = {
                user: {
                    id: user.id, // Use the user's MongoDB _id
                    isAdministrator: user.isAdministrator, // Optional: Include role for authorization checks
                    name: user.name // Optional: Include name for convenience
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
                }
            };

            jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: '1h' },
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

router.post(
    '/google',
    [
        // Validate that an idToken is sent in the request body
        body('idToken', 'Google ID Token is required').notEmpty().isString(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { idToken } = req.body;

        try {
            // 1. Verify the Google ID Token
            const ticket = await client.verifyIdToken({
                idToken: idToken,
                audience: GOOGLE_CLIENT_ID, // Specify your client ID
            });
            const googlePayload = ticket.getPayload();

            if (!googlePayload) {
                return res.status(400).json({ msg: 'Invalid Google Token Payload' });
            }

            const { sub: googleId, email, name, picture } = googlePayload;

            // 2. Find user by Google ID
            let user = await User.findOne({ provider: 'google', providerId: googleId });

            if (!user) {
                // 3. If user doesn't exist, check if email exists from another provider (optional)
                // let existingEmailUser = await User.findOne({ email: email });
                // if (existingEmailUser) { /* Handle account linking or error */ }

                // 4. Create a new user if they don't exist
                user = new User({
                    provider: 'google',
                    providerId: googleId,
                    email: email,
                    name: name,
                    picture: picture,
                    isAdministrator: false // Ensure default is not admin
                    // No password needed for OAuth users
                });
                await user.save();
                 console.log(`New user created via Google: ${email}`);
            } else {
                 console.log(`User logged in via Google: ${email}`);
                 // Optional: Update user's name/picture from Google if changed
                 // user.name = name; user.picture = picture; await user.save();
            }

            // 5. Create YOUR application's JWT
            const appPayload = {
                user: {
                    id: user.id, // Use your internal MongoDB ID
                    isAdministrator: user.isAdministrator,
                    name: user.name
                }
            };

            jwt.sign(
                appPayload,
                process.env.JWT_SECRET,
                { expiresIn: '1h' }, // Your app's token expiration
                (err, appToken) => {
                    if (err) throw err;
                    // 6. Send YOUR app's token and user info back
                    res.json({
                        token: appToken, // Your app's JWT
                        user: { // User info for the app state
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            isAdministrator: user.isAdministrator
                        }
                    });
                }
            );

        } catch (err) {
            // Handle errors during token verification or user processing
            console.error('Google Auth Error:', err.message);
             if (err.message.includes("Token used too late") || err.message.includes("Invalid token signature")) {
                return res.status(401).json({ msg: 'Google token is invalid or expired' });
             }
            res.status(500).send('Server error');
        }
    }
);

module.exports = router;