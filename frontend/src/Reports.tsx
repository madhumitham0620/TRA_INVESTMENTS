
import { useCallback, useEffect, useMemo, useState } from 'react';
import './Reports.css';

type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES_EXECUTIVE'
  | 'CUSTOMER';

type ReportType =
  | 'customers'
  | 'staff'
  | 'agreements'
  | 'investments'
  | 'interest'
  | 'withdrawals'
  | 'payments'
  | 'performance'
  | 'audit';

interface ReportsProps {
  role: UserRole;
}

interface ReportResponse {
  success: boolean;
  type: string;
  role: UserRole;
  count: number;
  rows: Record<string, unknown>[];
  message?: string;
}

const API_URL = 'http://localhost:4000/api/reports';

const REPORTS: Record<
  UserRole,
  { id: ReportType; label: string; description: string; icon: string }[]
> = {
  ADMIN: [
    { id: 'customers', label: 'Customer Reports', description: 'Customer registrations and investment activity', icon: '♙' },
    { id: 'staff', label: 'Staff Reports', description: 'Staff accounts and assigned customers', icon: '♧' },
    { id: 'agreements', label: 'Agreement Reports', description: 'Agreement status and approval information', icon: '▤' },
    { id: 'investments', label: 'Investment Reports', description: 'Investment principal and agreement details', icon: '₹' },
    { id: 'interest', label: 'Interest Reports', description: 'Estimated interest on approved investments', icon: '%' },
    { id: 'withdrawals', label: 'Withdrawal Reports', description: 'Withdrawal requests and their status', icon: '↗' },
    { id: 'payments', label: 'Payment Reports', description: 'Completed withdrawal payments', icon: '⇄' },
    { id: 'performance', label: 'Performance Reports', description: 'Staff agreement and customer performance', icon: '▥' },
    { id: 'audit', label: 'Audit Logs', description: 'Recorded user and platform activities', icon: '◷' },
  ],
  MANAGER: [
    { id: 'customers', label: 'Customer Reports', description: 'Customer registrations and investment activity', icon: '♙' },
    { id: 'agreements', label: 'Agreement Reports', description: 'Agreement status and approval information', icon: '▤' },
    { id: 'investments', label: 'Investment Reports', description: 'Investment principal and agreement details', icon: '₹' },
    { id: 'interest', label: 'Interest Reports', description: 'Estimated interest on approved investments', icon: '%' },
    { id: 'withdrawals', label: 'Withdrawal Reports', description: 'Withdrawal requests and their status', icon: '↗' },
    { id: 'payments', label: 'Payment Reports', description: 'Completed withdrawal payments', icon: '⇄' },
    { id: 'performance', label: 'Performance Reports', description: 'Staff agreement and customer performance', icon: '▥' },
  ],
  SALES_EXECUTIVE: [
    { id: 'customers', label: 'My Customer Reports', description: 'Customers assigned to you', icon: '♙' },
    { id: 'agreements', label: 'Agreement Reports', description: 'Agreements created by you or linked to your customers', icon: '▤' },
    { id: 'investments', label: 'Investment Reports', description: 'Investment details for your customers', icon: '₹' },
    { id: 'interest', label: 'Interest Reports', description: 'Estimated interest for your customers', icon: '%' },
    { id: 'withdrawals', label: 'Withdrawal Reports', description: 'Withdrawal requests linked to your customers', icon: '↗' },
    { id: 'payments', label: 'Payment Reports', description: 'Completed payments linked to your customers', icon: '⇄' },
    { id: 'performance', label: 'My Performance', description: 'Your agreement and customer performance', icon: '▥' },
  ],
  CUSTOMER: [
    { id: 'investments', label: 'My Investment Reports', description: 'Your approved investment details', icon: '₹' },
    { id: 'agreements', label: 'My Agreement Reports', description: 'Your approved agreements', icon: '▤' },
    { id: 'interest', label: 'My Interest Reports', description: 'Estimated interest on your investments', icon: '%' },
    { id: 'withdrawals', label: 'My Withdrawal Reports', description: 'Your withdrawal requests', icon: '↗' },
    { id: 'payments', label: 'My Payment Reports', description: 'Your completed withdrawal payments', icon: '⇄' },
  ],
};

const LABELS: Record<string, string> = {
  id: 'ID',
  userId: 'User ID',
  fullName: 'Full Name',
  email: 'Email',
  role: 'Role',
  status: 'Status',
  createdAt: 'Created Date',
  customerName: 'Customer',
  customerUserId: 'Customer ID',
  salesExecutive: 'Sales Executive',
  agreementCount: 'Agreements',
  approvedPrincipal: 'Approved Principal',
  agreementsCreated: 'Agreements Created',
  assignedCustomers: 'Assigned Customers',
  approvedAgreements: 'Approved Agreements',
  approvedPrincipal: 'Approved Principal',
  agreementNumber: 'Agreement Number',
  principalAmount: 'Principal Amount',
  interestRate: 'Interest Rate (%)',
  startDate: 'Start Date',
  endDate: 'End Date',
  elapsedDays: 'Elapsed Days',
  estimatedInterest: 'Estimated Interest',
  managerRemarks: 'Manager Remarks',
  createdByName: 'Created By',
  requestNumber: 'Request Number',
  principal: 'Principal',
  accruedInterest: 'Accrued Interest',
  totalAmount: 'Total Amount',
  reason: 'Reason',
  paymentReference: 'Payment Reference',
  requestedAt: 'Requested Date',
  reviewedAt: 'Reviewed Date',
  paidAt: 'Paid Date',
  reviewedByName: 'Reviewed By',
  paidByName: 'Paid By',
  action: 'Action',
  details: 'Details',
  ipAddress: 'IP Address',
  actorName: 'Performed By',
  actorUserId: 'Actor ID',
  targetName: 'Target User',
  targetUserId: 'Target ID',
};

const MONEY_FIELDS = new Set([
  'principalAmount',
  'principal',
  'accruedInterest',
  'totalAmount',
  'estimatedInterest',
  'approvedPrincipal',
]);

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  if (MONEY_FIELDS.has(key)) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number.toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      });
    }
  }

  if (key === 'interestRate') {
    return `${value}%`;
  }

  if (key === 'createdAt' || key.endsWith('At')) {
    const date = new Date(String(value));

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('en-IN');
    }
  }

  if (
    key === 'startDate' ||
    key === 'endDate'
  ) {
    const date = new Date(String(value));

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-IN');
    }
  }

  return String(value);
}

function Reports({ role }: ReportsProps) {
  const availableReports = REPORTS[role];

  const [selectedType, setSelectedType] = useState<ReportType>(
    availableReports[0].id,
  );

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const selectedReport = availableReports.find(
    (report) => report.id === selectedType,
  );

  const fetchReport = useCallback(async () => {
    const token = sessionStorage.getItem('tra-invest-token');

    if (!token) {
      setError('Your session has expired. Please log in again.');
      setRows([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        type: selectedType,
      });

      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());

      const response = await fetch(
        `${API_URL}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data: ReportResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Unable to load report.',
        );
      }

      setRows(data.rows || []);
      setLastUpdated(new Date().toLocaleString('en-IN'));
    } catch (err) {
      setRows([]);
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while loading the report.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedType, from, to, status, search]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];

    return Object.keys(rows[0]).filter(
      (key) => key !== 'paymentProofPath',
    );
  }, [rows]);

  const exportCSV = () => {
    if (!rows.length || !columns.length) {
      return;
    }

    const escapeCSV = (value: unknown) => {
      const text =
        value === null || value === undefined
          ? ''
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);

      return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = [
      columns.map((column) => escapeCSV(LABELS[column] || column)),
      ...rows.map((row) =>
        columns.map((column) => escapeCSV(row[column])),
      ),
    ]
      .map((line) => line.join(','))
      .join('\r\n');

    const blob = new Blob(
      ['\uFEFF' + csv],
      { type: 'text/csv;charset=utf-8;' },
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `TRA-Invest-${selectedType}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch('');
    setFrom('');
    setTo('');
    setStatus('');
  };

  return (
    <div className="reports-page">
      <div className="reports-heading">
        <div>
          <span className="reports-eyebrow">
            TRA INVEST / ANALYTICS
          </span>

          <h1>Reports & Analytics</h1>

          <p>
            View, filter and export investment management reports.
          </p>
        </div>

        <button
          className="reports-refresh"
          onClick={() => void fetchReport()}
          disabled={loading}
        >
          ↻ {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="reports-role">
        <span>Logged in as</span>
        <strong>
          {role.replace(/_/g, ' ')}
        </strong>
      </div>

      <section className="reports-categories">
        <div className="reports-section-heading">
          <div>
            <h2>Available Reports</h2>
            <p>Select a report category to view its records.</p>
          </div>
        </div>

        <div className="reports-category-grid">
          {availableReports.map((report) => (
            <button
              key={report.id}
              className={`reports-category ${
                selectedType === report.id ? 'active' : ''
              }`}
              onClick={() => setSelectedType(report.id)}
            >
              <span className="reports-category-icon">
                {report.icon}
              </span>

              <span className="reports-category-content">
                <strong>{report.label}</strong>
                <small>{report.description}</small>
              </span>

              <span className="reports-category-arrow">→</span>
            </button>
          ))}
        </div>
      </section>

      <section className="reports-data-section">
        <div className="reports-data-heading">
          <div>
            <h2>{selectedReport?.label || 'Report Details'}</h2>
            <p>{selectedReport?.description}</p>
          </div>

          <button
            className="reports-export"
            onClick={exportCSV}
            disabled={loading || rows.length === 0}
          >
            ↓ Export CSV
          </button>
        </div>

        <div className="reports-filters">
          <div className="reports-filter search-filter">
            <label htmlFor="report-search">Search</label>
            <input
              id="report-search"
              type="search"
              placeholder="Search records..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="reports-filter">
            <label htmlFor="report-from">From Date</label>
            <input
              id="report-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div className="reports-filter">
            <label htmlFor="report-to">To Date</label>
            <input
              id="report-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <div className="reports-filter">
            <label htmlFor="report-status">Status</label>
            <select
              id="report-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="INACTIVE">Inactive</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SENT_BACK">Sent Back</option>
              <option value="PROCESSING">Processing</option>
              <option value="PAID">Paid</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          <button
            className="reports-clear"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        </div>

        <div className="reports-summary">
          <div className="reports-summary-card">
            <span>Total Records</span>
            <strong>{rows.length}</strong>
          </div>

          <div className="reports-summary-card">
            <span>Report Category</span>
            <strong>{selectedReport?.label}</strong>
          </div>

          <div className="reports-summary-card">
            <span>Last Updated</span>
            <strong>{lastUpdated || '—'}</strong>
          </div>
        </div>

        {error && (
          <div className="reports-error">
            <strong>Unable to load report</strong>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="reports-empty">
            <div className="reports-loader" />
            <p>Loading report data...</p>
          </div>
        ) : !error && rows.length === 0 ? (
          <div className="reports-empty">
            <span className="reports-empty-icon">▤</span>
            <h3>No records found</h3>
            <p>
              There are no records matching your selected filters.
            </p>
          </div>
        ) : !error ? (
          <div className="reports-table-wrapper">
            <table className="reports-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>
                      {LABELS[column] || column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr key={String(row.id ?? index)}>
                    {columns.map((column) => (
                      <td key={column}>
                        {column === 'status' ? (
                          <span
                            className={`reports-status status-${String(
                              row[column],
                            ).toLowerCase()}`}
                          >
                            {String(row[column] ?? '—').replace(/_/g, ' ')}
                          </span>
                        ) : (
                          formatValue(column, row[column])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="reports-footer">
          <span>
            Showing {rows.length} record(s). Maximum 1,000 records per report.
          </span>

          <span>TRA Invest Management Platform</span>
        </div>
      </section>
    </div>
  );
}

export default Reports;
