import { Router } from 'express';
import { pool } from '../db/pool.js';
import { authenticate, } from '../middleware/authenticate.js';
const dashboardRouter = Router();
function sendError(res, error) {
    console.error('Dashboard statistics error:', error);
    res.status(500).json({
        message: 'Unable to load dashboard statistics.',
    });
}
dashboardRouter.get('/stats', authenticate, async (req, res) => {
    const authReq = req;
    const user = authReq.user;
    if (!user?.userId || !user.role) {
        res.status(401).json({
            message: 'Authentication required.',
        });
        return;
    }
    const role = user.role.toUpperCase();
    const allowedRoles = [
        'ADMIN',
        'MANAGER',
        'SALES_EXECUTIVE',
        'CUSTOMER',
    ];
    if (!allowedRoles.includes(role)) {
        res.status(403).json({
            message: 'Unsupported dashboard role.',
        });
        return;
    }
    try {
        const [userRows] = await pool.execute(`SELECT id, role
         FROM users
         WHERE user_id = ?
         LIMIT 1`, [user.userId]);
        const dbUser = userRows[0];
        if (!dbUser || dbUser.role !== role) {
            res.status(401).json({
                message: 'The authenticated account could not be verified.',
            });
            return;
        }
        const dbUserId = dbUser.id;
        let stats;
        if (role === 'ADMIN') {
            const [rows] = await pool.query(`
          SELECT
            (SELECT COUNT(*) FROM users)
              AS totalUsers,

            (SELECT COUNT(*) FROM users
             WHERE role = 'CUSTOMER')
              AS totalCustomers,

            (SELECT COUNT(*) FROM users
             WHERE role IN ('MANAGER', 'SALES_EXECUTIVE'))
              AS totalStaff,

            (SELECT COUNT(*) FROM investment_agreements)
              AS totalAgreements,

            (SELECT COUNT(*) FROM investment_agreements
             WHERE status = 'PENDING_APPROVAL')
              AS pendingApprovals,

            (SELECT COUNT(*) FROM investment_agreements
             WHERE status = 'APPROVED')
              AS approvedAgreements,

            (SELECT COUNT(*) FROM investment_agreements
             WHERE status = 'REJECTED')
              AS rejectedAgreements,

            (SELECT COALESCE(SUM(principal_amount), 0)
             FROM investment_agreements
             WHERE status = 'APPROVED')
              AS approvedPrincipal
        `);
            stats = rows[0];
        }
        else if (role === 'MANAGER') {
            const [rows] = await pool.query(`
          SELECT
            (SELECT COUNT(*) FROM users
             WHERE role = 'CUSTOMER')
              AS totalCustomers,

            COUNT(*) AS totalAgreements,

            COALESCE(SUM(status = 'PENDING_APPROVAL'), 0)
              AS pendingApprovals,

            COALESCE(SUM(status = 'APPROVED'), 0)
              AS activeAgreements,

            COALESCE(SUM(status = 'REJECTED'), 0)
              AS rejectedAgreements,

            COALESCE(SUM(status = 'SENT_BACK'), 0)
              AS sentBackAgreements,

            COALESCE(SUM(status = 'DRAFT'), 0)
              AS draftAgreements,

            COALESCE(
              SUM(
                CASE WHEN status = 'APPROVED'
                THEN principal_amount ELSE 0 END
              ), 0
            ) AS approvedPrincipal

          FROM investment_agreements
        `);
            stats = rows[0];
        }
        else if (role === 'SALES_EXECUTIVE') {
            const [rows] = await pool.execute(`
            SELECT
              COUNT(DISTINCT customer_id)
                AS customersWithAgreements,

              COUNT(*) AS totalAgreements,

              COALESCE(SUM(status = 'PENDING_APPROVAL'), 0)
                AS pendingApprovals,

              COALESCE(SUM(status = 'APPROVED'), 0)
                AS approvedAgreements,

              COALESCE(SUM(status = 'REJECTED'), 0)
                AS rejectedAgreements,

              COALESCE(SUM(status = 'SENT_BACK'), 0)
                AS sentBackAgreements,

              COALESCE(
                SUM(
                  CASE WHEN status = 'APPROVED'
                  THEN principal_amount ELSE 0 END
                ), 0
              ) AS approvedPrincipal

            FROM investment_agreements
            WHERE created_by = ?
          `, [dbUserId]);
            stats = rows[0];
        }
        else {
            const [rows] = await pool.execute(`
            SELECT
              COUNT(*) AS totalAgreements,

              COALESCE(SUM(status = 'APPROVED'), 0)
                AS activeAgreements,

              COALESCE(SUM(status = 'PENDING_APPROVAL'), 0)
                AS pendingAgreements,

              COALESCE(SUM(status = 'REJECTED'), 0)
                AS rejectedAgreements,

              COALESCE(SUM(status = 'SENT_BACK'), 0)
                AS sentBackAgreements,

              COALESCE(
                SUM(
                  CASE WHEN status = 'APPROVED'
                  THEN principal_amount ELSE 0 END
                ), 0
              ) AS approvedPrincipal

            FROM investment_agreements
            WHERE customer_id = ?
          `, [dbUserId]);
            stats = rows[0];
        }
        res.status(200).json({
            role,
            stats,
        });
    }
    catch (error) {
        sendError(res, error);
    }
});
export default dashboardRouter;
