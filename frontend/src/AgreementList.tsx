
import { useCallback, useEffect, useState } from 'react';

const API_URL = 'http://localhost:4000/api/agreements';

type Agreement = {
  id: number;
  agreementNumber: string;
  customerName?: string;
  principalAmount: number;
  interestRate: number;
  startDate: string;
  endDate: string;
  status: string;
  createdAt?: string;
};

type Props = {
  role: string;
};

export default function AgreementList({ role }: Props) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadAgreements = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = sessionStorage.getItem('tra-invest-token');

      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(API_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load agreements.');
      }

      setAgreements(
        Array.isArray(data.agreements) ? data.agreements : [],
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load agreements.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgreements();

    const handleUpdate = () => void loadAgreements();
    window.addEventListener('agreements:updated', handleUpdate);

    return () => {
      window.removeEventListener('agreements:updated', handleUpdate);
    };
  }, [loadAgreements]);

  const filteredAgreements = agreements.filter((agreement) => {
    const matchesSearch =
      agreement.agreementNumber?.toLowerCase().includes(search.toLowerCase()) ||
      agreement.customerName?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' || agreement.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

  const formatDate = (date: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IN');
  };

  return (
    <section className="agreement-list-page">
      <div className="agreement-list-header">
        <div>
          <h2>
            {role === 'CUSTOMER' ? 'My Agreements' : 'Investment Agreements'}
          </h2>
          <p>View and track investment agreement details and approval status.</p>
        </div>

        <button type="button" onClick={() => void loadAgreements()}>
          Refresh
        </button>
      </div>

      <div className="agreement-list-filters">
        <input
          type="search"
          placeholder="Search agreement number or customer..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_APPROVAL">Pending Approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="SENT_BACK">Sent Back</option>
        </select>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      {loading ? (
        <p>Loading investment agreements...</p>
      ) : filteredAgreements.length === 0 ? (
        <div className="agreement-empty-state">
          <h3>No investment agreements found</h3>
          <p>Agreements created by your team will appear here.</p>
        </div>
      ) : (
        <div className="agreement-table-wrapper">
          <table className="agreement-table">
            <thead>
              <tr>
                <th>Agreement No.</th>
                {role !== 'CUSTOMER' && <th>Customer</th>}
                <th>Principal</th>
                <th>Interest Rate</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgreements.map((agreement) => (
                <tr key={agreement.id}>
                  <td>{agreement.agreementNumber}</td>
                  {role !== 'CUSTOMER' && (
                    <td>{agreement.customerName || '—'}</td>
                  )}
                  <td>{formatAmount(agreement.principalAmount)}</td>
                  <td>{agreement.interestRate}%</td>
                  <td>{formatDate(agreement.startDate)}</td>
                  <td>{formatDate(agreement.endDate)}</td>
                  <td>
                    <span className={`agreement-status ${agreement.status.toLowerCase()}`}>
                      {agreement.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="agreement-result-count">
        Showing {filteredAgreements.length} of {agreements.length} agreements
      </p>
    </section>
  );
}
