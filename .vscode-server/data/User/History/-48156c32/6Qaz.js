const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Gym = require('../models/Gym');

const isAdmin = (req, res, next) => {
    if (!req.user || req.user.isAdmin !== true) {
        return res.status(403).json({ msg: 'User not authorized' });
    }
    next();
};

router.get('/', authMiddleware, async (req, res) => {
    try {
        const gyms = await Gym.find().sort({ name: 1 });
        res.json(gyms);
    } catch (err) {
        console.error("Error fetching gyms:", err.message);
        res.status(500).send('Server Error');
    }
});

router.post(
    '/',
    [
        authMiddleware,
        isAdmin,
        body('name', 'Gym name is required').not().isEmpty().trim(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, address } = req.body;

        try {
            let gym = await Gym.findOne({ name });
            if (gym) {
                return res.status(400).json({ errors: [{ msg: 'Gym with that name already exists' }] });
            }

            gym = new Gym({ name, address });
            await gym.save();
            res.status(201).json(gym);

        } catch (err) {
            console.error("Error creating gym:", err.message);
            res.status(500).send('Server Error');
        }
    }
);

module.exports = router;