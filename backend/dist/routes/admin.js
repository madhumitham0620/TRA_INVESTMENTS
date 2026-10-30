import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { authenticate } from '../middleware/authenticate.js';
export const adminRouter = Router();
const staffRoles = ['MANAGER', 'SALES_EXECUTIVE'];
const createStaffSchema = z.object({
    userId: z
        .string()
        .trim()
        .min(3)
        .max(40)
        .regex(/^[A-Za-z0-9_-]+$/),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: z
        .string()
        .min(12)
        .max(128)
        .regex(/[a-z]/)
        .regex(/[A-Z]/)
        .regex(/[0-9]/)
        .regex(/[^A-Za-z0-9]/),
    role: z.enum(staffRoles),
});
const createCustomerSchema = z.object({
    userId: z
        .string()
        .trim()
        .min(3)
        .max(40)
        .regex(/^[A-Za-z0-9_-]+$/),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: z
        .string()
        .min(12)
        .max(128)
        .regex(/[a-z]/)
        .regex(/[A-Z]/)
        .regex(/[0-9]/)
        .regex(/[^A-Za-z0-9]/),
});
const assignCustomerSchema = z.object({
    assignedSalesExecutiveId: z.string().uuid().nullable(),
});
function requireAdmin(req, res) {
    if (!req.user) {
        res.status(401).json({
            message: 'Authentication required.',
        });
        return false;
    }
    if (req.user.role !== 'ADMIN') {
        res.status(403).json({
            message: 'Admin access required.',
        });
        return false;
    }
    return true;
}
// GET /api/admin/users
// Admin can view users and select active Sales Executives.
adminRouter.get('/users', authenticate, async (req, res) => {
    if (!requireAdmin(req, res))
        return;
    try {
        const [rows] = await pool.execute(`SELECT
           id,
           user_id AS userId,
           full_name AS fullName,
           email,
           role,
           status
         FROM users
         WHERE role IN (
           'ADMIN',
           'MANAGER',
           'SALES_EXECUTIVE',
           'CUSTOMER'
         )
         ORDER BY full_name ASC`);
        return res.status(200).json({
            users: rows,
        });
    }
    catch (error) {
        console.error('Failed to load users:', error);
        return res.status(500).json({
            message: 'Unable to load users from the database.',
        });
    }
});
// POST /api/admin/users
// Admin can create Manager and Sales Executive accounts.
adminRouter.post('/users', authenticate, async (req, res) => {
    if (!requireAdmin(req, res))
        return;
    const parsed = createStaffSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            message: 'Invalid staff account details.',
            errors: parsed.error.flatten().fieldErrors,
        });
    }
    const { userId, fullName, email, password, role } = parsed.data;
    try {
        const [existing] = await pool.execute(`SELECT id
         FROM users
         WHERE user_id = ? OR email = ?
         LIMIT 1`, [userId, email]);
        if (existing.length > 0) {
            return res.status(409).json({
                message: 'That User ID or email address is already registered.',
            });
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const id = randomUUID();
        await pool.execute(`INSERT INTO users (
           id,
           user_id,
           full_name,
           email,
           password_hash,
           role,
           status,
           must_change_password,
           created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?)`, [
            id,
            userId,
            fullName,
            email,
            passwordHash,
            role,
            req.user.id,
        ]);
        return res.status(201).json({
            message: 'Staff account created successfully.',
            user: {
                id,
                userId,
                fullName,
                email,
                role,
                status: 'ACTIVE',
            },
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'That User ID or email address is already registered.',
            });
        }
        console.error('Failed to create staff account:', error);
        return res.status(500).json({
            message: 'Unable to create the staff account.',
        });
    }
});
// POST /api/admin/customers
// Admin and Sales Executives can create customer accounts.
// Customers created by a Sales Executive are assigned to that executive.
adminRouter.post('/customers', authenticate, async (req, res) => {
    if (!req.user) {
        return res.status(401).json({
            message: 'Authentication required.',
        });
    }
    if (!['ADMIN', 'SALES_EXECUTIVE'].includes(req.user.role)) {
        return res.status(403).json({
            message: 'Only Admins and Sales Executives can create customers.',
        });
    }
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            message: 'Invalid customer details.',
            errors: parsed.error.flatten().fieldErrors,
        });
    }
    const { userId, fullName, email, password } = parsed.data;
    try {
        const [existing] = await pool.execute(`SELECT id
         FROM users
         WHERE user_id = ? OR email = ?
         LIMIT 1`, [userId, email]);
        if (existing.length > 0) {
            return res.status(409).json({
                message: 'That User ID or email address is already registered.',
            });
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const id = randomUUID();
        const salesExecutiveId = req.user.role === 'SALES_EXECUTIVE'
            ? req.user.id
            : null;
        await pool.execute(`INSERT INTO users (
           id,
           user_id,
           full_name,
           email,
           password_hash,
           role,
           status,
           must_change_password,
           created_by,
           assigned_sales_executive_id
         )
         VALUES (?, ?, ?, ?, ?, 'CUSTOMER', 'ACTIVE', 0, ?, ?)`, [
            id,
            userId,
            fullName,
            email,
            passwordHash,
            req.user.id,
            salesExecutiveId,
        ]);
        return res.status(201).json({
            message: 'Customer account created successfully.',
            user: {
                id,
                userId,
                fullName,
                email,
                role: 'CUSTOMER',
                status: 'ACTIVE',
                assignedSalesExecutiveId: salesExecutiveId,
            },
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'That User ID or email address is already registered.',
            });
        }
        console.error('Failed to create customer:', error);
        return res.status(500).json({
            message: 'Unable to create the customer account.',
        });
    }
});
// PUT /api/admin/customers/:customerId/assign
// Admin can assign customers created by Admin or other eligible users.
// Admin cannot assign, reassign, or unassign customers created by Sales Executives.
adminRouter.put('/customers/:customerId/assign', authenticate, async (req, res) => {
    if (!requireAdmin(req, res))
        return;
    const customerId = req.params.customerId;
    if (!z.string().uuid().safeParse(customerId).success) {
        return res.status(400).json({
            message: 'Invalid customer ID.',
        });
    }
    const parsed = assignCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            message: 'Choose a valid Sales Executive or Unassigned.',
            errors: parsed.error.flatten().fieldErrors,
        });
    }
    const { assignedSalesExecutiveId } = parsed.data;
    try {
        // Find the customer and the role of its creator.
        const [customerRows] = await pool.execute(`SELECT
             customer.id,
             creator.role AS creator_role
           FROM users AS customer
           LEFT JOIN users AS creator
             ON creator.id = customer.created_by
           WHERE customer.id = ?
             AND customer.role = 'CUSTOMER'
           LIMIT 1`, [customerId]);
        if (customerRows.length === 0) {
            return res.status(404).json({
                message: 'Customer not found.',
            });
        }
        // Block all assignment changes for Sales Executive-created customers.
        if (customerRows[0].creator_role === 'SALES_EXECUTIVE') {
            return res.status(403).json({
                message: 'Customers created by Sales Executives cannot be reassigned by Admin.',
            });
        }
        // Validate the selected Sales Executive, if one was selected.
        if (assignedSalesExecutiveId) {
            const [staffRows] = await pool.execute(`SELECT id
             FROM users
             WHERE id = ?
               AND role = 'SALES_EXECUTIVE'
               AND status = 'ACTIVE'
             LIMIT 1`, [assignedSalesExecutiveId]);
            if (staffRows.length === 0) {
                return res.status(400).json({
                    message: 'The selected Sales Executive does not exist or is not active.',
                });
            }
        }
        await pool.execute(`UPDATE users
         SET assigned_sales_executive_id = ?
         WHERE id = ?
           AND role = 'CUSTOMER'`, [assignedSalesExecutiveId, customerId]);
        return res.status(200).json({
            message: assignedSalesExecutiveId
                ? 'Customer assigned successfully.'
                : 'Customer is now unassigned.',
            customerId,
            assignedSalesExecutiveId,
        });
    }
    catch (error) {
        console.error('Failed to assign customer:', error);
        return res.status(500).json({
            message: 'Unable to update customer assignment.',
        });
    }
});
