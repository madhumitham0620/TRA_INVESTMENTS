
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mysql, {
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Server } from 'socket.io';

type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES_EXECUTIVE'
  | 'CUSTOMER';

type AuthedRequest = Request & {
  actor?: { id: string; role: Role };
};

const router = Router();

/* =========================================================
   DATABASE
========================================================= */

let pool: Pool | null = null;

function getPool(): Pool {
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

/* =========================================================
   SOCKET.IO NOTIFICATIONS
========================================================= */

type AgreementEvent =
  | 'created'
  | 'updated'
  | 'submitted'
  | 'reviewed';

function notifyAgreementUpdate(
  req: Request,
  event: AgreementEvent,
): void {
  const io = req.app.get('io') as Server | undefined;

  if (!io) {
    console.warn('Socket.IO unavailable for agreement update.');
    return;
  }

  io.emit('agreements:updated', {
    event,
    updatedAt: new Date().toISOString(),
  });
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

  let payload: JwtPayload;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (typeof decoded === 'string') {
      res.status(401).json({
        message: 'Invalid session token.',
      });
      return;
    }

    payload = decoded;
  } catch {
    res.status(401).json({
      message: 'Your session has expired. Please sign in again.',
    });
    return;
  }

  const key = String(
    payload.id ?? payload.sub ?? payload.userId ?? '',
  );

  if (!key) {
    res.status(401).json({
      message: 'Session does not contain a user identifier.',
    });
    return;
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      key,
    );

  const column = isUuid ? 'id' : 'user_id';

  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT id, role, status
         FROM users
        WHERE ${column} = ?
        LIMIT 1`,
      [key],
    );

    const user = rows[0];

    if (!user) {
      res.status(401).json({
        message: 'User account not found. Please sign in again.',
      });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({
        message: `Your account is ${user.status}.`,
      });
      return;
    }

    const validRoles: Role[] = [
      'ADMIN',
      'MANAGER',
      'SALES_EXECUTIVE',
      'CUSTOMER',
    ];

    if (!validRoles.includes(user.role as Role)) {
      res.status(403).json({
        message: 'Your account has an unsupported role.',
      });
      return;
    }

    req.actor = {
      id: String(user.id),
      role: user.role as Role,
    };

    next();
  } catch (error) {
    console.error('Agreement authentication error:', error);

    res.status(500).json({
      message: 'Unable to verify your account.',
    });
  }
}

function requireRole(...allowed: Role[]) {
  return (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.actor || !allowed.includes(req.actor.role)) {
      res.status(403).json({
        message: 'You do not have permission to perform this action.',
      });
      return;
    }

    next();
  };
}

/* =========================================================
   VALIDATION
========================================================= */

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine(isRealDate, 'Enter a valid date.');

const agreementSchema = z
  .object({
    customerId: z.string().uuid('Select a valid customer.'),
    principalAmount: z
      .number()
      .positive('Principal must be greater than zero.')
      .max(9999999999999.99, 'Principal amount is too large.'),
    interestRate: z
      .number()
      .positive('Interest rate must be greater than zero.')
      .max(100, 'Interest rate cannot exceed 100%.'),
    startDate: dateField,
    endDate: dateField,
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after the start date.',
    path: ['endDate'],
  });

const createSchema = agreementSchema.extend({
  submitForApproval: z.boolean().default(false),
});

const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'SEND_BACK']),
  remarks: z.string().trim().max(2000).optional().default(''),
});

/* =========================================================
   HELPERS
========================================================= */

function validId(
  value: string | string[] | undefined,
): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

const agreementSelect = `
  SELECT
    a.id,
    a.agreement_number,
    a.customer_id,
    a.created_by,
    a.principal_amount,
    a.interest_rate,
    a.start_date,
    a.end_date,
    a.status,
    a.manager_remarks,
    a.reviewed_by,
    a.reviewed_at,
    a.created_at,
    c.full_name AS customer_name,
    c.user_id AS customer_user_id,
    c.email AS customer_email,
    s.full_name AS created_by_name,
    r.full_name AS reviewed_by_name
  FROM investment_agreements a
  JOIN users c ON c.id = a.customer_id
  JOIN users s ON s.id = a.created_by
  LEFT JOIN users r ON r.id = a.reviewed_by
`;

function mapAgreement(row: RowDataPacket) {
  return {
    id: Number(row.id),
    agreementNumber: String(row.agreement_number),
    customerId: String(row.customer_id),
    customerName: String(row.customer_name),
    customerUserId: String(row.customer_user_id),
    customerEmail: String(row.customer_email),
    createdBy: String(row.created_by),
    createdByName: String(row.created_by_name),
    principalAmount: Number(row.principal_amount),
    interestRate: Number(row.interest_rate),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    status: String(row.status),
    managerRemarks: row.manager_remarks ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedByName: row.reviewed_by_name ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

/* =========================================================
   ACTIVE CUSTOMERS
   GET /api/agreements/customers
========================================================= */

router.get(
  '/customers',
  authenticate,
  requireRole('ADMIN', 'MANAGER', 'SALES_EXECUTIVE'),
  async (_req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const [rows] = await getPool().query<RowDataPacket[]>(
        `SELECT id, user_id, full_name, email
           FROM users
          WHERE role = 'CUSTOMER'
            AND status = 'ACTIVE'
          ORDER BY full_name
          LIMIT 500`,
      );

      res.json({
        customers: rows.map((row) => ({
          id: String(row.id),
          userId: String(row.user_id),
          fullName: String(row.full_name),
          email: String(row.email),
        })),
      });
    } catch (error) {
      console.error('Load customers failed:', error);

      res.status(500).json({
        message: 'Unable to load customers.',
      });
    }
  },
);

/* =========================================================
   LIST AGREEMENTS
   GET /api/agreements
========================================================= */

router.get(
  '/',
  authenticate,
  async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const actor = req.actor!;
      let where = '';
      const params: string[] = [];

      if (actor.role === 'SALES_EXECUTIVE') {
        where = 'WHERE a.created_by = ?';
        params.push(actor.id);
      } else if (actor.role === 'CUSTOMER') {
        where = 'WHERE a.customer_id = ?';
        params.push(actor.id);
      }

      const [rows] = await getPool().query<RowDataPacket[]>(
        `${agreementSelect}
          ${where}
          ORDER BY a.created_at DESC
          LIMIT 200`,
        params,
      );

      res.json({
        agreements: rows.map(mapAgreement),
      });
    } catch (error) {
      console.error('List agreements failed:', error);

      res.status(500).json({
        message: 'Unable to load agreements.',
      });
    }
  },
);

/* =========================================================
   MANAGER PENDING APPROVALS
   IMPORTANT: THIS MUST BE BEFORE GET /:id
   GET /api/agreements/pending
========================================================= */

router.get(
  '/pending',
  authenticate,
  requireRole('MANAGER'),
  async (_req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const [rows] = await getPool().query<RowDataPacket[]>(
        `${agreementSelect}
          WHERE a.status = 'PENDING_APPROVAL'
          ORDER BY a.created_at ASC
          LIMIT 200`,
      );

      res.json({
        agreements: rows.map(mapAgreement),
      });
    } catch (error) {
      console.error('Load pending agreements failed:', error);

      res.status(500).json({
        message: 'Unable to load pending agreements.',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

/* =========================================================
   GET ONE AGREEMENT
   GET /api/agreements/:id
========================================================= */

router.get(
  '/:id',
  authenticate,
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = validId(req.params.id);

    if (!id) {
      res.status(400).json({ message: 'Invalid agreement ID.' });
      return;
    }

    try {
      const [rows] = await getPool().query<RowDataPacket[]>(
        `${agreementSelect} WHERE a.id = ? LIMIT 1`,
        [id],
      );

      const row = rows[0];

      if (!row) {
        res.status(404).json({ message: 'Agreement not found.' });
        return;
      }

      const actor = req.actor!;

      if (
        actor.role === 'CUSTOMER' &&
        (String(row.customer_id) !== actor.id ||
          row.status !== 'APPROVED')
      ) {
        res.status(404).json({ message: 'Agreement not found.' });
        return;
      }

      if (
        actor.role === 'SALES_EXECUTIVE' &&
        String(row.created_by) !== actor.id
      ) {
        res.status(404).json({ message: 'Agreement not found.' });
        return;
      }

      const [history] = await getPool().query<RowDataPacket[]>(
        `SELECT h.action, h.remarks, h.reviewed_at,
                u.full_name AS reviewer_name
           FROM agreement_approval_history h
           JOIN users u ON u.id = h.reviewed_by
          WHERE h.agreement_id = ?
          ORDER BY h.reviewed_at DESC`,
        [id],
      );

      res.json({
        agreement: mapAgreement(row),
        approvalHistory: history,
      });
    } catch (error) {
      console.error('Get agreement failed:', error);

      res.status(500).json({
        message: 'Unable to load agreement details.',
      });
    }
  },
);

/* =========================================================
   CREATE AGREEMENT
   POST /api/agreements
========================================================= */

router.post(
  '/',
  authenticate,
  requireRole('ADMIN', 'SALES_EXECUTIVE'),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const parsed = createSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: 'Please check the agreement details.',
        errors: z.flattenError(parsed.error).fieldErrors,
      });
      return;
    }

    const data = parsed.data;
    const actor = req.actor!;
    const status = data.submitForApproval
      ? 'PENDING_APPROVAL'
      : 'DRAFT';

    const connection = await getPool().getConnection();

    try {
      await connection.beginTransaction();

      const [customers] = await connection.query<RowDataPacket[]>(
        `SELECT id
           FROM users
          WHERE id = ?
            AND role = 'CUSTOMER'
            AND status = 'ACTIVE'
          LIMIT 1`,
        [data.customerId],
      );

      if (customers.length === 0) {
        await connection.rollback();

        res.status(400).json({
          message: 'Selected customer is not active.',
        });
        return;
      }

      const [inserted] = await connection.query<ResultSetHeader>(
        `INSERT INTO investment_agreements
          (agreement_number, customer_id, created_by,
           principal_amount, interest_rate, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `TMP-${randomUUID()}`,
          data.customerId,
          actor.id,
          data.principalAmount,
          data.interestRate,
          data.startDate,
          data.endDate,
          status,
        ],
      );

      const agreementNumber =
        `TRA-AGR-${new Date().getFullYear()}-` +
        String(inserted.insertId).padStart(6, '0');

      await connection.query(
        `UPDATE investment_agreements
            SET agreement_number = ?
          WHERE id = ?`,
        [agreementNumber, inserted.insertId],
      );

      await connection.commit();

      notifyAgreementUpdate(req, 'created');

      res.status(201).json({
        message: data.submitForApproval
          ? 'Agreement submitted for manager approval.'
          : 'Agreement saved as draft.',
        agreement: {
          id: inserted.insertId,
          agreementNumber,
          status,
        },
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Create agreement rollback failed:', rollbackError);
      }

      console.error('Create agreement failed:', error);

      res.status(500).json({
        message: 'Unable to create agreement.',
      });
    } finally {
      connection.release();
    }
  },
);

/* =========================================================
   EDIT DRAFT / SENT-BACK AGREEMENT
   PUT /api/agreements/:id
========================================================= */

router.put(
  '/:id',
  authenticate,
  requireRole('ADMIN', 'SALES_EXECUTIVE'),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = validId(req.params.id);

    if (!id) {
      res.status(400).json({ message: 'Invalid agreement ID.' });
      return;
    }

    const parsed = agreementSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: 'Please check the agreement details.',
        errors: z.flattenError(parsed.error).fieldErrors,
      });
      return;
    }

    const data = parsed.data;
    const actor = req.actor!;

    try {
      const [customers] = await getPool().query<RowDataPacket[]>(
        `SELECT id
           FROM users
          WHERE id = ?
            AND role = 'CUSTOMER'
            AND status = 'ACTIVE'
          LIMIT 1`,
        [data.customerId],
      );

      if (customers.length === 0) {
        res.status(400).json({
          message: 'Selected customer is not active.',
        });
        return;
      }

      const [result] = await getPool().query<ResultSetHeader>(
        `UPDATE investment_agreements
            SET customer_id = ?,
                principal_amount = ?,
                interest_rate = ?,
                start_date = ?,
                end_date = ?,
                manager_remarks = NULL
          WHERE id = ?
            AND created_by = ?
            AND status IN ('DRAFT', 'SENT_BACK')`,
        [
          data.customerId,
          data.principalAmount,
          data.interestRate,
          data.startDate,
          data.endDate,
          id,
          actor.id,
        ],
      );

      if (result.affectedRows === 0) {
        res.status(409).json({
          message: 'Only your own draft or sent-back agreement can be edited.',
        });
        return;
      }

      notifyAgreementUpdate(req, 'updated');

      res.json({
        message: 'Agreement updated successfully.',
      });
    } catch (error) {
      console.error('Update agreement failed:', error);

      res.status(500).json({
        message: 'Unable to update agreement.',
      });
    }
  },
);

/* =========================================================
   SUBMIT DRAFT / SENT-BACK AGREEMENT
   PATCH /api/agreements/:id/submit
========================================================= */

router.patch(
  '/:id/submit',
  authenticate,
  requireRole('ADMIN', 'SALES_EXECUTIVE'),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = validId(req.params.id);

    if (!id) {
      res.status(400).json({ message: 'Invalid agreement ID.' });
      return;
    }

    try {
      const [result] = await getPool().query<ResultSetHeader>(
        `UPDATE investment_agreements
            SET status = 'PENDING_APPROVAL',
                manager_remarks = NULL
          WHERE id = ?
            AND created_by = ?
            AND status IN ('DRAFT', 'SENT_BACK')`,
        [id, req.actor!.id],
      );

      if (result.affectedRows === 0) {
        res.status(409).json({
          message: 'Only your own draft or sent-back agreement can be submitted.',
        });
        return;
      }

      notifyAgreementUpdate(req, 'submitted');

      res.json({
        message: 'Agreement submitted for manager approval.',
      });
    } catch (error) {
      console.error('Submit agreement failed:', error);

      res.status(500).json({
        message: 'Unable to submit agreement.',
      });
    }
  },
);

/* =========================================================
   MANAGER REVIEW
   PATCH /api/agreements/:id/review
========================================================= */

router.patch(
  '/:id/review',
  authenticate,
  requireRole('MANAGER'),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = validId(req.params.id);

    if (!id) {
      res.status(400).json({ message: 'Invalid agreement ID.' });
      return;
    }

    const parsed = reviewSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: 'Choose a valid review action and remarks.',
      });
      return;
    }

    const { action, remarks } = parsed.data;

    const statusByAction = {
      APPROVE: 'APPROVED',
      REJECT: 'REJECTED',
      SEND_BACK: 'SENT_BACK',
    } as const;

    const newStatus = statusByAction[action];
    const connection = await getPool().getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE investment_agreements
            SET status = ?,
                manager_remarks = ?,
                reviewed_by = ?,
                reviewed_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'PENDING_APPROVAL'`,
        [newStatus, remarks || null, req.actor!.id, id],
      );

      if (result.affectedRows === 0) {
        await connection.rollback();

        res.status(409).json({
          message: 'Agreement is not pending approval or has already been reviewed.',
        });
        return;
      }

      await connection.query(
        `INSERT INTO agreement_approval_history
          (agreement_id, reviewed_by, action, remarks, reviewed_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, req.actor!.id, action, remarks || null],
      );

      await connection.commit();

      notifyAgreementUpdate(req, 'reviewed');

      const message =
        action === 'APPROVE'
          ? 'Agreement approved successfully.'
          : action === 'REJECT'
            ? 'Agreement rejected successfully.'
            : 'Agreement sent back for correction.';

      res.json({
        message,
        agreement: {
          id,
          status: newStatus,
          managerRemarks: remarks || null,
          reviewedBy: req.actor!.id,
        },
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Review rollback failed:', rollbackError);
      }

      console.error('Review agreement failed:', error);

      res.status(500).json({
        message: 'Unable to review agreement.',
      });
    } finally {
      connection.release();
    }
  },
);

/* =========================================================
   APPROVAL HISTORY
   GET /api/agreements/:id/history
========================================================= */

router.get(
  '/:id/history',
  authenticate,
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = validId(req.params.id);

    if (!id) {
      res.status(400).json({ message: 'Invalid agreement ID.' });
      return;
    }

    try {
      const [agreements] = await getPool().query<RowDataPacket[]>(
        `SELECT customer_id, created_by, status
           FROM investment_agreements
          WHERE id = ?
          LIMIT 1`,
        [id],
      );

      const agreement = agreements[0];

      if (!agreement) {
        res.status(404).json({ message: 'Agreement not found.' });
        return;
      }

      const actor = req.actor!;

      if (
        actor.role === 'CUSTOMER' &&
        (String(agreement.customer_id) !== actor.id ||
          agreement.status !== 'APPROVED')
      ) {
        res.status(404).json({ message: 'Agreement not found.' });
        return;
      }

      if (
        actor.role === 'SALES_EXECUTIVE' &&
        String(agreement.created_by) !== actor.id
      ) {
        res.status(404).json({ message: 'Agreement not found.' });
        return;
      }

      const [history] = await getPool().query<RowDataPacket[]>(
        `SELECT h.action, h.remarks, h.reviewed_at,
                u.full_name AS reviewer_name
           FROM agreement_approval_history h
           JOIN users u ON u.id = h.reviewed_by
          WHERE h.agreement_id = ?
          ORDER BY h.reviewed_at DESC`,
        [id],
      );

      res.json({ history });
    } catch (error) {
      console.error('Load approval history failed:', error);

      res.status(500).json({
        message: 'Unable to load approval history.',
      });
    }
  },
);

export default router;
