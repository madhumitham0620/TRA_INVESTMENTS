import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db/pool.js';
export const profileRouter = Router();
function authenticate(req, res, next) {
    const authorization = req.headers.authorization;
    const secret = process.env.JWT_SECRET;
    if (!authorization?.startsWith('Bearer ')) {
        res.status(401).json({ message: 'Authentication required.' });
        return;
    }
    if (!secret || secret.length < 32) {
        res.status(500).json({ message: 'Server authentication is not configured.' });
        return;
    }
    try {
        const decoded = jwt.verify(authorization.slice(7), secret);
        if (typeof decoded !== 'object' ||
            decoded === null ||
            typeof decoded.sub !== 'string') {
            res.status(401).json({ message: 'Invalid authentication token.' });
            return;
        }
        req.user = {
            id: decoded.sub,
            role: typeof decoded.role === 'string' ? decoded.role : '',
        };
        next();
    }
    catch {
        res.status(401).json({
            message: 'Your session has expired. Please sign in again.',
        });
    }
}
const profileSchema = z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
});
const passwordSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string()
        .min(12)
        .max(128)
        .regex(/[a-z]/, 'Password needs a lowercase letter.')
        .regex(/[A-Z]/, 'Password needs an uppercase letter.')
        .regex(/[0-9]/, 'Password needs a number.')
        .regex(/[^A-Za-z0-9]/, 'Password needs a special character.'),
    confirmPassword: z.string().min(1).max(128),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match.',
    path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current password.',
    path: ['newPassword'],
});
// GET /api/profile
// Retrieve the signed-in user's profile.
profileRouter.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(`SELECT
           id,
           user_id AS userId,
           full_name AS fullName,
           email,
           role,
           status,
           must_change_password AS mustChangePassword
         FROM users
         WHERE id = ?
         LIMIT 1`, [userId]);
        const users = rows;
        if (!users.length) {
            res.status(404).json({ message: 'User profile not found.' });
            return;
        }
        const user = users[0];
        res.status(200).json({
            message: 'Profile retrieved successfully.',
            user: {
                ...user,
                mustChangePassword: Boolean(user.mustChangePassword),
            },
        });
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Unable to retrieve your profile.' });
    }
});
// PATCH /api/profile
// Update the signed-in user's editable profile information.
profileRouter.patch('/', authenticate, async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            message: 'Please enter valid profile details.',
            errors: parsed.error.flatten().fieldErrors,
        });
        return;
    }
    try {
        const userId = req.user.id;
        const { fullName, email } = parsed.data;
        const [result] = await pool.execute(`UPDATE users
         SET full_name = ?, email = ?
         WHERE id = ?`, [fullName, email, userId]);
        const updateResult = result;
        if (updateResult.affectedRows === 0) {
            const [rows] = await pool.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
            if (!rows.length) {
                res.status(404).json({ message: 'User profile not found.' });
                return;
            }
        }
        const [rows] = await pool.execute(`SELECT
           id,
           user_id AS userId,
           full_name AS fullName,
           email,
           role,
           status
         FROM users
         WHERE id = ?
         LIMIT 1`, [userId]);
        const users = rows;
        res.status(200).json({
            message: 'Profile updated successfully.',
            user: users[0],
        });
    }
    catch (error) {
        const err = error;
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(409).json({
                message: 'This email address is already used by another account.',
            });
            return;
        }
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Unable to update your profile.' });
    }
});
// POST /api/profile/change-password
// Verify the old password before saving a new password.
profileRouter.post('/change-password', authenticate, async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            message: 'Please correct the password details.',
            errors: parsed.error.flatten().fieldErrors,
        });
        return;
    }
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(`SELECT password_hash AS passwordHash
         FROM users
         WHERE id = ?
         LIMIT 1`, [userId]);
        const users = rows;
        if (!users.length) {
            res.status(404).json({ message: 'User account not found.' });
            return;
        }
        const currentPasswordMatches = await bcrypt.compare(parsed.data.currentPassword, users[0].passwordHash);
        if (!currentPasswordMatches) {
            res.status(400).json({
                message: 'Your current password is incorrect.',
            });
            return;
        }
        const newPasswordHash = await bcrypt.hash(parsed.data.newPassword, 12);
        await pool.execute(`UPDATE users
         SET password_hash = ?,
             must_change_password = 0
         WHERE id = ?`, [newPasswordHash, userId]);
        res.status(200).json({
            message: 'Password changed successfully. Please sign in again.',
            requireLogin: true,
        });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            message: 'Unable to change your password.',
        });
    }
});
