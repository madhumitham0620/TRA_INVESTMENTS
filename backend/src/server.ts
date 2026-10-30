
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import jwt, { type JwtPayload } from 'jsonwebtoken';

import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import agreementsRouter from './routes/agreements.js';
import { customersRouter } from './routes/customer.js';
import dashboardRouter from './routes/dashboard.js';
import withdrawalsRouter, {
  initializeWithdrawals,
} from './routes/withdrawals.js';
import { profileRouter } from './routes/profile.js';
import reportsRouter from './routes/reports.js';

const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
];

const allowedRoles = [
  'ADMIN',
  'MANAGER',
  'SALES_EXECUTIVE',
  'CUSTOMER',
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json({ limit: '10kb' }));

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
});

app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (typeof token !== 'string' || !token) {
    return next(new Error('Authentication required'));
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('JWT_SECRET is not configured.');
    return next(new Error('Server authentication is not configured'));
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    const role = decoded.role;
    const userId = decoded.id ?? decoded.userId ?? decoded.sub;

    if (
      typeof userId !== 'string' &&
      typeof userId !== 'number'
    ) {
      return next(new Error('Invalid authentication token'));
    }

    if (
      typeof role !== 'string' ||
      !allowedRoles.includes(role)
    ) {
      return next(new Error('Invalid user role'));
    }

    socket.data.userId = String(userId);
    socket.data.role = role;

    return next();
  } catch {
    return next(new Error('Invalid or expired authentication token'));
  }
});

io.on('connection', (socket) => {
  const role = socket.data.role as string;

  socket.join(`role:${role}`);

  console.log(`Live connection established for role: ${role}`);

  socket.on('disconnect', () => {
    console.log(`Live connection disconnected for role: ${role}`);
  });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    application: 'TRA Invest API',
    realtime: 'enabled',
  });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/agreements', agreementsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/customers', customersRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/withdrawals', withdrawalsRouter);
app.use('/api/reports', reportsRouter);

// Unknown API endpoint
app.use('/api', (_req, res) => {
  res.status(404).json({
    message: 'API endpoint not found.',
  });
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('API error:', err.message);

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      message: 'An unexpected server error occurred.',
    });
  },
);

// Initialize database and start server
async function startServer(): Promise<void> {
  try {
    await initializeWithdrawals();

    httpServer.listen(port, () => {
      console.log(`TRA Invest API running at http://localhost:${port}`);
      console.log('Socket.IO real-time server is enabled.');
      console.log('Supported roles:', allowedRoles.join(', '));
    });
  } catch (error) {
    console.error('Failed to initialize TRA Invest:', error);
    process.exitCode = 1;
  }
}

void startServer();
