
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES_EXECUTIVE'
  | 'AUDITOR'
  | 'CUSTOMER';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    role: UserRole;
  };
}

interface TokenPayload extends jwt.JwtPayload {
  userId?: string;
  role?: string;
}

const ALLOWED_ROLES: readonly UserRole[] = [
  'ADMIN',
  'MANAGER',
  'SALES_EXECUTIVE',
  'AUDITOR',
  'CUSTOMER',
];

function getJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authReq = req as AuthenticatedRequest;
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

    const payload = decoded as TokenPayload;

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.userId !== 'string' ||
      typeof payload.role !== 'string' ||
      !ALLOWED_ROLES.includes(payload.role as UserRole)
    ) {
      res.status(401).json({
        message: 'Invalid authentication token or role.',
      });
      return;
    }

    authReq.user = {
      id: payload.sub,
      userId: payload.userId,
      role: payload.role as UserRole,
    };

    next();
  } catch {
    res.status(401).json({
      message: 'Invalid or expired token. Please log in again.',
    });
  }
}

export function allowRoles(...roles: UserRole[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const user = (req as AuthenticatedRequest).user;

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
