const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    const token = req.header('Authorization');
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    const tokenPart = token.split(' ')[1];
    if (!tokenPart) {
         return res.status(401).json({ msg: 'Token format is invalid, authorization denied' });
    }

    try {
        const decoded = jwt.verify(tokenPart, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};