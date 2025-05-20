const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    // Get token from header
    const token = req.header('Authorization'); // Standard way is "Authorization: Bearer TOKEN"

    // Check if no token
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Format is usually "Bearer <token>", so split and get the token part
    const tokenPart = token.split(' ')[1];
    if (!tokenPart) {
         return res.status(401).json({ msg: 'Token format is invalid, authorization denied' });
    }

    try {
        const decoded = jwt.verify(tokenPart, process.env.JWT_SECRET);

        // Add user payload (e.g., { user: { id: '...' } }) to the request object
        req.user = decoded.user;
        next(); // Proceed to the protected route
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};