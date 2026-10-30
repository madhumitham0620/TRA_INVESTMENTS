import jwt from 'jsonwebtoken';
const ALLOWED_ROLES = [
    'ADMIN',
    'MANAGER',
    'SALES_EXECUTIVE',
    'AUDITOR',
    'CUSTOMER',
];
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    return secret && secret.length >= 32 ? secret : null;
}
export function authenticate(req, res, next) {
    const authReq = req;
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ message: 'Authentication required.' });
        return;
    }
    const token = header.slice(7).trim();
    if (!token) {
        res.status(401).json({ message: 'Authentication token is missing.' });
        return;
    }
    const secret = getJwtSecret();
    if (!secret) {
        res.status(500).json({
            message: 'Authentication is not configured correctly.',
        });
        return;
    }
    try {
        const decoded = jwt.verify(token, secret);
        if (typeof decoded === 'string') {
            res.status(401).json({ message: 'Invalid authentication token.' });
            return;
        }
        const payload = decoded;
        if (typeof payload.sub !== 'string' ||
            typeof payload.userId !== 'string' ||
            typeof payload.role !== 'string' ||
            !ALLOWED_ROLES.includes(payload.role)) {
            res.status(401).json({
                message: 'Invalid authentication token or role.',
            });
            return;
        }
        authReq.user = {
            id: payload.sub,
            userId: payload.userId,
            role: payload.role,
        };
        next();
    }
    catch {
        res.status(401).json({
            message: 'Invalid or expired token. Please log in again.',
        });
    }
}
export function allowRoles(...roles) {
    return (req, res, next) => {
        const user = req.user;
        if (!user) {
            res.status(401).json({ message: 'Authentication required.' });
            return;
        }
        if (!roles.includes(user.role)) {
            console.warn('TRA Invest access denied:', {
                method: req.method,
                path: req.originalUrl,
                actualRole: user.role,
                allowedRoles: roles,
            });
            res.status(403).json({
                message: 'You are not authorized to perform this action.',
            });
            return;
        }
        next();
    };
}
