import { Router } from 'express';
import { pool } from '../db/pool.js';
import { authenticate, } from '../middleware/authenticate.js';
export const customersRouter = Router();
const allowedRoles = [
    'ADMIN',
    'MANAGER',
    'SALES_EXECUTIVE',
    'AUDITOR',
];
customersRouter.get('/', authenticate, async (req, res) => {
    const authReq = req;
    try {
        const user = authReq.user;
        if (!user ||
            !allowedRoles.includes(user.role)) {
            res.status(403).json({
                message: 'You are not authorized to view customer records.',
            });
            return;
        }
        let sql = `
      SELECT
        customer.id,
        customer.user_id AS userId,
        customer.full_name AS fullName,
        customer.email,
        customer.role,
        customer.status,
        customer.created_at AS createdAt,

        customer.created_by AS createdBy,
        creator.role AS createdByRole,
        creator.full_name AS createdByName,

        customer.assigned_sales_executive_id AS assignedSalesExecutiveId,
        assigned_sales.full_name AS assignedSalesExecutiveName

      FROM users AS customer

      LEFT JOIN users AS creator
        ON creator.id = customer.created_by

      LEFT JOIN users AS assigned_sales
        ON assigned_sales.id = customer.assigned_sales_executive_id

      WHERE customer.role = 'CUSTOMER'
    `;
        const params = [];
        // Sales Executives can view only customers they created
        // or customers assigned to them.
        if (user.role === 'SALES_EXECUTIVE') {
            sql += `
        AND (
          customer.created_by = ?
          OR customer.assigned_sales_executive_id = ?
        )
      `;
            // user.id must match the UUID stored in users.id.
            params.push(user.id, user.id);
        }
        sql += ' ORDER BY customer.created_at DESC';
        const [rows] = await pool.execute(sql, params);
        res.status(200).json({
            customers: rows,
        });
    }
    catch (error) {
        console.error('Failed to fetch customers:', error);
        res.status(500).json({
            message: 'Unable to load customers. Please try again.',
        });
    }
});
