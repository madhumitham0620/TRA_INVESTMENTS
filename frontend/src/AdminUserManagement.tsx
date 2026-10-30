
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import './App.css';

const ADMIN_API = 'http://localhost:4000/api/admin';

type StaffRole = 'MANAGER' | 'SALES_EXECUTIVE';

type UserRecord = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
};

type ApiResponse = {
  message?: string;
  error?: string;
  users?: UserRecord[];
  user?: UserRecord;
  data?: UserRecord[] | { users?: UserRecord[] };
};

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  let result: ApiResponse;

  try {
    result = JSON.parse(text) as ApiResponse;
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error(
        `Backend returned HTML instead of JSON (HTTP ${response.status}). ` +
          'Check that the backend is running on port 4000.'
      );
    }

    throw new Error(`Invalid server response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const fieldErrors = result as ApiResponse & {
      errors?: Record<string, string[] | undefined>;
    };

    const validationMessage = fieldErrors.errors
      ? Object.values(fieldErrors.errors).flat().filter(Boolean).join(' ')
      : '';

    throw new Error(
      validationMessage ||
        result.message ||
        result.error ||
        `Request failed with status ${response.status}.`
    );
  }

  return result;
}

export default function AdminUserManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);

  const [fullName, setFullName] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('MANAGER');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const getToken = () => sessionStorage.getItem('tra-invest-token');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = getToken();

      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch(`${ADMIN_API}/users`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await readApiResponse(response);

      const possibleUsers =
        result.users ??
        (Array.isArray(result.data) ? result.data : result.data?.users);

      if (!Array.isArray(possibleUsers)) {
        throw new Error('The server response does not contain a users list.');
      }

      setUsers(possibleUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleCreateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    const token = getToken();

    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${ADMIN_API}/users`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: userId.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role,
        }),
      });

      const result = await readApiResponse(response);

      setMessage(result.message || 'Staff account created successfully.');

      setFullName('');
      setUserId('');
      setEmail('');
      setPassword('');
      setRole('MANAGER');

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create the staff account.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-users">
      <section className="dashboard-content-card">
        <div className="admin-users-heading">
          <div>
            <h2>Account Management</h2>
            <p>Create staff accounts for TRA Invest.</p>
          </div>
        </div>

        <form className="admin-user-form" onSubmit={handleCreateStaff}>
          <h3>Create Staff Account</h3>

          <label htmlFor="admin-full-name">Full name</label>
          <input
            id="admin-full-name"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            minLength={2}
            maxLength={120}
            autoComplete="name"
            required
          />

          <label htmlFor="admin-user-id">User ID</label>
          <input
            id="admin-user-id"
            type="text"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            minLength={3}
            maxLength={40}
            pattern="[A-Za-z0-9_-]+"
            title="Use letters, numbers, underscores, or hyphens."
            autoComplete="username"
            required
          />

          <label htmlFor="admin-email">Email address</label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            autoComplete="email"
            required
          />

          <label htmlFor="admin-role">Assign role</label>
          <select
            id="admin-role"
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRole)}
            required
          >
            <option value="MANAGER">Manager</option>
            <option value="SALES_EXECUTIVE">Sales Executive</option>
          </select>

          <label htmlFor="admin-password">Initial password</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,128}"
            title="Use at least 12 characters with uppercase, lowercase, a number, and a special character."
            required
          />

          <p className="admin-form-hint">
            Use at least 12 characters, including uppercase and lowercase
            letters, a number, and a special character.
          </p>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="form-message" role="status">
              {message}
            </p>
          )}

          <button
            className="dashboard-primary-button"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Creating account...' : 'Create Staff Account'}
          </button>
        </form>
      </section>

      <section className="dashboard-content-card">
        <div className="admin-users-heading">
          <div>
            <h2>Registered Users</h2>
            <p>Staff and customer accounts registered in the database.</p>
          </div>

          <button
            type="button"
            className="dashboard-primary-button"
            onClick={() => void loadUsers()}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {loading && users.length === 0 ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>
            {error
              ? 'Could not load users. Check the error above.'
              : 'No users were returned by the server.'}
          </p>
        ) : (
          <div className="admin-users-table-wrapper">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user, index) => (
                  <tr key={user.id || user.userId || `${user.email}-${index}`}>
                    <td>{user.userId}</td>
                    <td>{user.fullName}</td>
                    <td>{user.email}</td>
                    <td>{user.role?.replaceAll('_', ' ')}</td>
                    <td>{user.status || 'Unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
