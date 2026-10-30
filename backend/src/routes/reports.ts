
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool.js';

const router = Router();

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES_EXECUTIVE'
  | 'CUSTOMER';

interface AuthRequest extends Request {
  actor?: {
    id: string;
    role: UserRole;
  };
}

const VALID_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'SALES_EXECUTIVE',
  'CUSTOMER',
];

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = req.headers.authorization || '';

  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  const jwtSecret = process.env.JWT_SECRET;

  if (!token || !jwtSecret) {
    res.status(401).json({
      message: 'Authentication required.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    if (typeof decoded === 'string') {
      res.status(401).json({
        message: 'Invalid authentication token.',
      });
      return;
    }

    const payload = decoded as JwtPayload;

    const identifier = String(
      payload.id ??
      payload.sub ??
      payload.userId ??
      '',
    );

    if (!identifier) {
      res.status(401).json({
        message: 'Invalid user identifier.',
      });
      return;
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(identifier);

    const [users] = await pool.query<RowDataPacket[]>(
      `SELECT id, role, status
       FROM users
       WHERE ${isUuid ? 'id' : 'user_id'} = ?
       LIMIT 1`,
      [identifier],
    );

    const user = users[0];

    if (!user || user.status !== 'ACTIVE') {
      res.status(401).json({
        message: 'Active user account required.',
      });
      return;
    }

    if (!VALID_ROLES.includes(user.role as UserRole)) {
      res.status(403).json({
        message: 'Invalid user role.',
      });
      return;
    }

    req.actor = {
      id: String(user.id),
      role: user.role as UserRole,
    };

    next();
  } catch (error) {
    console.error('Reports authentication error:', error);

    res.status(401).json({
      message: 'Invalid or expired authentication token.',
    });
  }
}

// --------------------------------------------------
// ROLE-BASED REPORT PERMISSIONS
// --------------------------------------------------

function getAllowedReports(role: UserRole): string[] {
  const permissions: Record<UserRole, string[]> = {
    ADMIN: [
      'customers',
      'staff',
      'agreements',
      'investments',
      'interest',
      'withdrawals',
      'payments',
      'performance',
      'audit',
    ],

    MANAGER: [
      'customers',
      'agreements',
      'investments',
      'interest',
      'withdrawals',
      'payments',
      'performance',
    ],

    SALES_EXECUTIVE: [
      'customers',
      'agreements',
      'investments',
      'interest',
      'withdrawals',
      'payments',
      'performance',
    ],

    CUSTOMER: [
      'investments',
      'agreements',
      'interest',
      'withdrawals',
      'payments',
    ],
  };

  return permissions[role];
}

// --------------------------------------------------
// DATE FILTER
// --------------------------------------------------

function addDateFilter(
  from: string,
  to: string,
  column: string,
  params: unknown[],
): string {
  let condition = '';

  if (from) {
    condition += ` AND DATE(${column}) >= ?`;
    params.push(from);
  }

  if (to) {
    condition += ` AND DATE(${column}) <= ?`;
    params.push(to);
  }

  return condition;
}

// --------------------------------------------------
// REPORT API
// GET /api/reports
// --------------------------------------------------

router.get(
  '/',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const actor = req.actor!;

    const type = String(req.query.type || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const status = String(req.query.status || '');
    const search = String(req.query.search || '').trim();

    if (!getAllowedReports(actor.role).includes(type)) {
      res.status(403).json({
        message: 'You do not have permission to access this report.',
      });
      return;
    }

    const validDate = /^\d{4}-\d{2}-\d{2}$/;

    if (
      (from && !validDate.test(from)) ||
      (to && !validDate.test(to))
    ) {
      res.status(400).json({
        message: 'Invalid date format. Use YYYY-MM-DD.',
      });
      return;
    }

    if (from && to && from > to) {
      res.status(400).json({
        message: 'Start date cannot be after end date.',
      });
      return;
    }

    try {
      let sql = '';
      const params: unknown[] = [];

      switch (type) {

        // --------------------------------------------------
        // CUSTOMER REPORT
        // --------------------------------------------------

        case 'customers': {
          sql = `
            SELECT
              c.id,
              c.user_id AS userId,
              c.full_name AS fullName,
              c.email,
              c.status,
              c.created_at AS createdAt,
              s.full_name AS salesExecutive,
              COUNT(DISTINCT a.id) AS agreementCount,
              COALESCE(
                SUM(
                  CASE
                    WHEN a.status = 'APPROVED'
                    THEN a.principal_amount
                    ELSE 0
                  END
                ),
                0
              ) AS approvedPrincipal
            FROM users c
            LEFT JOIN users s
              ON s.id = c.assigned_sales_executive_id
            LEFT JOIN investment_agreements a
              ON a.customer_id = c.id
            WHERE c.role = 'CUSTOMER'
          `;

          if (actor.role === 'SALES_EXECUTIVE') {
            sql += ' AND c.assigned_sales_executive_id = ?';
            params.push(actor.id);
          }

          sql += addDateFilter(from, to, 'c.created_at', params);

          if (status) {
            sql += ' AND c.status = ?';
            params.push(status);
          }

          if (search) {
            sql += `
              AND (
                c.full_name LIKE ?
                OR c.user_id LIKE ?
                OR c.email LIKE ?
              )
            `;

            params.push(
              `%${search}%`,
              `%${search}%`,
              `%${search}%`,
            );
          }

          sql += `
            GROUP BY
              c.id,
              c.user_id,
              c.full_name,
              c.email,
              c.status,
              c.created_at,
              s.full_name
            ORDER BY c.created_at DESC
            LIMIT 1000
          `;

          break;
        }

        // --------------------------------------------------
        // STAFF REPORT
        // --------------------------------------------------

        case 'staff': {
          if (actor.role !== 'ADMIN') {
            res.status(403).json({
              message: 'Admin access required.',
            });
            return;
          }

          sql = `
            SELECT
              u.id,
              u.user_id AS userId,
              u.full_name AS fullName,
              u.email,
              u.role,
              u.status,
              u.created_at AS createdAt,
              COUNT(DISTINCT a.id) AS agreementsCreated,
              COUNT(DISTINCT c.id) AS assignedCustomers
            FROM users u
            LEFT JOIN investment_agreements a
              ON a.created_by = u.id
            LEFT JOIN users c
              ON c.assigned_sales_executive_id = u.id
              AND c.role = 'CUSTOMER'
            WHERE u.role IN (
              'ADMIN',
              'MANAGER',
              'SALES_EXECUTIVE'
            )
          `;

          sql += addDateFilter(from, to, 'u.created_at', params);

          if (status) {
            sql += ' AND u.status = ?';
            params.push(status);
          }

          if (search) {
            sql += `
              AND (
                u.full_name LIKE ?
                OR u.user_id LIKE ?
                OR u.email LIKE ?
              )
            `;

            params.push(
              `%${search}%`,
              `%${search}%`,
              `%${search}%`,
            );
          }

          sql += `
            GROUP BY
              u.id,
              u.user_id,
              u.full_name,
              u.email,
              u.role,
              u.status,
              u.created_at
            ORDER BY u.created_at DESC
            LIMIT 1000
          `;

          break;
        }

        // --------------------------------------------------
        // AGREEMENT / INVESTMENT / INTEREST REPORTS
        // --------------------------------------------------

        case 'agreements':
        case 'investments':
        case 'interest': {
          sql = `
            SELECT
              a.id,
              a.agreement_number AS agreementNumber,
              a.principal_amount AS principalAmount,
              a.interest_rate AS interestRate,
              a.start_date AS startDate,
              a.end_date AS endDate,
              a.status,
              a.manager_remarks AS managerRemarks,
              a.created_at AS createdAt,
              c.id AS customerId,
              c.full_name AS customerName,
              c.user_id AS customerUserId,
              s.full_name AS createdByName,
              GREATEST(
                0,
                DATEDIFF(
                  LEAST(CURDATE(), a.end_date),
                  a.start_date
                )
              ) AS elapsedDays,
              ROUND(
                a.principal_amount *
                a.interest_rate *
                GREATEST(
                  0,
                  DATEDIFF(
                    LEAST(CURDATE(), a.end_date),
                    a.start_date
                  )
                ) / (365 * 100),
                2
              ) AS estimatedInterest
            FROM investment_agreements a
            JOIN users c
              ON c.id = a.customer_id
            JOIN users s
              ON s.id = a.created_by
            WHERE 1 = 1
          `;

          if (actor.role === 'CUSTOMER') {
            sql += `
              AND a.customer_id = ?
              AND a.status = 'APPROVED'
            `;
            params.push(actor.id);
          }

          if (actor.role === 'SALES_EXECUTIVE') {
            sql += `
              AND (
                a.created_by = ?
                OR c.assigned_sales_executive_id = ?
              )
            `;
            params.push(actor.id, actor.id);
          }

          if (status) {
            sql += ' AND a.status = ?';
            params.push(status);
          }

          sql += addDateFilter(from, to, 'a.created_at', params);

          if (search) {
            sql += `
              AND (
                a.agreement_number LIKE ?
                OR c.full_name LIKE ?
                OR c.user_id LIKE ?
              )
            `;
            params.push(
              `%${search}%`,
              `%${search}%`,
              `%${search}%`,
            );
          }

          sql += `
            ORDER BY a.created_at DESC
            LIMIT 1000
          `;

          break;
        }

        // --------------------------------------------------
        // WITHDRAWAL / PAYMENT REPORTS
        // --------------------------------------------------

        case 'withdrawals':
        case 'payments': {
          sql = `
            SELECT
              w.id,
              w.request_number AS requestNumber,
              w.agreement_id AS agreementId,
              a.agreement_number AS agreementNumber,
              c.full_name AS customerName,
              c.user_id AS customerUserId,
              w.principal,
              w.accrued_interest AS accruedInterest,
              w.total_amount AS totalAmount,
              w.status,
              w.reason,
              w.manager_remarks AS managerRemarks,
              w.payment_reference AS paymentReference,
              w.payment_proof_path AS paymentProofPath,
              w.created_at AS requestedAt,
              w.reviewed_at AS reviewedAt,
              w.paid_at AS paidAt,
              reviewer.full_name AS reviewedByName,
              payer.full_name AS paidByName
            FROM withdrawal_requests w
            LEFT JOIN investment_agreements a
              ON CAST(a.id AS CHAR) = w.agreement_id
            JOIN users c
              ON c.id = w.customer_id
            LEFT JOIN users reviewer
              ON reviewer.id = w.reviewed_by
            LEFT JOIN users payer
              ON payer.id = w.paid_by
            WHERE 1 = 1
          `;

          if (actor.role === 'CUSTOMER') {
            sql += ' AND w.customer_id = ?';
            params.push(actor.id);
          }

          if (actor.role === 'SALES_EXECUTIVE') {
            sql += `
              AND (
                a.created_by = ?
                OR c.assigned_sales_executive_id = ?
              )
            `;
            params.push(actor.id, actor.id);
          }

          if (type === 'payments') {
            sql += " AND w.status IN ('PAID', 'CLOSED')";
          }

          if (status) {
            sql += ' AND w.status = ?';
            params.push(status);
          }

          sql += addDateFilter(from, to, 'w.created_at', params);

          if (search) {
            sql += `
              AND (
                w.request_number LIKE ?
                OR a.agreement_number LIKE ?
                OR c.full_name LIKE ?
              )
            `;
            params.push(
              `%${search}%`,
              `%${search}%`,
              `%${search}%`,
            );
          }

          sql += `
            ORDER BY w.created_at DESC
            LIMIT 1000
          `;

          break;
        }

        // --------------------------------------------------
        // PERFORMANCE REPORT
        // --------------------------------------------------

        case 'performance': {
          if (actor.role === 'CUSTOMER') {
            res.status(403).json({
              message: 'Customer performance reports are unavailable.',
            });
            return;
          }

          sql = `
            SELECT
              u.id,
              u.user_id AS userId,
              u.full_name AS fullName,
              u.role,
              u.status,
              COUNT(DISTINCT a.id) AS agreementsCreated,
              COUNT(
                DISTINCT CASE
                  WHEN a.status = 'APPROVED'
                  THEN a.id
                END
              ) AS approvedAgreements,
              COUNT(DISTINCT c.id) AS assignedCustomers,
              COALESCE(
                SUM(
                  CASE
                    WHEN a.status = 'APPROVED'
                    THEN a.principal_amount
                    ELSE 0
                  END
                ),
                0
              ) AS approvedPrincipal
            FROM users u
            LEFT JOIN investment_agreements a
              ON a.created_by = u.id
            LEFT JOIN users c
              ON c.assigned_sales_executive_id = u.id
              AND c.role = 'CUSTOMER'
            WHERE u.role IN (
              'ADMIN',
              'MANAGER',
              'SALES_EXECUTIVE'
            )
          `;

          if (actor.role === 'SALES_EXECUTIVE') {
            sql += ' AND u.id = ?';
            params.push(actor.id);
          }

          sql += addDateFilter(from, to, 'u.created_at', params);

          sql += `
            GROUP BY
              u.id,
              u.user_id,
              u.full_name,
              u.role,
              u.status
            ORDER BY approvedPrincipal DESC
            LIMIT 500
          `;

          break;
        }

        // --------------------------------------------------
        // ADMIN AUDIT REPORT
        // --------------------------------------------------

        case 'audit': {
          if (actor.role !== 'ADMIN') {
            res.status(403).json({
              message: 'Admin access required.',
            });
            return;
          }

          sql = `
            SELECT
              l.id,
              l.action,
              l.details,
              l.created_at AS createdAt,
              actor.full_name AS actorName,
              actor.user_id AS actorUserId
            FROM audit_logs l
            LEFT JOIN users actor
              ON actor.id = l.actor_user_id
            WHERE 1 = 1
          `;

          sql += addDateFilter(
            from,
            to,
            'l.created_at',
            params,
          );

          if (search) {
            sql += `
              AND (
                l.action LIKE ?
                OR actor.full_name LIKE ?
                OR actor.user_id LIKE ?
                OR CAST(l.details AS CHAR) LIKE ?
              )
            `;

            params.push(
              `%${search}%`,
              `%${search}%`,
              `%${search}%`,
              `%${search}%`,
            );
          }

          sql += `
            ORDER BY l.created_at DESC
            LIMIT 1000
          `;

          break;
        }

        default: {
          res.status(400).json({
            message: 'Invalid report type.',
          });
          return;
        }
      }

      // --------------------------------------------------
      // EXECUTE QUERY
      // --------------------------------------------------

      const [rows] = await pool.query<RowDataPacket[]>(
        sql,
        params,
      );

      res.status(200).json({
        success: true,
        type,
        role: actor.role,
        count: rows.length,
        rows,
      });

    } catch (error) {
      console.error(
        `Reports API error (${type}):`,
        error,
      );

      res.status(500).json({
        success: false,
        message: 'Unable to generate this report.',
      });
    }
  },
);

export default router;
