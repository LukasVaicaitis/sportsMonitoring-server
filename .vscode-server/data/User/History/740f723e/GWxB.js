const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');

const { OAuth2Client } = require('google-auth-library');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000;

router.post('/request-password-reset', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ msg: 'Please provide an email address.' });
    }

    try {
        // 1. Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Important: Don't reveal if the email exists or not for security
            console.log(`[Reset Request] Email not found or user doesn't exist: ${email}`);
            return res.json({ msg: 'If an account with that email exists, a password reset link has been sent.' });
        }

        // 2. Generate a secure reset token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // 3. Hash the token before storing it
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // 4. Set token expiry (e.g., 10 minutes)
        const tokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now

        // 5. Store the hashed token and expiry with the user (Example: adding fields to User schema)
        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = tokenExpiry;
        await user.save();

        // 6. Create the reset URL (link to send in email)
        const resetUrl = `sports-tracker-app://reset-password/${resetToken}`;   

        // 7. Prepare email content
        const message = `
            <h1>Password Reset Request</h1>
            <p>You requested a password reset for your account.</p>
            <p>Please click on the following link to complete the reset process:</p>
            <p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>
            <p>The link will expire in 10 minutes.</p>
            <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
        `;

        // 8. Send the email
        try {
            await sendEmail({
                to: user.email,
                subject: 'Password Reset Request',
                html: message,
            });
            console.log(`[Reset Request] Reset email sent to ${user.email}`);
            res.json({ msg: 'If an account with that email exists, a password reset link has been sent.' });
        } catch (emailError) {
            console.error('[Reset Request] Error sending email:', emailError);
            // Invalidate the token if email fails
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save();
            res.status(500).json({ msg: 'Error sending reset email. Please try again later.' });
        }

    } catch (err) {
        console.error('[Reset Request] Server Error:', err);
        res.status(500).send('Server Error');
    }
});

router.put('/reset-password/:token', async (req, res) => {
    const { password } = req.body; // New password from user input
    const resetToken = req.params.token; // The *unhashed* token from the URL

    if (!password || password.length < 6) { // Add your password complexity rules
        return res.status(400).json({ msg: 'Password must be at least 6 characters.' });
    }

    try {
        // 1. Hash the token from the URL to match the stored hashed token
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // 2. Find the user by the hashed token and check expiry
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() } // Check if token hasn't expired
        });

        if (!user) {
            return res.status(400).json({ msg: 'Password reset token is invalid or has expired.' });
        }

        // 3. Hash the new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // 4. Clear the reset token fields
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        // 5. Save the user with the new password
        await user.save();

        console.log(`[Reset Password] Password reset successfully for user ${user.email}`);
        res.json({ msg: 'Password reset successful. You can now log in with your new password.' });

    } catch (err) {
        console.error('[Reset Password] Server Error:', err);
        res.status(500).send('Server Error');
    }
});


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

        const { name, email, password } = req.body;

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

            if (user.lockoutUntil && user.lockoutUntil > Date.now()) {
                const remainingTime = Math.ceil((user.lockoutUntil - Date.now()) / (60 * 1000)); // In minutes
                console.log(`[Login Attempt] Account locked for ${user.email}. Remaining: ${remainingTime} min.`);
                return res.status(403).json({ // 403 Forbidden is appropriate for locked accounts
                    errors: [{ msg: `Account locked due to too many failed attempts. Please try again in ${remainingTime} minutes.` }]
                });
            }

            // Use the comparePassword method from the User model
            const isMatch = await user.comparePassword(password);

            if (isMatch) {
                const payload = { user: { id: user.id, isAdministrator: user.isAdministrator, name: user.name } };

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
            } else {
                user.failedLoginAttempts += 1;
                console.log(`[Login Attempt] Failed login attempt ${user.failedLoginAttempts}/${MAX_FAILED_ATTEMPTS} for ${user.email}`);

                if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
                    // --- Lock the account ---
                    const lockoutExpiry = Date.now() + LOCKOUT_DURATION_MS;
                    user.lockoutUntil = new Date(lockoutExpiry);
                    console.log(`[Login Attempt] Locking account for ${user.email} until ${user.lockoutUntil.toISOString()}`);

                    // Send security alert email
                    try {
                        const alertMessage = `
                            <h1>Security Alert</h1>
                            <p>Your account (${user.email}) was locked due to multiple failed login attempts.</p>
                            <p>The lock will automatically expire in about 24 hours.</p>
                            <p>If this was not you, please ensure your account is secure. You may want to reset your password once the lock expires.</p>
                        `;
                        await sendEmail({
                            to: user.email,
                            subject: 'Security Alert: Account Locked',
                            html: alertMessage,
                        });
                        console.log(`[Login Attempt] Lockout alert email sent to ${user.email}`);
                    } catch (emailError) {
                        console.error('[Login Attempt] Failed to send lockout alert email:', emailError);
                        // Proceed with lockout even if email fails
                    }

                    await user.save();
                    return res.status(403).json({ // Send 403 Forbidden
                        errors: [{ msg: `Account locked due to too many failed attempts. Please try again later.` }]
                    });

                } else {
                    // --- Threshold not reached, just save failed attempt count ---
                    await user.save();
                    return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
                }
            }

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