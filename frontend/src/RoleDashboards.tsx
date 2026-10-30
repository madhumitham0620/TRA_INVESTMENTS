
import { useEffect, useState, type FormEvent } from 'react';
import { io } from 'socket.io-client';
import './App.css';

import AdminUserManagement from './AdminUserManagement';
import ManagerPendingApprovals from './ManagerPendingApprovals';
import CreateAgreement from './CreateAgreement';
import WithdrawalModule from './WithdrawalModule';
import ZerodhaPortfolio from './ZerodhaPortfolio';
import ProfileSettings from './ProfileSettings';
import AgreementList from './AgreementList';
import Reports from './Reports';
import AuditLogs from './AuditLogs';

type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES_EXECUTIVE'
  | 'CUSTOMER';

type DashboardUser = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  status?: 'PENDING' | 'ACTIVE' | 'INACTIVE';
  mustChangePassword?: boolean;
};

type RoleDashboardsProps = {
  user: DashboardUser;
  onLogout: () => void;
};

type MenuItem = {
  label: string;
  icon: string;
};

type DashboardMetric = {
  label: string;
  value: string;
  description: string;
};

type DashboardInfo = {
  title: string;
  subtitle: string;
  metrics: DashboardMetric[];
};

const API = 'http://localhost:4000/api';

function readToken(): string | null {
  return sessionStorage.getItem('tra-invest-token');
}

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  SALES_EXECUTIVE: 'Sales Executive',
  CUSTOMER: 'Customer',
};

const roleMenus: Record<UserRole, MenuItem[]> = {
  ADMIN: [
    { label: 'Overview', icon: '◫' },
    { label: 'User Management', icon: '♙' },
    { label: 'Create Agreement', icon: '+' },
    { label: 'Investment Agreements', icon: '▤' },
    { label: 'Customers', icon: '♧' },
    { label: 'Portfolio', icon: '▥' },
    { label: 'Withdrawals', icon: '↗' },
    { label: 'Reports', icon: '▧' },
    { label: 'Audit Logs', icon: '≡' },
  ],

  MANAGER: [
    { label: 'Overview', icon: '◫' },
    { label: 'Pending Approvals', icon: '✓' },
    { label: 'Investment Agreements', icon: '▤' },
    { label: 'Customers', icon: '♧' },
    { label: 'Portfolio', icon: '▥' },
    { label: 'Withdrawals', icon: '↗' },
    { label: 'Reports', icon: '▧' },
  ],

  SALES_EXECUTIVE: [
    { label: 'Overview', icon: '◫' },
    { label: 'Customers', icon: '♧' },
    { label: 'Create Agreement', icon: '+' },
    { label: 'Investment Agreements', icon: '▤' },
    { label: 'Portfolio', icon: '▥' },
    { label: 'Withdrawals', icon: '↗' },
    { label: 'Reports', icon: '▧' },
  ],

  CUSTOMER: [
    { label: 'Overview', icon: '◫' },
    { label: 'My Investments', icon: '▥' },
    { label: 'My Agreements', icon: '▤' },
    { label: 'Withdrawals', icon: '↗' },
    { label: 'My Profile', icon: '♙' },
    { label: 'Reports', icon: '▧' },
  ],
};

const dashboardInfo: Record<UserRole, DashboardInfo> = {
  ADMIN: {
    title: 'Administrator Dashboard',
    subtitle:
      'Manage users, investment operations, agreements, and system activity.',
    metrics: [
      {
        label: 'Total Users',
        value: '0',
        description: 'Registered platform users',
      },
      {
        label: 'Active Customers',
        value: '0',
        description: 'Customers with active accounts',
      },
      {
        label: 'Investment Agreements',
        value: '0',
        description: 'Agreements recorded in the system',
      },
      {
        label: 'Pending Actions',
        value: '0',
        description: 'Items requiring attention',
      },
    ],
  },

  MANAGER: {
    title: 'Manager Dashboard',
    subtitle:
      'Review agreement submissions, manage approvals, and monitor investment activity.',
    metrics: [
      {
        label: 'Pending Approvals',
        value: '0',
        description: 'Agreements awaiting review',
      },
      {
        label: 'Active Agreements',
        value: '0',
        description: 'Currently active agreements',
      },
      {
        label: 'Withdrawal Requests',
        value: '0',
        description: 'Requests awaiting processing',
      },
      {
        label: 'Customers',
        value: '0',
        description: 'Customers available for review',
      },
    ],
  },

  SALES_EXECUTIVE: {
    title: 'Sales Executive Dashboard',
    subtitle:
      'Support customers, create investment agreements, and monitor assigned activity.',
    metrics: [
      {
        label: 'My Customers',
        value: '0',
        description: 'Customers assigned to you',
      },
      {
        label: 'Agreements',
        value: '0',
        description: 'Agreements available for tracking',
      },
      {
        label: 'Active Investments',
        value: '0',
        description: 'Investments currently active',
      },
      {
        label: 'Follow-ups',
        value: '0',
        description: 'Customer actions to follow up',
      },
    ],
  },

  CUSTOMER: {
    title: 'My Investment Dashboard',
    subtitle:
      'View your investments, review agreements, and follow your interest and withdrawal activity.',
    metrics: [
      {
        label: 'My Investments',
        value: '0',
        description: 'Your recorded investments',
      },
      {
        label: 'Investment Balance',
        value: '₹0.00',
        description: 'Balance from your investment records',
      },
      {
        label: 'Interest Earned',
        value: '₹0.00',
        description: 'Interest from available records',
      },
      {
        label: 'My Agreements',
        value: '0',
        description: 'Your investment agreements',
      },
    ],
  },
};

function formatToday(): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
}

function formatCurrency(value: unknown): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '₹0.00';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function DashboardHome({ user }: { user: DashboardUser }) {
  const info = dashboardInfo[user.role];

  const [metrics, setMetrics] = useState<DashboardMetric[]>(
    info.metrics,
  );
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [metricsError, setMetricsError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardMetrics() {
      setLoadingMetrics(true);
      setMetricsError('');

      try {
        const token = readToken();

        if (!token) {
          throw new Error(
            'Your session was not found. Please sign in again.',
          );
        }

        const response = await fetch(`${API}/dashboard/stats`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const data: Record<string, any> = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message ||
              `Could not load dashboard data (HTTP ${response.status}).`,
          );
        }

        if (data.role && data.role !== user.role) {
          throw new Error(
            'The dashboard role does not match your account.',
          );
        }

        const values: Record<string, any> =
          data.stats && typeof data.stats === 'object'
            ? data.stats
            : data.metrics && typeof data.metrics === 'object'
              ? data.metrics
              : data;

        const metricKeys: Record<
          UserRole,
          Record<string, string>
        > = {
          ADMIN: {
            'Total Users': 'totalUsers',
            'Active Customers': 'totalCustomers',
            'Investment Agreements': 'totalAgreements',
            'Pending Actions': 'pendingApprovals',
          },

          MANAGER: {
            'Pending Approvals': 'pendingApprovals',
            'Active Agreements': 'activeAgreements',
            'Withdrawal Requests': 'withdrawalRequests',
            Customers: 'totalCustomers',
          },

          SALES_EXECUTIVE: {
            'My Customers': 'customersWithAgreements',
            Agreements: 'totalAgreements',
            'Active Investments': 'approvedAgreements',
            'Follow-ups': 'pendingApprovals',
          },

          CUSTOMER: {
            'My Investments': 'activeAgreements',
            'Investment Balance': 'approvedPrincipal',
            'Interest Earned': 'interestEarned',
            'My Agreements': 'totalAgreements',
          },
        };

        if (!cancelled) {
          const updatedMetrics = info.metrics.map((metric) => {
            const key = metricKeys[user.role][metric.label];
            const rawValue = values[key];

            if (rawValue === undefined || rawValue === null) {
              return {
                ...metric,
                value:
                  metric.label === 'Interest Earned' ||
                  metric.label === 'Withdrawal Requests'
                    ? '—'
                    : metric.value,
              };
            }

            const isCurrency =
              metric.label === 'Investment Balance' ||
              metric.label === 'Interest Earned';

            return {
              ...metric,
              value: isCurrency
                ? formatCurrency(rawValue)
                : String(rawValue),
            };
          });

          setMetrics(updatedMetrics);
        }
      } catch (err) {
        if (!cancelled) {
          setMetricsError(
            err instanceof Error
              ? err.message
              : 'Unable to load dashboard figures.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingMetrics(false);
        }
      }
    }

    void loadDashboardMetrics();

    return () => {
      cancelled = true;
    };
  }, [user.role, refreshCount]);

  useEffect(() => {
    const refresh = () => {
      setRefreshCount((count) => count + 1);
    };

    const events = [
      'tra-invest:customers-updated',
      'tra-invest:agreements-updated',
      'tra-invest:withdrawals-updated',
      'tra-invest:portfolio-updated',
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, refresh);
    });

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, refresh);
      });
    };
  }, []);

  return (
    <>
      <section className="dashboard-welcome">
        <div className="welcome-copy">
          <span className="dashboard-eyebrow">
            TRA INVEST / YOUR WORKSPACE
          </span>

          <h2>
            Welcome back, {user.fullName || user.userId}!
          </h2>

          <p>{info.subtitle}</p>

          <div className="welcome-role">
            <span className="welcome-role-dot" />
            {roleLabels[user.role]} Workspace
          </div>
        </div>

        <div className="dashboard-date">
          <span>Today</span>
          <strong>{formatToday()}</strong>
        </div>
      </section>

      <div className="dashboard-section-heading">
        <div>
          <h3>{info.title}</h3>
          <p>Your workspace at a glance</p>
        </div>

        <button
          type="button"
          className="quick-action-button"
          onClick={() => setRefreshCount((count) => count + 1)}
          disabled={loadingMetrics}
        >
          {loadingMetrics ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {metricsError && (
        <div className="module-status-note" role="alert">
          {metricsError}
        </div>
      )}

      <section className="dashboard-metrics">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-card-top">
              <span>{metric.label}</span>
              <span className="metric-card-mark">◆</span>
            </div>

            <strong className="metric-value">
              {loadingMetrics ? '...' : metric.value}
            </strong>

            <p>{metric.description}</p>
          </article>
        ))}
      </section>
    </>
  );
}

type Customer = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role?: string;
  status?: string;
  createdAt?: string;
  assignedSalesExecutiveId?: string | null;
  assignedSalesExecutiveName?: string | null;
};

type StaffUser = {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  status?: string;
};

function CustomersModule({ role }: { role: UserRole }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesExecutives, setSalesExecutives] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [savingCustomerId, setSavingCustomerId] = useState('');
  const [assignmentChoices, setAssignmentChoices] = useState<
    Record<string, string>
  >({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [newCustomer, setNewCustomer] = useState({
    fullName: '',
    userId: '',
    email: '',
    password: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError('');

      try {
        const token = readToken();

        if (!token) {
          throw new Error(
            'Your sign-in session was not found. Please sign out and sign in again.',
          );
        }

        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        };

        const customerResponse = await fetch(`${API}/customers`, {
          headers,
        });

        const customerData: any = await customerResponse
          .json()
          .catch(() => ({}));

        if (!customerResponse.ok) {
          throw new Error(
            customerData.message ||
              `Could not load customers (HTTP ${customerResponse.status}).`,
          );
        }

        const customerRows = Array.isArray(customerData)
          ? customerData
          : Array.isArray(customerData.customers)
            ? customerData.customers
            : [];

        let staffRows: StaffUser[] = [];

        if (role === 'ADMIN') {
          const staffResponse = await fetch(`${API}/admin/users`, {
            headers,
          });

          const staffData: any = await staffResponse
            .json()
            .catch(() => ({}));

          if (!staffResponse.ok) {
            throw new Error(
              staffData.message ||
                `Could not load staff (HTTP ${staffResponse.status}).`,
            );
          }

          const allUsers: StaffUser[] = Array.isArray(staffData.users)
            ? staffData.users
            : [];

          staffRows = allUsers.filter(
            (item) =>
              item.role === 'SALES_EXECUTIVE' &&
              item.status === 'ACTIVE',
          );
        }

        if (!cancelled) {
          setCustomers(customerRows as Customer[]);
          setSalesExecutives(staffRows);

          setAssignmentChoices(
            Object.fromEntries(
              (customerRows as Customer[]).map((customer) => [
                customer.id,
                customer.assignedSalesExecutiveId || '',
              ]),
            ),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load customers.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [role, refreshCount]);

  useEffect(() => {
    const refresh = () => {
      setRefreshCount((count) => count + 1);
    };

    window.addEventListener('tra-invest:customers-updated', refresh);
    window.addEventListener('tra-invest:agreements-updated', refresh);

    const pollId = window.setInterval(refresh, 15000);

    return () => {
      window.removeEventListener('tra-invest:customers-updated', refresh);
      window.removeEventListener('tra-invest:agreements-updated', refresh);
      window.clearInterval(pollId);
    };
  }, []);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    const token = readToken();

    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    setCreatingCustomer(true);

    try {
      const response = await fetch(`${API}/admin/customers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          fullName: newCustomer.fullName.trim(),
          userId: newCustomer.userId.trim(),
          email: newCustomer.email.trim(),
          password: newCustomer.password,
        }),
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const validationMessage = data.errors
          ? Object.values(data.errors)
              .flat()
              .filter(Boolean)
              .join(' ')
          : '';

        throw new Error(
          validationMessage ||
            data.message ||
            `Could not create customer (HTTP ${response.status}).`,
        );
      }

      setNotice(data.message || 'Customer account created successfully.');

      setNewCustomer({
        fullName: '',
        userId: '',
        email: '',
        password: '',
      });

      setShowCreateForm(false);
      setRefreshCount((count) => count + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create the customer account.',
      );
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function saveAssignment(customer: Customer) {
    const token = readToken();

    if (!token) {
      setError('Your sign-in session was not found. Please sign in again.');
      return;
    }

    setSavingCustomerId(customer.id);
    setError('');
    setNotice('');

    try {
      const response = await fetch(
        `${API}/admin/customers/${encodeURIComponent(customer.id)}/assign`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            assignedSalesExecutiveId:
              assignmentChoices[customer.id] || null,
          }),
        },
      );

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            `Assignment failed (HTTP ${response.status}).`,
        );
      }

      const chosen = salesExecutives.find(
        (staff) =>
          staff.id === (assignmentChoices[customer.id] || ''),
      );

      setCustomers((current) =>
        current.map((item) =>
          item.id === customer.id
            ? {
                ...item,
                assignedSalesExecutiveId:
                  assignmentChoices[customer.id] || null,
                assignedSalesExecutiveName: chosen?.fullName || null,
              }
            : item,
        ),
      );

      setNotice(`Assignment updated for ${customer.fullName}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not update customer assignment.',
      );
    } finally {
      setSavingCustomerId('');
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const query = search.trim().toLowerCase();

    return (
      !query ||
      [
        customer.userId,
        customer.fullName,
        customer.email,
        customer.status,
        customer.assignedSalesExecutiveName,
      ].some((value) =>
        (value || '').toLowerCase().includes(query),
      )
    );
  });

  return (
    <section className="dashboard-content-card customers-module">
      <div className="dashboard-section-heading">
        <div>
          <h3>Customer Management</h3>
          <p>
            {role === 'ADMIN'
              ? 'Manage customers and assign them to Sales Executives.'
              : 'Create and manage your customer accounts.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(role === 'ADMIN' || role === 'SALES_EXECUTIVE') && (
            <button
              type="button"
              className="quick-action-button"
              onClick={() => {
                setShowCreateForm((current) => !current);
                setError('');
                setNotice('');
              }}
            >
              {showCreateForm ? 'Cancel' : '+ Create Customer'}
            </button>
          )}

          <button
            type="button"
            className="quick-action-button"
            onClick={() => setRefreshCount((count) => count + 1)}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {showCreateForm &&
        (role === 'ADMIN' || role === 'SALES_EXECUTIVE') && (
          <form
            className="dashboard-content-card"
            onSubmit={createCustomer}
            style={{ marginBottom: 20 }}
          >
            <h3>Create Customer Account</h3>

            <div className="form-field">
              <label htmlFor="customer-full-name">Full Name</label>
              <input
                id="customer-full-name"
                value={newCustomer.fullName}
                onChange={(event) =>
                  setNewCustomer((current) => ({
                    ...current,
                    fullName: event.target.value,
                  }))
                }
                minLength={2}
                maxLength={120}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="customer-user-id">User ID</label>
              <input
                id="customer-user-id"
                value={newCustomer.userId}
                onChange={(event) =>
                  setNewCustomer((current) => ({
                    ...current,
                    userId: event.target.value,
                  }))
                }
                pattern="[A-Za-z0-9_-]+"
                minLength={3}
                maxLength={40}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="customer-email">Email Address</label>
              <input
                id="customer-email"
                type="email"
                value={newCustomer.email}
                onChange={(event) =>
                  setNewCustomer((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                maxLength={254}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="customer-password">
                Temporary Password
              </label>
              <input
                id="customer-password"
                type="password"
                value={newCustomer.password}
                onChange={(event) =>
                  setNewCustomer((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
              <p className="field-hint">
                Use at least 12 characters, including uppercase and lowercase
                letters, a number, and a special character.
              </p>
            </div>

            <button
              type="submit"
              className="auth-submit"
              disabled={creatingCustomer}
            >
              {creatingCustomer
                ? 'Creating Customer…'
                : 'Create Customer'}
            </button>
          </form>
        )}

      <label htmlFor="customer-search" className="customer-search-label">
        Search customers
      </label>

      <input
        id="customer-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by user ID, name, email, status"
        className="customer-search-input"
      />

      {loading && <p role="status">Loading customers…</p>}

      {error && (
        <div role="alert" className="module-status-note">
          <p>{error}</p>
          <button
            type="button"
            className="quick-action-button"
            onClick={() => setRefreshCount((count) => count + 1)}
          >
            Try Again
          </button>
        </div>
      )}

      {notice && (
        <p role="status" className="module-status-note">
          {notice}
        </p>
      )}

      {!loading && !error && (
        <>
          <p>{filteredCustomers.length} customer(s) found</p>

          {role === 'ADMIN' && salesExecutives.length === 0 && (
            <p className="module-status-note">
              No active Sales Executives are available. Create or activate a
              Sales Executive account in User Management first.
            </p>
          )}

          {filteredCustomers.length === 0 ? (
            <p>No customers match your search.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="customers-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    {role === 'ADMIN' && (
                      <th>Assign Sales Executive</th>
                    )}
                    <th>Registered</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.userId || '—'}</td>
                      <td>{customer.fullName || '—'}</td>
                      <td>{customer.email || '—'}</td>
                      <td>{customer.status || '—'}</td>

                      {role === 'ADMIN' && (
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              minWidth: 240,
                            }}
                          >
                            <select
                              aria-label={`Assign ${customer.fullName} to Sales Executive`}
                              value={assignmentChoices[customer.id] || ''}
                              onChange={(event) =>
                                setAssignmentChoices((current) => ({
                                  ...current,
                                  [customer.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Unassigned</option>

                              {salesExecutives.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                  {staff.fullName} ({staff.userId})
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              className="quick-action-button"
                              disabled={
                                savingCustomerId === customer.id ||
                                (assignmentChoices[customer.id] || '') ===
                                  (customer.assignedSalesExecutiveId || '')
                              }
                              onClick={() => void saveAssignment(customer)}
                            >
                              {savingCustomerId === customer.id
                                ? 'Saving…'
                                : 'Save'}
                            </button>
                          </div>
                        </td>
                      )}

                      <td>
                        {customer.createdAt
                          ? new Date(customer.createdAt).toLocaleDateString(
                              'en-IN',
                            )
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PlaceholderModule({
  page,
  role,
}: {
  page: string;
  role: UserRole;
}) {
  const descriptions: Record<string, string> = {
    'My Investments':
      'Your investment holdings and balances will appear here.',
    'Interest & Statements':
      'Interest calculations and downloadable statements will appear here.',
    Reports: 'Reports and investment summaries will appear here.',
    'Audit Logs':
      'Recorded user activities and audit events will appear here.',
  };

  return (
    <section className="dashboard-content-card placeholder-module">
      <div className="module-icon">▤</div>

      <span className="dashboard-eyebrow">
        {roleLabels[role]} WORKSPACE
      </span>

      <h3>{page}</h3>

      <p>
        {descriptions[page] ||
          `The ${page.toLowerCase()} module will appear here.`}
      </p>

      <div className="module-status-note">
        This page is a UI placeholder. Live data and actions must be connected
        to the backend before this module is functional.
      </div>
    </section>
  );
}

export default function RoleDashboards({
  user,
  onLogout,
}: RoleDashboardsProps) {
  const [activePage, setActivePage] = useState('Overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menu = roleMenus[user.role] || roleMenus.CUSTOMER;

  function navigateTo(page: string) {
    if (menu.some((item) => item.label === page)) {
      setActivePage(page);
      setSidebarOpen(false);
    }
  }

  useEffect(() => {
    const token = readToken();

    if (!token) return;

    const socket = io('http://localhost:4000', {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    const notify = (eventName: string, payload: unknown) => {
      window.dispatchEvent(
        new CustomEvent(eventName, { detail: payload }),
      );
    };

    socket.on('connect', () => {
      console.info('TRA Invest live updates connected.');
    });

    socket.on('connect_error', (error) => {
      console.warn(
        'TRA Invest live updates connection failed:',
        error.message,
      );
    });

    socket.on('agreements:updated', (payload) => {
      notify('tra-invest:agreements-updated', payload);
    });

    socket.on('customers:updated', (payload) => {
      notify('tra-invest:customers-updated', payload);
    });

    socket.on('withdrawals:updated', (payload) => {
      notify('tra-invest:withdrawals-updated', payload);
    });

    socket.on('portfolio:updated', (payload) => {
      notify('tra-invest:portfolio-updated', payload);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  function renderActivePage() {
    if (activePage === 'Overview') {
      return <DashboardHome user={user} />;
    }

    if (activePage === 'Customers') {
      return <CustomersModule role={user.role} />;
    }

    if (
      activePage === 'Investment Agreements' ||
      activePage === 'My Agreements'
    ) {
      return <AgreementList role={user.role} />;
    }

    if (
      user.role === 'ADMIN' &&
      activePage === 'User Management'
    ) {
      return <AdminUserManagement />;
    }

    if (
      user.role === 'MANAGER' &&
      activePage === 'Pending Approvals'
    ) {
      return <ManagerPendingApprovals />;
    }

    if (
      (user.role === 'ADMIN' ||
        user.role === 'SALES_EXECUTIVE') &&
      activePage === 'Create Agreement'
    ) {
      return <CreateAgreement />;
    }

    if (activePage === 'Portfolio') {
      return <ZerodhaPortfolio />;
    }

    if (activePage === 'Withdrawals') {
      return <WithdrawalModule user={user} />;
    }
    if (user.role === 'ADMIN' && activePage === 'Audit Logs') {
  return <AuditLogs />;
}

    if (
      user.role === 'CUSTOMER' &&
      activePage === 'My Profile'
    ) {
      return <ProfileSettings onLogout={onLogout} />;
    }
    if (activePage === 'Reports') {
  return <Reports role={user.role} />;
}

    return (
      <PlaceholderModule
        page={activePage}
        role={user.role}
      />
    );
  }

  return (
    <div className="dashboard-app">
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`dashboard-sidebar ${
          sidebarOpen ? 'sidebar-open' : ''
        }`}
      >
        <div className="sidebar-brand">
          <img
            src="/tra-invest-logo.png"
            alt="TRA Invest"
            className="sidebar-logo-full"
          />
        </div>

        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {(user.fullName || user.userId || 'U')
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="sidebar-user-details">
            <strong>{user.fullName || user.userId}</strong>
            <span>{roleLabels[user.role]}</span>
          </div>
        </div>

        <div className="sidebar-menu-label">WORKSPACE</div>

        <nav className="sidebar-navigation">
          {menu.map((item) => (
            <button
              type="button"
              key={item.label}
              className={`sidebar-nav-item ${
                activePage === item.label ? 'active' : ''
              }`}
              onClick={() => navigateTo(item.label)}
            >
              <span className="sidebar-nav-icon" aria-hidden="true">
                {item.icon}
              </span>

              <span>{item.label}</span>

              {activePage === item.label && (
                <span className="sidebar-active-indicator" />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-security">
            <span className="security-dot" />
            <span>Secure Workspace</span>
          </div>

          <button
            type="button"
            className="sidebar-logout"
            onClick={onLogout}
          >
            <span aria-hidden="true">↪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="dashboard-mobile-menu"
              aria-label="Toggle navigation menu"
              onClick={() => setSidebarOpen((current) => !current)}
            >
              ☰
            </button>

            {activePage !== 'Overview' && (
              <button
                type="button"
                className="topbar-back"
                aria-label="Back to Overview"
                title="Back to Overview"
                onClick={() => navigateTo('Overview')}
              >
                ←
              </button>
            )}

            <div>
              <span className="topbar-breadcrumb">
                TRA Invest / {roleLabels[user.role]}
                {activePage !== 'Overview' && ` / ${activePage}`}
              </span>

              <h1>{activePage}</h1>
            </div>
          </div>

          <div className="topbar-right">
            <div className="topbar-date">
              <span>{formatToday()}</span>
            </div>

            <div className="topbar-user">
              <div className="topbar-avatar">
                {(user.fullName || user.userId || 'U')
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="topbar-user-text">
                <strong>{user.fullName || user.userId}</strong>
                <span>{roleLabels[user.role]}</span>
              </div>
            </div>

            <button
              type="button"
              className="topbar-logout"
              onClick={onLogout}
              title="Sign out"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="dashboard-page-content">
          {renderActivePage()}
        </main>

        <footer className="dashboard-footer">
          <span>TRA Invest · Investment Management Platform</span>
          <span>© {new Date().getFullYear()} TRA Invest</span>
        </footer>
      </div>
    </div>
  );
}
