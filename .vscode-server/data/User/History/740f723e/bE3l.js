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
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.json({ msg: 'If an account with that email exists, a password reset link has been sent.' });
        }
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        const tokenExpiry = Date.now() + 10 * 60 * 1000;

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = tokenExpiry;
        await user.save();
        const resetUrl = `sports-tracker-app://reset-password/${resetToken}`;   

        const message = `
            <h1>Password Reset Request</h1>
            <p>You requested a password reset for your account.</p>
            <p>Please click on the following link to complete the reset process:</p>
            <p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>
            <p>The link will expire in 10 minutes.</p>
            <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
        `;

        try {
            await sendEmail({
                to: user.email,
                subject: 'Password Reset Request',
                html: message,
            });
            res.json({ msg: 'If an account with that email exists, a password reset link has been sent.' });
        } catch (emailError) {
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save();
            res.status(500).json({ msg: 'Error sending reset email. Please try again later.' });
        }

    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.put('/reset-password/:token', async (req, res) => {
    const { password } = req.body;
    const resetToken = req.params.token;

    if (!password || password.length < 6) { 
        return res.status(400).json({ msg: 'Password must be at least 6 characters.' });
    }

    try {
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ msg: 'Password reset token is invalid or has expired.' });
        }
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        res.json({ msg: 'Password reset successful. You can now log in with your new password.' });

    } 
    catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post(
    '/register',
    [
        body('name', 'Name is required').not().isEmpty().trim(),
        body('email', 'Please include a valid email').isEmail().normalizeEmail(),
        body('password', 'Password must be 6 or more characters').isLength({ min: 6 })
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
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

            const payload = {
                user: {
                    id: user.id,
                    isAdministrator: user.isAdministrator,
                    name: user.name
                }
            };
            jwt.sign(
                payload,
                process.env.JWT_SECRET, 
                { expiresIn: '1h' },
                (err, token) => {
                    if (err) throw err;
                    res.status(201).json({ token });
                }
            );
        } 
        catch (err) {
            res.status(500).send('Server error');
        }
    }
);

router.post(
    '/login',
    [
        body('email', 'Please include a valid email').isEmail().normalizeEmail(),
        body('password', 'Password is required').exists()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { email, password } = req.body;

        try {
            let user = await User.findOne({ email }).select('+password');
            if (!user) {
                return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
            }

            if (user.lockoutUntil && user.lockoutUntil > Date.now()) {
                const remainingTime = Math.ceil((user.lockoutUntil - Date.now()) / (60 * 1000));
                return res.status(403).json({
                    errors: [{ msg: `Account locked due to too many failed attempts. Please try again in ${remainingTime} minutes.` }]
                });
            }
            const isMatch = await user.comparePassword(password);

            if (isMatch) {
                const payload = { user: { id: user.id, isAdministrator: user.isAdministrator, name: user.name } };

                jwt.sign(
                    payload,
                    process.env.JWT_SECRET,
                    { expiresIn: '1h' },
                    (err, token) => {
                        if (err) throw err;
                        res.json({
                            token,
                            user: {
                                id: user.id,
                                name: user.name,
                                email: user.email,
                                role: user.isAdministrator
                            }
                        });
                    }
                );
            } else {
                user.failedLoginAttempts += 1;
                if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
                    const lockoutExpiry = Date.now() + LOCKOUT_DURATION_MS;
                    user.lockoutUntil = new Date(lockoutExpiry);
                    try {
                        const alertMessage = `
                            <h1>Security Alert</h1>
                            <p>Your account (${user.email}) was locked due to multiple failed login attempts.</p>
                            <p>The lock will automatically expire in about 24 hours.</p>
                            <p>If this was not you, please make sure your account is secure.</p>
                        `;
                        await sendEmail({
                            to: user.email,
                            subject: 'Security Alert: Account Locked',
                            html: alertMessage,
                        });
                    } catch (emailError) {}

                    await user.save();
                    return res.status(403).json({
                        errors: [{ msg: `Account locked due to too many failed attempts. Please try again later.` }]
                    });

                } else {
                    await user.save();
                    return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
                }
            }

        } catch (err) {
            res.status(500).send('Server error');
        }
    }
);

router.post(
    '/google',[ body('idToken', 'Google ID Token is required').notEmpty().isString() ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { idToken } = req.body;

        try {
            const ticket = await client.verifyIdToken({
                idToken: idToken,
                audience: GOOGLE_CLIENT_ID,
            });
            const googlePayload = ticket.getPayload();

            if (!googlePayload) {
                return res.status(400).json({ msg: 'Invalid Google Token Payload' });
            }

            const { sub: googleId, email, name, picture } = googlePayload;
            let user = await User.findOne({ provider: 'google', providerId: googleId });

            if (!user) {
                user = new User({
                    provider: 'google',
                    providerId: googleId,
                    email: email,
                    name: name,
                    picture: picture,
                    isAdministrator: false
                });
                await user.save();
            }
            const appPayload = {
                user: {
                    id: user.id,
                    isAdministrator: user.isAdministrator,
                    name: user.name
                }
            };

            jwt.sign(
                appPayload,
                process.env.JWT_SECRET,
                { expiresIn: '1h' },
                (err, appToken) => {
                    if (err) throw err;
                    res.json({
                        token: appToken,
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            isAdministrator: user.isAdministrator
                        }
                    });
                }
            );

        } catch (err) {
             if (err.message.includes("Token used too late") || err.message.includes("Invalid token signature")) {
                return res.status(401).json({ msg: 'Google token is invalid or expired' });
             }
            res.status(500).send('Server error');
        }
    }
);



module.exports = router;