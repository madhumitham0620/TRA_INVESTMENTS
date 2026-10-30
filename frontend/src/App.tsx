
import { useState, type FormEvent } from 'react';
import './App.css';
import RoleDashboards from './RoleDashboards';

const API_URL = 'http://localhost:4000/api/auth';

type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES_EXECUTIVE'
  | 'CUSTOMER';

type AuthUser = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  status?: 'PENDING' | 'ACTIVE' | 'INACTIVE';
  mustChangePassword?: boolean;
};

type AuthResponse = {
  message?: string;
  token?: string;
  user?: AuthUser;
  errors?: Record<string, string[] | undefined>;
};

type AuthPage = 'login' | 'register';

const VALID_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'SALES_EXECUTIVE',
  'CUSTOMER',
];

const TOKEN_KEY = 'tra-invest-token';
const USER_KEY = 'tra-invest-user';

function clearStoredSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);

  // Clear the older key as well, if it exists.
  sessionStorage.removeItem('tra_invest_token');
}

function isTokenValid(token: string): boolean {
  try {
    const parts = token.split('.');

    if (parts.length !== 3) {
      return false;
    }

    const base64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const paddedBase64 = base64.padEnd(
      Math.ceil(base64.length / 4) * 4,
      '=',
    );

    const payload = JSON.parse(atob(paddedBase64));

    if (
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function getStoredUser(): AuthUser | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const savedUser = sessionStorage.getItem(USER_KEY);

    if (!token || !savedUser || !isTokenValid(token)) {
      clearStoredSession();
      return null;
    }

    const parsed: unknown = JSON.parse(savedUser);

    if (!parsed || typeof parsed !== 'object') {
      clearStoredSession();
      return null;
    }

    const candidate = parsed as Partial<AuthUser>;

    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.userId !== 'string' ||
      typeof candidate.fullName !== 'string' ||
      typeof candidate.email !== 'string' ||
      !VALID_ROLES.includes(candidate.role as UserRole)
    ) {
      clearStoredSession();
      return null;
    }

    return candidate as AuthUser;
  } catch {
    clearStoredSession();
    return null;
  }
}

function getResponseMessage(
  data: AuthResponse,
  fallback: string,
): string {
  if (data.errors) {
    const firstError = Object.values(data.errors)
      .flat()
      .find(
        (value): value is string =>
          typeof value === 'string',
      );

    if (firstError) {
      return firstError;
    }
  }

  return data.message || fallback;
}

async function readResponse(
  response: Response,
): Promise<AuthResponse> {
  try {
    return (await response.json()) as AuthResponse;
  } catch {
    return {};
  }
}

function App() {
  const [loggedInUser, setLoggedInUser] =
    useState<AuthUser | null>(() => getStoredUser());

  const [page, setPage] = useState<AuthPage>('login');

  const [identifier, setIdentifier] = useState('');
  const [fullName, setFullName] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function resetMessages() {
    setError('');
    setSuccess('');
  }

  function switchPage(nextPage: AuthPage) {
    if (loading) return;

    setPage(nextPage);
    resetMessages();
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function handleLogout() {
    clearStoredSession();

    setLoggedInUser(null);
    setPage('login');

    setIdentifier('');
    setFullName('');
    setUserId('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');

    setShowPassword(false);
    setShowConfirmPassword(false);

    resetMessages();
  }

  async function submitLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    resetMessages();

    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier || !password) {
      setError(
        'Please enter your user ID or email and password.',
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          identifier: cleanIdentifier,
          password,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          getResponseMessage(
            data,
            'Login failed. Please check your credentials.',
          ),
        );
      }

      if (!data.token || !data.user) {
        throw new Error(
          'The server response is missing the login token or user details.',
        );
      }

      if (!VALID_ROLES.includes(data.user.role)) {
        throw new Error(
          'Your account has an unrecognized user role.',
        );
      }

      if (!isTokenValid(data.token)) {
        throw new Error(
          'The server returned an invalid or expired login token. Please try again.',
        );
      }

      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(
        USER_KEY,
        JSON.stringify(data.user),
      );

      setLoggedInUser(data.user);

      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);

      resetMessages();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please try again.';

      setError(
        message.includes('Failed to fetch')
          ? 'Cannot connect to the server. Make sure your backend is running at localhost:4000.'
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitRegistration(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    resetMessages();

    const cleanName = fullName.trim();
    const cleanUserId = userId.trim();
    const cleanEmail = email.trim();

    if (
      !cleanName ||
      !cleanUserId ||
      !cleanEmail ||
      !password ||
      !confirmPassword
    ) {
      setError('Please complete all required fields.');
      return;
    }

    if (cleanName.length < 2 || cleanName.length > 120) {
      setError(
        'Full name must contain between 2 and 120 characters.',
      );
      return;
    }

    if (cleanUserId.length < 3 || cleanUserId.length > 40) {
      setError(
        'User ID must contain between 3 and 40 characters.',
      );
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (cleanEmail.length > 254) {
      setError('Email address is too long.');
      return;
    }

    if (password.length < 12 || password.length > 128) {
      setError(
        'Password must contain between 12 and 128 characters.',
      );
      return;
    }

    if (
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      setError(
        'Use uppercase, lowercase, a number and a special character in your password.',
      );
      return;
    }

    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          userId: cleanUserId,
          fullName: cleanName,
          email: cleanEmail,
          password,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          getResponseMessage(
            data,
            'Registration failed. Please check your details.',
          ),
        );
      }

      setIdentifier(cleanUserId);

      setFullName('');
      setUserId('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');

      setShowPassword(false);
      setShowConfirmPassword(false);

      setPage('login');

      setSuccess(
        data.message ||
          'Registration successful. You can now sign in if your account is active.',
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to register. Please try again.';

      setError(
        message.includes('Failed to fetch')
          ? 'Cannot connect to the backend. Check that it is running at localhost:4000.'
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  // Show the dashboard for the authenticated user.
  if (loggedInUser) {
    return (
      <RoleDashboards
        user={loggedInUser}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-brand-panel">
          <div className="brand-lockup">
            <div className="auth-logo-card">
              <img
                className="auth-logo-full"
                src="/tra-invest-logo.png"
                alt="TRA Invest – Truest Research Analysis Investment Services"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
            </div>
          </div>

          <div className="auth-brand-content">
            <span className="dashboard-eyebrow">
              INVEST WITH CLARITY
            </span>

            <h2>
              Your investments.
              <br />
              Your future.
            </h2>

            <p>
              Manage investment agreements, monitor portfolios,
              track interest, and keep your investment activity
              organized in one place.
            </p>
          </div>

          <div className="auth-brand-footer">
            Secure access · Role-based workspace
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-form-content">
            <div className="auth-mobile-brand">
              <img
                src="/tra-invest-logo.png"
                alt="TRA Invest"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
            </div>

            <div className="auth-heading">
              <h2>Welcome to TRA Invest</h2>

              <p>
                {page === 'login'
                  ? 'Sign in to continue to your TRA Invest dashboard.'
                  : 'Enter your details to register for TRA Invest.'}
              </p>
            </div>

            <div className="auth-tabs">
              <button
                type="button"
                className={
                  page === 'login'
                    ? 'auth-tab active'
                    : 'auth-tab'
                }
                onClick={() => switchPage('login')}
                disabled={loading}
              >
                Sign In
              </button>

              <button
                type="button"
                className={
                  page === 'register'
                    ? 'auth-tab active'
                    : 'auth-tab'
                }
                onClick={() => switchPage('register')}
                disabled={loading}
              >
                Sign Up
              </button>
            </div>

            {error && (
              <div
                className="auth-alert auth-alert-error"
                role="alert"
              >
                <span aria-hidden="true">!</span>
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div
                className="auth-alert auth-alert-success"
                role="status"
              >
                <span aria-hidden="true">✓</span>
                <p>{success}</p>
              </div>
            )}

            {page === 'login' ? (
              <form
                className="auth-form"
                onSubmit={submitLogin}
              >
                <div className="form-field">
                  <label htmlFor="login-identifier">
                    User ID or Email
                  </label>

                  <input
                    id="login-identifier"
                    name="identifier"
                    type="text"
                    value={identifier}
                    onChange={(event) =>
                      setIdentifier(event.target.value)
                    }
                    placeholder="Enter your user ID or email"
                    autoComplete="username"
                    disabled={loading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="login-password">
                    Password
                  </label>

                  <div className="password-input-wrap">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      disabled={loading}
                      required
                    />

                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() =>
                        setShowPassword((current) => !current)
                      }
                      aria-label={
                        showPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                      disabled={loading}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                  {!loading && (
                    <span aria-hidden="true"> →</span>
                  )}
                </button>

                <p className="auth-switch-copy">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    className="auth-inline-link"
                    onClick={() => switchPage('register')}
                    disabled={loading}
                  >
                    Create an account
                  </button>
                </p>
              </form>
            ) : (
              <form
                className="auth-form"
                onSubmit={submitRegistration}
              >
                <div className="form-field">
                  <label htmlFor="register-fullname">
                    Full Name
                  </label>

                  <input
                    id="register-fullname"
                    name="fullName"
                    type="text"
                    value={fullName}
                    onChange={(event) =>
                      setFullName(event.target.value)
                    }
                    placeholder="Enter your full name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={120}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="register-userid">
                    User ID
                  </label>

                  <input
                    id="register-userid"
                    name="userId"
                    type="text"
                    value={userId}
                    onChange={(event) =>
                      setUserId(event.target.value)
                    }
                    placeholder="Choose a user ID"
                    autoComplete="username"
                    minLength={3}
                    maxLength={40}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="register-email">
                    Email Address
                  </label>

                  <input
                    id="register-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="you@example.com"
                    autoComplete="email"
                    maxLength={254}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="register-password">
                    Password
                  </label>

                  <div className="password-input-wrap">
                    <input
                      id="register-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      disabled={loading}
                      required
                    />

                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() =>
                        setShowPassword((current) => !current)
                      }
                      aria-label={
                        showPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                      disabled={loading}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  <p className="field-hint">
                    Use at least 12 characters, including
                    uppercase, lowercase, a number, and a
                    special character.
                  </p>
                </div>

                <div className="form-field">
                  <label htmlFor="register-confirm-password">
                    Confirm Password
                  </label>

                  <div className="password-input-wrap">
                    <input
                      id="register-confirm-password"
                      name="confirmPassword"
                      type={
                        showConfirmPassword ? 'text' : 'password'
                      }
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      disabled={loading}
                      required
                    />

                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(
                          (current) => !current,
                        )
                      }
                      aria-label={
                        showConfirmPassword
                          ? 'Hide confirmation password'
                          : 'Show confirmation password'
                      }
                      disabled={loading}
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={loading}
                >
                  {loading
                    ? 'Creating account...'
                    : 'Create Account'}
                  {!loading && (
                    <span aria-hidden="true"> →</span>
                  )}
                </button>

                <p className="auth-switch-copy">
                  Already registered?{' '}
                  <button
                    type="button"
                    className="auth-inline-link"
                    onClick={() => switchPage('login')}
                    disabled={loading}
                  >
                    Sign in
                  </button>
                </p>
              </form>
            )}

            <p className="auth-security-note">
              Your account access is managed through TRA Invest
              authentication and role permissions.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
