
import { useEffect, useState } from 'react';
import './App.css';

const API = 'http://localhost:4000/api';

type AuditLog = {
  id: number;
  actorUserId?: string | null;
  actorName?: string | null;
  action: string;
  details?: unknown;
  createdAt: string;
};

type AuditResponse = {
  success?: boolean;
  rows?: AuditLog[];
  message?: string;
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      setLoading(true);
      setError('');

      try {
        const token = sessionStorage.getItem('tra-invest-token');

        if (!token) {
          throw new Error('Session expired. Please sign in again.');
        }

        const params = new URLSearchParams();
        params.set('type', 'audit');

        if (search.trim()) {
          params.set('search', search.trim());
        }

        if (from) {
          params.set('from', from);
        }

        if (to) {
          params.set('to', to);
        }

        const response = await fetch(
          `${API}/reports?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          },
        );

        const data: AuditResponse = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message || 'Unable to load audit logs.',
          );
        }

        const rows = Array.isArray(data.rows) ? data.rows : [];

        if (!cancelled) {
          setLogs(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load audit logs.',
          );
          setLogs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [search, from, to, refreshCount]);

  // --------------------------------------------------
  // DATE AND TIME FORMAT
  // --------------------------------------------------

  function formatDate(value: string | null | undefined) {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  // --------------------------------------------------
  // DETAILS FORMAT
  // --------------------------------------------------

  function formatDetails(value: unknown) {
    if (value == null || value === '') {
      return '—';
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return value;
      }
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '—';
    }
  }

  // --------------------------------------------------
  // CLEAR FILTERS
  // --------------------------------------------------

  function clearFilters() {
    setSearch('');
    setFrom('');
    setTo('');
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <section className="dashboard-content-card">
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-eyebrow">
            ADMINISTRATION
          </span>

          <h3>Audit Logs</h3>

          <p>
            Review recorded platform activities and user actions.
          </p>
        </div>

        <button
          type="button"
          className="quick-action-button"
          onClick={() => setRefreshCount((count) => count + 1)}
          disabled={loading}
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* FILTERS */}

      <div className="reports-filters">
        <input
          type="search"
          placeholder="Search actions, users or details"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <label>
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>

        <label>
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="quick-action-button"
          onClick={clearFilters}
          disabled={!search && !from && !to}
        >
          Clear Filters
        </button>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <div className="module-status-note" role="alert">
          {error}
        </div>
      )}

      {/* LOADING */}

      {loading ? (
        <p role="status">Loading audit logs…</p>
      ) : logs.length === 0 ? (
        <p>No audit records found for these filters.</p>
      ) : (
        /* AUDIT TABLE */

        <div style={{ overflowX: 'auto' }}>
          <table className="customers-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Performed By</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>

            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ minWidth: 190 }}>
                    {formatDate(log.createdAt)}
                  </td>

                  <td style={{ minWidth: 150 }}>
                    {log.actorName || log.actorUserId || 'System'}
                  </td>

                  <td style={{ minWidth: 140 }}>
                    {log.action}
                  </td>

                  <td
                    style={{
                      minWidth: 220,
                      maxWidth: 400,
                      overflowWrap: 'anywhere',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {formatDetails(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* RECORD COUNT */}

      <p className="field-hint">
        {logs.length} audit record(s) displayed.
      </p>
    </section>
  );
}
