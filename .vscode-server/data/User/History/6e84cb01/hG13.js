const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Machine = require('../models/Machine');

router.get(
    '/',
    [
        authMiddleware,
        query('gymId', 'Invalid Gym ID Format').optional().isMongoId()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const queryFilter = {};
            if (req.query.gymId) {
                queryFilter.gymId = new mongoose.Types.ObjectId(req.query.gymId);
            }
            const machines = await Machine.find(queryFilter).sort({ exerciseName: 1 }).lean();
            res.json(machines);
        } 
        catch (err) {
            res.status(500).send('Server Error');
        }
    }
);
router.get(
    '/byTag/:tagId',
    [
        authMiddleware,
        param('tagId', 'Tag ID parameter is required').not().isEmpty().trim()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { tagId } = req.params;

        try {
            const machine = await Machine.findOne({ tagId: tagId });
            if (!machine) {
                return res.status(404).json({ msg: 'Machine not found for this tag' });
            }
            res.json(machine);

        } 
        catch (err) {
            res.status(500).send('Server error');
        }
    }
);
router.post(
    '/register',
    [
        authMiddleware,
        body('tagId', 'NFC Tag ID is required').not().isEmpty().trim(),
        body('exerciseType', 'Exercise type is required').not().isEmpty().trim(),
        body('exerciseName', 'Exercise name is required').not().isEmpty().trim(),
        body('instructionsLink', 'Invalid URL format').optional({ checkFalsy: true }).isURL(),
        body('trainedMuscle', 'Trained muscle group is required').not().isEmpty().trim(),
        body('gymId', 'Gym ID is required').isMongoId(), 
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { tagId, exerciseType, exerciseName, instructionsLink, trainedMuscle, gymId } = req.body;

        try {
            let existingMachine = await Machine.findOne({ tagId });
            if (existingMachine) {
                return res.status(400).json({ errors: [{ msg: 'This NFC Tag is already registered to another machine.' }] });
            }
            const newMachine = new Machine({
                tagId,
                exerciseType,
                exerciseName,
                instructionsLink,
                trainedMuscle,
                gymId,
                registeredBy: req.user.id
            });
            await newMachine.save();

            res.status(201).json(newMachine);

        } catch (err) {
            console.error("Machine registration error:", err.message);
            if (err.code === 11000) { 
                 return res.status(400).json({ errors: [{ msg: 'This NFC Tag ID is already registered (duplicate key).' }] });
            }
            res.status(500).send('Server error');   
        }
    }
);

module.exports = router;