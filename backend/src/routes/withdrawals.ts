
import { randomUUID } from 'node:crypto';
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';

const router = Router();

type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES_EXECUTIVE'
  | 'AUDITOR'
  | 'CUSTOMER';

type WithdrawalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT_BACK'
  | 'PROCESSING'
  | 'PAID'
  | 'CLOSED';

interface AuthUser {
  id: string;
  role: UserRole;
}

interface AuthRequest extends Request {
  user?: AuthUser;
}

interface AgreementRow extends mysql.RowDataPacket {
  id: number;
  agreement_number: string;
  customer_id: string;
  principal_amount: string | number;
  interest_rate: string | number;
  start_date: string | Date;
  end_date: string | Date;
  status: string;
}

const ALL_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'SALES_EXECUTIVE',
  'AUDITOR',
  'CUSTOMER',
];

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'tra_invest',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const authorization = req.headers.authorization;
  const secret = process.env.JWT_SECRET;

  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({
      message: 'Authentication token is required.',
    });
    return;
  }

  if (!secret) {
    res.status(500).json({
      message: 'JWT_SECRET is not configured.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(
      authorization.slice(7),
      secret,
    );

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.role !== 'string' ||
      !ALL_ROLES.includes(decoded.role as UserRole)
    ) {
      res.status(401).json({
        message: 'Invalid authentication token.',
      });
      return;
    }

    req.user = {
      id: decoded.sub,
      role: decoded.role as UserRole,
    };

    next();
  } catch {
    res.status(401).json({
      message: 'Invalid or expired authentication token.',
    });
  }
}

/**
 * Authorization middleware.
 * Logs the exact role and endpoint when access is denied.
 * Does not remove or bypass role restrictions.
 */
function allowRoles(...roles: UserRole[]) {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    const actualRole = req.user?.role;

    if (!actualRole || !roles.includes(actualRole)) {
      console.error('TRA Invest authorization denied:', {
        method: req.method,
        path: req.originalUrl,
        actualRole: actualRole ?? 'MISSING_USER',
        allowedRoles: roles,
        userId: req.user?.id ?? 'MISSING_USER',
      });

      res.status(403).json({
        message: 'You are not authorized to perform this action.',
      });
      return;
    }

    next();
  };
}

function getUser(req: AuthRequest): AuthUser {
  if (!req.user) {
    throw new Error('Authenticated user is missing.');
  }

  return req.user;
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Existing database tables are validated, not recreated.
export async function initializeWithdrawals(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    const [requestTables] = await connection.query<
      mysql.RowDataPacket[]
    >(`SHOW TABLES LIKE 'withdrawal_requests'`);

    const [auditTables] = await connection.query<
      mysql.RowDataPacket[]
    >(`SHOW TABLES LIKE 'withdrawal_audit_logs'`);

    if (
      requestTables.length === 0 ||
      auditTables.length === 0
    ) {
      throw new Error(
        'Required withdrawal tables are missing. ' +
        'Create them using a migration matching the existing schema.',
      );
    }
  } finally {
    connection.release();
  }
}

async function addAudit(
  connection: mysql.PoolConnection,
  withdrawalId: string,
  actorId: string,
  action: string,
  remarks: string,
): Promise<void> {
  await connection.query(
    `INSERT INTO withdrawal_audit_logs
      (withdrawal_id, actor_id, action, remarks)
     VALUES (?, ?, ?, ?)`,
    [withdrawalId, actorId, action, remarks],
  );
}

// =====================================================
// GET /api/withdrawals/eligible-agreements
// Customers can see their eligible agreements.
// Admin can inspect all eligible agreements.
// =====================================================
router.get(
  '/eligible-agreements',
  authenticate,
  allowRoles('CUSTOMER', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const user = getUser(req);

      let sql = `
        SELECT
          a.id,
          a.agreement_number,
          a.customer_id,
          a.principal_amount,
          a.interest_rate,
          a.start_date,
          a.end_date,
          a.status
        FROM investment_agreements a
        WHERE a.status = 'APPROVED'
          AND NOT EXISTS (
            SELECT 1
            FROM withdrawal_requests w
            WHERE w.agreement_id = CAST(a.id AS CHAR)
              AND w.status IN (
                'PENDING',
                'APPROVED',
                'PROCESSING',
                'PAID',
                'CLOSED'
              )
          )
      `;

      const params: string[] = [];

      if (user.role === 'CUSTOMER') {
        sql += ' AND a.customer_id = ?';
        params.push(user.id);
      }

      sql += ' ORDER BY a.agreement_number';

      const [rows] = await pool.query(sql, params);

      res.status(200).json({ agreements: rows });
    } catch (error) {
      console.error('Eligible agreements error:', error);

      res.status(500).json({
        message: 'Unable to retrieve eligible agreements.',
      });
    }
  },
);

// =====================================================
// GET /api/withdrawals
// =====================================================
router.get(
  '/',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = getUser(req);

      let sql = `
        SELECT
          w.id,
          w.request_number,
          w.agreement_id,
          w.customer_id,
          w.requested_by,
          w.principal,
          w.accrued_interest,
          w.total_amount,
          w.bank_account_last4,
          w.reason,
          w.status,
          w.manager_remarks,
          w.reviewed_by,
          w.reviewed_at,
          w.payment_reference,
          w.payment_proof_path,
          w.paid_by,
          w.paid_at,
          w.created_at,
          w.updated_at,
          a.agreement_number
        FROM withdrawal_requests w
        LEFT JOIN investment_agreements a
          ON CAST(a.id AS CHAR) = w.agreement_id
      `;

      const params: string[] = [];

      if (user.role === 'CUSTOMER') {
        sql += ' WHERE w.customer_id = ?';
        params.push(user.id);
      }

      sql += ' ORDER BY w.created_at DESC';

      const [rows] = await pool.query(sql, params);

      res.status(200).json({ withdrawals: rows });
    } catch (error) {
      console.error('Withdrawal list error:', error);

      res.status(500).json({
        message: 'Unable to retrieve withdrawal requests.',
      });
    }
  },
);

// =====================================================
// POST /api/withdrawals
// Customer submits a full-agreement withdrawal request.
// =====================================================
router.post(
  '/',
  authenticate,
  allowRoles('CUSTOMER'),
  async (req: AuthRequest, res: Response) => {
    const user = getUser(req);
    const agreementId = getString(req.body?.agreementId);
    const reason = getString(req.body?.reason);
    const bankAccountLast4 = getString(
      req.body?.bankAccountLast4,
    );

    if (
      !agreementId ||
      !/^\d+$/.test(agreementId) ||
      !reason ||
      !/^\d{4}$/.test(bankAccountLast4)
    ) {
      res.status(400).json({
        message:
          'Provide a valid agreement, reason, and last four bank-account digits.',
      });
      return;
    }

    if (reason.length > 500) {
      res.status(400).json({
        message: 'Reason must not exceed 500 characters.',
      });
      return;
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [agreements] = await connection.query<
        AgreementRow[]
      >(
        `SELECT
           id,
           agreement_number,
           customer_id,
           principal_amount,
           interest_rate,
           start_date,
           end_date,
           status
         FROM investment_agreements
         WHERE id = ?
           AND customer_id = ?
         FOR UPDATE`,
        [agreementId, user.id],
      );

      if (agreements.length === 0) {
        await connection.rollback();

        res.status(404).json({
          message: 'Agreement not found for this customer.',
        });
        return;
      }

      const agreement = agreements[0];

      if (agreement.status !== 'APPROVED') {
        await connection.rollback();

        res.status(400).json({
          message:
            'Only manager-approved agreements are eligible for withdrawal.',
        });
        return;
      }

      const [existing] = await connection.query<
        mysql.RowDataPacket[]
      >(
        `SELECT id
         FROM withdrawal_requests
         WHERE agreement_id = ?
           AND status IN (
             'PENDING',
             'APPROVED',
             'PROCESSING',
             'PAID',
             'CLOSED'
           )
         LIMIT 1`,
        [agreementId],
      );

      if (existing.length > 0) {
        await connection.rollback();

        res.status(409).json({
          message:
            'A withdrawal request already exists for this agreement.',
        });
        return;
      }

      // Simple-interest estimate. Confirm the accounting policy
      // before treating this amount as the final payout.
      const [interestRows] = await connection.query<
        mysql.RowDataPacket[]
      >(
        `SELECT GREATEST(
           0,
           DATEDIFF(
             LEAST(CURDATE(), end_date),
             start_date
           )
         ) AS elapsed_days
         FROM investment_agreements
         WHERE id = ?`,
        [agreementId],
      );

      const principal = Number(agreement.principal_amount);
      const rate = Number(agreement.interest_rate);
      const elapsedDays = Number(
        interestRows[0]?.elapsed_days ?? 0,
      );

      const interest =
        Math.round(
          (principal * rate * elapsedDays) /
            (365 * 100) *
            100,
        ) / 100;

      const totalAmount =
        Math.round((principal + interest) * 100) / 100;

      if (
        !Number.isFinite(principal) ||
        !Number.isFinite(rate) ||
        principal <= 0 ||
        rate < 0 ||
        !Number.isFinite(totalAmount)
      ) {
        await connection.rollback();

        res.status(400).json({
          message:
            'The agreement has an invalid withdrawal balance.',
        });
        return;
      }

      const withdrawalId = randomUUID();

      const requestNumber =
        `TRA-WDR-${Date.now()}-` +
        randomUUID().slice(0, 6).toUpperCase();

      await connection.query(
        `INSERT INTO withdrawal_requests (
           id,
           request_number,
           agreement_id,
           customer_id,
           requested_by,
           principal,
           accrued_interest,
           total_amount,
           bank_account_last4,
           reason,
           status
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          withdrawalId,
          requestNumber,
          agreementId,
          user.id,
          user.id,
          principal,
          interest,
          totalAmount,
          bankAccountLast4,
          reason,
        ],
      );

      await addAudit(
        connection,
        withdrawalId,
        user.id,
        'REQUEST_CREATED',
        `Withdrawal requested for ${agreement.agreement_number}.`,
      );

      await connection.commit();

      res.status(201).json({
        message:
          'Withdrawal request submitted successfully.',
        withdrawal: {
          id: withdrawalId,
          requestNumber,
          agreementId,
          agreementNumber: agreement.agreement_number,
          principal,
          accruedInterest: interest,
          totalAmount,
          status: 'PENDING',
        },
      });
    } catch (error) {
      await connection.rollback();

      console.error('Create withdrawal error:', error);

      res.status(500).json({
        message: 'Unable to submit the withdrawal request.',
      });
    } finally {
      connection.release();
    }
  },
);

// =====================================================
// PATCH /api/withdrawals/:id/review
// PUT is also supported for clients using PUT.
// Only MANAGER and ADMIN can review withdrawal requests.
// =====================================================
async function reviewWithdrawal(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const user = getUser(req);
  const withdrawalId = getString(req.params.id);
  const action = getString(req.body?.action).toUpperCase();
  const comment = getString(req.body?.comment);

  const statusMap: Record<string, WithdrawalStatus> = {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    SEND_BACK: 'SENT_BACK',
  };

  if (!withdrawalId || !statusMap[action]) {
    res.status(400).json({
      message:
        'Provide a valid withdrawal ID and review action.',
    });
    return;
  }

  if (comment.length > 1000) {
    res.status(400).json({
      message: 'Review comment must not exceed 1000 characters.',
    });
    return;
  }

  if (action !== 'APPROVE' && !comment) {
    res.status(400).json({
      message:
        'A comment is required for rejection or send-back.',
    });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<
      mysql.RowDataPacket[]
    >(
      `SELECT id, status
       FROM withdrawal_requests
       WHERE id = ?
       FOR UPDATE`,
      [withdrawalId],
    );

    if (rows.length === 0) {
      await connection.rollback();

      res.status(404).json({
        message: 'Withdrawal request not found.',
      });
      return;
    }

    if (rows[0].status !== 'PENDING') {
      await connection.rollback();

      res.status(409).json({
        message:
          'Only pending requests can be reviewed.',
      });
      return;
    }

    const nextStatus = statusMap[action];

    await connection.query(
      `UPDATE withdrawal_requests
       SET status = ?,
           manager_remarks = ?,
           reviewed_by = ?,
           reviewed_at = NOW()
       WHERE id = ?`,
      [
        nextStatus,
        comment || null,
        user.id,
        withdrawalId,
      ],
    );

    await addAudit(
      connection,
      withdrawalId,
      user.id,
      `REQUEST_${action}`,
      comment || `Request ${action.toLowerCase()}.`,
    );

    await connection.commit();

    res.status(200).json({
      message:
        `Withdrawal request ${action.toLowerCase()} ` +
        'successfully.',
      withdrawalId,
      status: nextStatus,
    });
  } catch (error) {
    await connection.rollback();

    console.error('Review withdrawal error:', error);

    res.status(500).json({
      message: 'Unable to review the withdrawal request.',
    });
  } finally {
    connection.release();
  }
}

router.patch(
  '/:id/review',
  authenticate,
  allowRoles('ADMIN', 'MANAGER'),
  reviewWithdrawal,
);

router.put(
  '/:id/review',
  authenticate,
  allowRoles('ADMIN', 'MANAGER'),
  reviewWithdrawal,
);

// =====================================================
// POST /api/withdrawals/:id/payment
// Records payment details; does not transfer money.
// =====================================================
router.post(
  '/:id/payment',
  authenticate,
  allowRoles('ADMIN', 'MANAGER'),
  async (req: AuthRequest, res: Response) => {
    const user = getUser(req);
    const withdrawalId = getString(req.params.id);
    const paymentReference = getString(
      req.body?.paymentReference,
    );
    const paymentProofPath = getString(
      req.body?.paymentProofPath,
    );

    if (!withdrawalId || !paymentReference) {
      res.status(400).json({
        message:
          'Withdrawal ID and payment reference are required.',
      });
      return;
    }

    if (
      paymentReference.length > 150 ||
      paymentProofPath.length > 500
    ) {
      res.status(400).json({
        message:
          'Payment reference or proof path is too long.',
      });
      return;
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<
        mysql.RowDataPacket[]
      >(
        `SELECT id, agreement_id, total_amount, status
         FROM withdrawal_requests
         WHERE id = ?
         FOR UPDATE`,
        [withdrawalId],
      );

      if (rows.length === 0) {
        await connection.rollback();

        res.status(404).json({
          message: 'Withdrawal request not found.',
        });
        return;
      }

      const withdrawal = rows[0];

      if (withdrawal.status !== 'APPROVED') {
        await connection.rollback();

        res.status(409).json({
          message:
            'Only approved withdrawals can be marked as paid.',
        });
        return;
      }

      const [agreements] = await connection.query<
        mysql.RowDataPacket[]
      >(
        `SELECT id, status
         FROM investment_agreements
         WHERE id = ?
         FOR UPDATE`,
        [withdrawal.agreement_id],
      );

      if (
        agreements.length === 0 ||
        agreements[0].status !== 'APPROVED'
      ) {
        await connection.rollback();

        res.status(409).json({
          message:
            'The agreement is not in an approved state.',
        });
        return;
      }

      // Requires CLOSED to be present in the agreement status enum.
      // Apply the corresponding database migration before using payment.
      await connection.query(
        `UPDATE withdrawal_requests
         SET status = 'PAID',
             payment_reference = ?,
             payment_proof_path = ?,
             paid_by = ?,
             paid_at = NOW()
         WHERE id = ?`,
        [
          paymentReference,
          paymentProofPath || null,
          user.id,
          withdrawalId,
        ],
      );

      await connection.query(
        `UPDATE investment_agreements
         SET status = 'CLOSED'
         WHERE id = ?`,
        [withdrawal.agreement_id],
      );

      await addAudit(
        connection,
        withdrawalId,
        user.id,
        'PAYMENT_RECORDED',
        `Payment reference: ${paymentReference}; ` +
        `amount: ${withdrawal.total_amount}.`,
      );

      await connection.commit();

      res.status(200).json({
        message:
          'Payment recorded and agreement closed successfully.',
        withdrawalId,
        status: 'PAID',
        paymentReference,
      });
    } catch (error) {
      await connection.rollback();

      console.error('Withdrawal payment error:', error);

      res.status(500).json({
        message: 'Unable to record withdrawal payment.',
      });
    } finally {
      connection.release();
    }
  },
);

// =====================================================
// GET /api/withdrawals/:id/audit
// Customers can see only their own audit history.
// =====================================================
router.get(
  '/:id/audit',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const user = getUser(req);
    const withdrawalId = getString(req.params.id);

    if (!withdrawalId) {
      res.status(400).json({
        message: 'Withdrawal ID is required.',
      });
      return;
    }

    try {
      let sql = `
        SELECT
          l.id,
          l.withdrawal_id,
          l.actor_id,
          l.action,
          l.remarks,
          l.created_at
        FROM withdrawal_audit_logs l
        INNER JOIN withdrawal_requests w
          ON w.id = l.withdrawal_id
        WHERE l.withdrawal_id = ?
      `;

      const params: string[] = [withdrawalId];

      if (user.role === 'CUSTOMER') {
        sql += ' AND w.customer_id = ?';
        params.push(user.id);
      }

      sql += ' ORDER BY l.created_at ASC';

      const [rows] = await pool.query(sql, params);

      res.status(200).json({ auditLogs: rows });
    } catch (error) {
      console.error('Withdrawal audit error:', error);

      res.status(500).json({
        message:
          'Unable to retrieve withdrawal audit history.',
      });
    }
  },
);

export default router;
