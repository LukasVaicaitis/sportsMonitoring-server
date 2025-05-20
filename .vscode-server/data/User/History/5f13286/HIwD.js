module.exports = function(req, res, next) {
    const requestPath = `${req.method} ${req.originalUrl}`;
    console.log(`[AuthMiddleware] Executing for: ${requestPath}`); // Log entry

    // Get token from header
    const authHeader = req.header('Authorization');

    // Check if no token header
    if (!authHeader) {
        console.log(`[AuthMiddleware] Failed for ${requestPath}: No Authorization header.`);
        // Use return to ensure function stops here
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    console.log(`[AuthMiddleware] Found Authorization header for ${requestPath}: ${authHeader.substring(0, 15)}...`);

    // Check format "Bearer token"
    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
        console.log(`[AuthMiddleware] Failed for ${requestPath}: Invalid token format.`);
        return res.status(401).json({ msg: 'Token format is invalid' });
    }
    const tokenPart = tokenParts[1];

    // Verify token
    try {
        console.log(`[AuthMiddleware] Verifying token for ${requestPath}...`);
        // Ensure JWT_SECRET is loaded from .env
        const decoded = jwt.verify(tokenPart, process.env.JWT_SECRET);

        // Check if decoded payload has the expected structure
        if (!decoded || !decoded.user || !decoded.user.id) {
             console.error(`[AuthMiddleware] Failed for ${requestPath}: Decoded token missing user.id.`);
             return res.status(401).json({ msg: 'Token payload is invalid' });
        }

        console.log(`[AuthMiddleware] Token VALID for ${requestPath}. Decoded user ID:`, decoded.user.id);
        req.user = decoded.user; // Attach user payload ({ id: ..., role: ..., name: ...})

        console.log(`[AuthMiddleware] req.user set for ${requestPath}. Calling next().`);
        next(); // Proceed to the actual route handler

    } catch (err) {
        // Log specific JWT errors (like TokenExpiredError)
        console.error(`[AuthMiddleware] Token verification FAILED for ${requestPath}:`, err.name, err.message);
        // Send 401 Unauthorized response
        res.status(401).json({ msg: 'Token is not valid' });
    }
};