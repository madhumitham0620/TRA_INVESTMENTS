
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';

export const authRouter = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

const registerSchema = z.object({
  userId: z.string().trim().min(3).max(40)
    .regex(/^[A-Za-z0-9_-]+$/),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
    .regex(/[a-z]/, 'Password needs a lowercase letter.')
    .regex(/[A-Z]/, 'Password needs an uppercase letter.')
    .regex(/[0-9]/, 'Password needs a number.')
    .regex(/[^A-Za-z0-9]/, 'Password needs a special character.'),
});

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }
  return secret;
}

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid registration details.',
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { userId, fullName, email, password } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();

    await pool.execute(
      `INSERT INTO users
        (id, user_id, full_name, email, password_hash, role,
         status, must_change_password)
       VALUES (?, ?, ?, ?, ?, 'CUSTOMER', 'ACTIVE', 0)`,
      [id, userId, fullName, email, passwordHash],
    );

    res.status(201).json({
      message: 'Registration successful. You can now sign in.',
      user: { id, userId, fullName, email, role: 'CUSTOMER' },
    });
  } catch (error) {
    const err = error as { code?: string };

    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({
        message: 'That user ID or email is already registered.',
      });
      return;
    }

    console.error('Registration failed:', error);
    res.status(500).json({ message: 'Registration could not be completed.' });
  }
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: 'Enter a valid user ID/email and password.' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, user_id AS userId, full_name AS fullName,
              email, password_hash AS passwordHash, role, status,
              must_change_password AS mustChangePassword
       FROM users
       WHERE user_id = ? OR email = ?
       LIMIT 1`,
      [parsed.data.identifier, parsed.data.identifier],
    );

    const users = rows as Array<{
      id: string;
      userId: string;
      fullName: string;
      email: string;
      passwordHash: string;
      role: string;
      status: string;
      mustChangePassword: number;
    }>;

    const user = users[0];

    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({ message: 'This account is not active.' });
      return;
    }

    const token = jwt.sign(
      { userId: user.userId, role: user.role },
      getJwtSecret(),
      { subject: String(user.id), expiresIn: '1h' },
    );

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        mustChangePassword: Boolean(user.mustChangePassword),
      },
    });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ message: 'Login could not be completed.' });
  }
});
