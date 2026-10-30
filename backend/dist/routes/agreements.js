import { Router, } from 'express';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const router = Router();
function notifyAgreementUpdate(req, event) {
    const io = req.app.get('io');
    if (!io) {
        console.warn('Socket.IO is unavailable. Automatic polling should provide the fallback.');
        return;
    }
    io.emit('agreements:updated', {
        event,
        updatedAt: new Date().toISOString(),
    });
}
/* ---------- Database ---------- */
let pool = null;
function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'tra_invest',
            waitForConnections: true,
            connectionLimit: 10,
            decimalNumbers: true,
            dateStrings: true,
        });
    }
    return pool;
}
/* ---------- Authentication ---------- */
async function authenticate(req, res, next) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ')
        ? header.slice(7)
        : '';
    if (!token || !process.env.JWT_SECRET) {
        res.status(401).json({
            message: 'Authentication required. Please sign in.',
        });
        return;
    }
    let payload;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (typeof decoded === 'string') {
            res.status(401).json({
                message: 'Invalid session token.',
            });
            return;
        }
        payload = decoded;
    }
    catch {
        res.status(401).json({
            message: 'Your session has expired. Please sign in again.',
        });
        return;
    }
    const key = String(payload.id ?? payload.sub ?? payload.userId ?? '');
    if (!key) {
        res.status(401).json({
            message: 'The session does not contain a user identifier.',
        });
        return;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    const column = isUuid ? 'id' : 'user_id';
    try {
        const [rows] = await getPool().query(`SELECT id, user_id, role, status
         FROM users
        WHERE ${column} = ?
        LIMIT 1`, [key]);
        const user = rows[0];
        if (!user) {
            res.status(401).json({
                message: 'The account associated with this session was not found. Sign in again.',
            });
            return;
        }
        if (user.status !== 'ACTIVE') {
            res.status(403).json({
                message: `Your account status is ${user.status}. Contact your administrator if you believe this is incorrect.`,
            });
            return;
        }
        req.actor = {
            id: String(user.id),
            role: user.role,
        };
        next();
    }
    catch (error) {
        console.error('Agreement authentication failed:', error);
        res.status(500).json({
            message: 'Unable to verify your account. Please try again.',
        });
    }
}
function requireRole(...allowed) {
    return (req, res, next) => {
        if (!req.actor || !allowed.includes(req.actor.role)) {
            res.status(403).json({
                message: 'You do not have permission to perform this action.',
            });
            return;
        }
        next();
    };
}
/* ---------- Validation ---------- */
function isRealDate(value) {
    const date = new Date(`${value}T00:00:00Z`);
    return (!Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value);
}
const dateField = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
    .refine(isRealDate, 'Enter a valid date.');
const createSchema = z
    .object({
    customerId: z.string().uuid('Select a valid customer.'),
    principalAmount: z
        .number()
        .positive('Principal amount must be greater than zero.')
        .max(9999999999999.99, 'Principal amount is too large.'),
    interestRate: z
        .number()
        .positive('Interest rate must be greater than zero.')
        .max(100, 'Interest rate cannot exceed 100%.'),
    startDate: dateField,
    endDate: dateField,
    submitForApproval: z.boolean().default(false),
})
    .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after the start date.',
    path: ['endDate'],
});
const reviewSchema = z.object({
    action: z.enum(['APPROVE', 'REJECT', 'SEND_BACK']),
    remarks: z.string().trim().max(2000).optional().default(''),
});
/* ---------- Helpers ---------- */
function mapAgreement(row) {
    return {
        id: Number(row.id),
        agreementNumber: String(row.agreement_number),
        customerName: String(row.customer_name),
        customerUserId: String(row.customer_user_id),
        createdByName: String(row.created_by_name),
        principalAmount: Number(row.principal_amount),
        interestRate: Number(row.interest_rate),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        status: String(row.status),
        managerRemarks: row.manager_remarks ?? null,
    };
}
const agreementSelect = `
  SELECT a.id, a.agreement_number, a.principal_amount, a.interest_rate,
         a.start_date, a.end_date, a.status, a.manager_remarks,
         c.full_name AS customer_name,
         c.user_id AS customer_user_id,
         s.full_name AS created_by_name
    FROM investment_agreements a
    JOIN users c ON c.id = a.customer_id
    JOIN users s ON s.id = a.created_by
`;
/* ---------- Active customer dropdown ---------- */
router.get('/customers', authenticate, requireRole('SALES_EXECUTIVE', 'ADMIN', 'MANAGER'), async (_req, res) => {
    try {
        const [rows] = await getPool().query(`SELECT id, user_id, full_name, email
           FROM users
          WHERE role = 'CUSTOMER'
            AND status = 'ACTIVE'
          ORDER BY full_name ASC
          LIMIT 500`);
        res.json({
            customers: rows.map((row) => ({
                id: String(row.id),
                userId: String(row.user_id),
                fullName: String(row.full_name),
                email: String(row.email),
            })),
        });
    }
    catch (error) {
        console.error('Load customers failed:', error);
        res.status(500).json({
            message: 'Unable to load customers.',
        });
    }
});
/* ---------- List agreements ---------- */
router.get('/', authenticate, async (req, res) => {
    try {
        const actor = req.actor;
        let where = '';
        const params = [];
        if (actor.role === 'SALES_EXECUTIVE') {
            where = 'WHERE a.created_by = ?';
            params.push(actor.id);
        }
        else if (actor.role === 'CUSTOMER') {
            where = "WHERE a.customer_id = ? AND a.status = 'APPROVED'";
            params.push(actor.id);
        }
        const [rows] = await getPool().query(`${agreementSelect}
          ${where}
          ORDER BY a.created_at DESC
          LIMIT 200`, params);
        res.json({ agreements: rows.map(mapAgreement) });
    }
    catch (error) {
        console.error('List agreements failed:', error);
        res.status(500).json({
            message: 'Unable to load agreements.',
        });
    }
});
/* ---------- Create agreement ---------- */
router.post('/', authenticate, requireRole('SALES_EXECUTIVE', 'ADMIN'), async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            message: 'Please check the agreement details.',
            errors: z.flattenError(parsed.error).fieldErrors,
        });
        return;
    }
    const data = parsed.data;
    const actor = req.actor;
    const status = data.submitForApproval
        ? 'PENDING_APPROVAL'
        : 'DRAFT';
    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();
        const [customers] = await connection.query(`SELECT id
           FROM users
          WHERE id = ?
            AND role = 'CUSTOMER'
            AND status = 'ACTIVE'
          LIMIT 1`, [data.customerId]);
        if (customers.length === 0) {
            await connection.rollback();
            res.status(400).json({
                message: 'Selected customer was not found or is inactive.',
            });
            return;
        }
        const [inserted] = await connection.query(`INSERT INTO investment_agreements
          (agreement_number, customer_id, created_by,
           principal_amount, interest_rate, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            `TMP-${randomUUID()}`,
            data.customerId,
            actor.id,
            Math.round(data.principalAmount * 100) / 100,
            Math.round(data.interestRate * 10000) / 10000,
            data.startDate,
            data.endDate,
            status,
        ]);
        const agreementNumber = `TRA-AGR-${new Date().getFullYear()}-` +
            String(inserted.insertId).padStart(6, '0');
        await connection.query(`UPDATE investment_agreements
            SET agreement_number = ?
          WHERE id = ?`, [agreementNumber, inserted.insertId]);
        await connection.commit();
        notifyAgreementUpdate(req, 'created');
        res.status(201).json({
            message: data.submitForApproval
                ? `Agreement ${agreementNumber} submitted for manager approval.`
                : `Agreement ${agreementNumber} saved as a draft.`,
            agreement: {
                id: inserted.insertId,
                agreementNumber,
                status,
            },
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch (rollbackError) {
            console.error('Agreement rollback failed:', rollbackError);
        }
        console.error('Create agreement failed:', error);
        res.status(500).json({
            message: 'Unable to create the agreement.',
        });
    }
    finally {
        connection.release();
    }
});
/* ---------- Submit draft / sent-back agreement ---------- */
router.patch('/:id/submit', authenticate, requireRole('SALES_EXECUTIVE', 'ADMIN'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ message: 'Invalid agreement ID.' });
        return;
    }
    try {
        const [result] = await getPool().query(`UPDATE investment_agreements
            SET status = 'PENDING_APPROVAL'
          WHERE id = ?
            AND created_by = ?
            AND status IN ('DRAFT', 'SENT_BACK')`, [id, req.actor.id]);
        if (result.affectedRows === 0) {
            res.status(409).json({
                message: 'Only your own draft or sent-back agreements can be submitted.',
            });
            return;
        }
        notifyAgreementUpdate(req, 'submitted');
        res.json({
            message: 'Agreement submitted for manager approval.',
        });
    }
    catch (error) {
        console.error('Submit agreement failed:', error);
        res.status(500).json({
            message: 'Unable to submit the agreement.',
        });
    }
});
/* ---------- Manager pending approvals ---------- */
router.get('/pending', authenticate, requireRole('MANAGER', 'ADMIN'), async (_req, res) => {
    try {
        const [rows] = await getPool().query(`${agreementSelect}
          WHERE a.status = 'PENDING_APPROVAL'
          ORDER BY a.created_at ASC
          LIMIT 200`);
        res.json({ agreements: rows.map(mapAgreement) });
    }
    catch (error) {
        console.error('Load pending agreements failed:', error);
        res.status(500).json({
            message: 'Unable to load pending agreements.',
        });
    }
});
/* ---------- Manager review ---------- */
router.patch('/:id/review', authenticate, requireRole('MANAGER'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ message: 'Invalid agreement ID.' });
        return;
    }
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            message: 'Choose a valid review action and provide valid remarks.',
        });
        return;
    }
    const { action, remarks } = parsed.data;
    const statusByAction = {
        APPROVE: 'APPROVED',
        REJECT: 'REJECTED',
        SEND_BACK: 'SENT_BACK',
    };
    const newStatus = statusByAction[action];
    const reviewerId = req.actor.id;
    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.query(`UPDATE investment_agreements
            SET status = ?,
                manager_remarks = ?,
                reviewed_by = ?,
                reviewed_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'PENDING_APPROVAL'`, [newStatus, remarks || null, reviewerId, id]);
        if (result.affectedRows === 0) {
            await connection.rollback();
            res.status(409).json({
                message: 'This agreement is not pending approval or has already been reviewed.',
            });
            return;
        }
        await connection.query(`INSERT INTO agreement_approval_history
          (agreement_id, reviewed_by, action, remarks, reviewed_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [id, reviewerId, action, remarks || null]);
        await connection.commit();
        notifyAgreementUpdate(req, 'reviewed');
        res.json({
            message: action === 'SEND_BACK'
                ? 'Agreement sent back for correction.'
                : `Agreement ${action.toLowerCase()}d successfully.`,
            agreement: {
                id,
                status: newStatus,
                managerRemarks: remarks || null,
                reviewedBy: reviewerId,
            },
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch (rollbackError) {
            console.error('Review rollback failed:', rollbackError);
        }
        console.error('Review agreement failed:', error);
        res.status(500).json({
            message: 'Unable to review the agreement.',
        });
    }
    finally {
        connection.release();
    }
});
export default router;
