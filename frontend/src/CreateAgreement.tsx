import { useEffect, useState, type FormEvent } from 'react';

const API_URL = 'http://localhost:4000/api/agreements';

type Customer = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
};

type Props = {
  onCreated?: () => void;
};

export default function CreateAgreement({ onCreated }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitForApproval, setSubmitForApproval] = useState(true);

  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      setLoadingCustomers(true);
      setError('');

      try {
        const token = sessionStorage.getItem('tra-invest-token');

        if (!token) {
          throw new Error('Please sign in again.');
        }

        const response = await fetch(`${API_URL}/customers`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load customers.');
        }

        if (!cancelled) {
          setCustomers(Array.isArray(data.customers) ? data.customers : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to load customers.',
          );
        }
      } finally {
        if (!cancelled) setLoadingCustomers(false);
      }
    }

    void loadCustomers();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!customerId) {
      setError('Please select a customer.');
      return;
    }

    if (new Date(`${endDate}T00:00:00`) <= new Date(`${startDate}T00:00:00`)) {
      setError('End date must be after the start date.');
      return;
    }

    setSaving(true);

    try {
      const token = sessionStorage.getItem('tra-invest-token');

      if (!token) {
        throw new Error('Please sign in again.');
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          customerId,
          principalAmount: Number(principalAmount),
          interestRate: Number(interestRate),
          startDate,
          endDate,
          submitForApproval,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Unable to create agreement.');
      }

      setNotice(data.message || 'Agreement created successfully.');
      setCustomerId('');
      setPrincipalAmount('');
      setInterestRate('');
      setStartDate('');
      setEndDate('');
      setSubmitForApproval(true);
      onCreated?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create agreement.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="create-agreement-page">
      <h2>Create Investment Agreement</h2>
      <p>Select an active customer and enter the investment terms.</p>

      {error && <div role="alert" className="form-error">{error}</div>}
      {notice && <div role="status" className="form-success">{notice}</div>}

      <form onSubmit={handleSubmit} className="create-agreement-form">
        <label htmlFor="customerId">Customer *</label>
        <select
          id="customerId"
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          required
          disabled={loadingCustomers || saving}
        >
          <option value="">
            {loadingCustomers ? 'Loading customers...' : 'Select a customer'}
          </option>

          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.fullName} ({customer.userId})
            </option>
          ))}
        </select>

        {!loadingCustomers && customers.length === 0 && !error && (
          <p>No active customers found. Register or activate a customer first.</p>
        )}

        <label htmlFor="principalAmount">Investment Amount (₹) *</label>
        <input
          id="principalAmount"
          type="number"
          min="0.01"
          step="0.01"
          value={principalAmount}
          onChange={(event) => setPrincipalAmount(event.target.value)}
          required
          disabled={saving}
        />

        <label htmlFor="interestRate">Interest Rate (%) *</label>
        <input
          id="interestRate"
          type="number"
          min="0.0001"
          max="100"
          step="0.0001"
          value={interestRate}
          onChange={(event) => setInterestRate(event.target.value)}
          required
          disabled={saving}
        />

        <label htmlFor="startDate">Start Date *</label>
        <input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          required
          disabled={saving}
        />

        <label htmlFor="endDate">End Date *</label>
        <input
          id="endDate"
          type="date"
          min={startDate || undefined}
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          required
          disabled={saving}
        />

        <label className="submit-approval-option">
          <input
            type="checkbox"
            checked={submitForApproval}
            onChange={(event) => setSubmitForApproval(event.target.checked)}
            disabled={saving}
          />
          Submit directly for manager approval
        </label>

        <button type="submit" disabled={saving || loadingCustomers}>
          {saving
            ? 'Saving...'
            : submitForApproval
              ? 'Create & Submit for Approval'
              : 'Save as Draft'}
        </button>
      </form>
    </section>
  );
}