import { useCallback, useEffect, useState } from 'react';

type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES_EXECUTIVE'
  | 'AUDITOR'
  | 'CUSTOMER';

export type DashboardUser = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
};

type Agreement = {
  id: string;
  agreementNumber: string;
  customerName?: string;
  customerId?: string;
  principal: number;
  accruedInterest?: number;
  totalBalance?: number;
  status: string;
};

type WithdrawalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT_BACK'
  | 'PROCESSING'
  | 'PAID'
  | 'CLOSED';

type Withdrawal = {
  id: string;
  requestNumber: string;
  agreementId: string;
  agreementNumber: string;
  customerName?: string;
  customerId?: string;
  principal: number;
  accruedInterest: number;
  totalAmount: number;
  bankAccountLast4?: string;
  reason?: string;
  status: WithdrawalStatus;
  managerRemarks?: string;
  paymentReference?: string;
  paymentProofUrl?: string;
  requestedAt: string;
  reviewedAt?: string;
  paidAt?: string;
};

type Notice = {
  type: 'success' | 'error';
  message: string;
};

type Props = {
  user: DashboardUser;
};

const API_URL = 'http://localhost:4000/api';

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    minHeight: '100%',
    padding: '24px',
    boxSizing: 'border-box',
    color: '#172033',
    background: '#f5f7fb',
    fontFamily: 'Inter, Arial, sans-serif',
  },
  heading: {
    fontSize: '26px',
    fontWeight: 750,
    margin: '0 0 7px',
    color: '#172033',
  },
  subtitle: {
    color: '#64748b',
    margin: '0 0 24px',
    fontSize: '14px',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
    marginBottom: '24px',
  },
  card: {
    background: '#fff',
    border: '1px solid #e5eaf2',
    borderRadius: '12px',
    padding: '18px',
    boxShadow: '0 2px 8px rgba(15,23,42,0.03)',
  },
  cardLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '10px',
  },
  cardValue: {
    fontSize: '25px',
    fontWeight: 750,
    color: '#172033',
  },
  panel: {
    background: '#fff',
    border: '1px solid #e5eaf2',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '22px',
    boxShadow: '0 2px 8px rgba(15,23,42,0.03)',
  },
  panelTitle: {
    fontSize: '17px',
    fontWeight: 700,
    margin: '0 0 18px',
    color: '#172033',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '15px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 650,
    color: '#475569',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 12px',
    border: '1px solid #d7deea',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    background: '#fff',
    color: '#172033',
  },
  button: {
    border: 'none',
    borderRadius: '8px',
    padding: '10px 15px',
    background: '#172554',
    color: '#fff',
    fontWeight: 650,
    fontSize: '13px',
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid #d7deea',
    borderRadius: '8px',
    padding: '9px 13px',
    background: '#fff',
    color: '#334155',
    fontWeight: 650,
    fontSize: '13px',
    cursor: 'pointer',
  },
  dangerButton: {
    border: 'none',
    borderRadius: '8px',
    padding: '9px 13px',
    background: '#b91c1c',
    color: '#fff',
    fontWeight: 650,
    fontSize: '13px',
    cursor: 'pointer',
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '850px',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '13px 12px',
    background: '#f8fafc',
    color: '#64748b',
    fontWeight: 700,
    borderBottom: '1px solid #e5eaf2',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '13px 12px',
    borderBottom: '1px solid #edf0f5',
    color: '#334155',
    verticalAlign: 'middle',
  },
  notice: {
    padding: '12px 15px',
    borderRadius: '8px',
    marginBottom: '18px',
    fontSize: '13px',
  },
  smallText: {
    fontSize: '12px',
    color: '#64748b',
  },
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '7px',
  },
};

function formatCurrency(value?: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value?: string): string {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusStyle(status: WithdrawalStatus): React.CSSProperties {
  const colors: Record<WithdrawalStatus, { color: string; background: string }> = {
    PENDING: { color: '#92400e', background: '#fef3c7' },
    APPROVED: { color: '#166534', background: '#dcfce7' },
    REJECTED: { color: '#991b1b', background: '#fee2e2' },
    SENT_BACK: { color: '#1d4ed8', background: '#dbeafe' },
    PROCESSING: { color: '#6d28d9', background: '#ede9fe' },
    PAID: { color: '#166534', background: '#dcfce7' },
    CLOSED: { color: '#334155', background: '#e2e8f0' },
  };

  return {
    display: 'inline-block',
    padding: '5px 9px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 750,
    color: colors[status].color,
    background: colors[status].background,
    whiteSpace: 'nowrap',
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

export default function WithdrawalModule({ user }: Props) {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Customer withdrawal request form
  const [agreementId, setAgreementId] = useState('');
  const [reason, setReason] = useState('');
  const [bankAccountLast4, setBankAccountLast4] = useState('');

  // Manager/Admin review form
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<
    'APPROVED' | 'REJECTED' | 'SENT_BACK'
  >('APPROVED');
  const [reviewRemarks, setReviewRemarks] = useState('');

  // Payment form
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('');

  const canRequest =
    user.role === 'CUSTOMER' || user.role === 'ADMIN';

  const canReview =
    user.role === 'MANAGER' || user.role === 'ADMIN';

  const canRecordPayment =
    user.role === 'MANAGER' || user.role === 'ADMIN';

  const token = sessionStorage.getItem('tra-invest-token');

  const request = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });

      const responseText = await response.text();

      let data: unknown = {};

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { message: responseText };
        }
      }

      if (!response.ok) {
        const message =
          data !== null &&
          typeof data === 'object' &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : `Request failed with status ${response.status}`;

        throw new Error(message);
      }

      return data as T;
    },
    [token],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const withdrawalData: unknown = await request<unknown>(
        '/withdrawals',
      );

      let agreementData: unknown = [];

      if (user.role === 'CUSTOMER') {
        agreementData = await request<unknown>(
          '/withdrawals/eligible-agreements',
        );
      }

      const agreementList: Agreement[] =
        Array.isArray(agreementData)
          ? (agreementData as Agreement[])
          : agreementData !== null &&
              typeof agreementData === 'object' &&
              'agreements' in agreementData &&
              Array.isArray(agreementData.agreements)
            ? (agreementData.agreements as Agreement[])
            : [];

      const withdrawalList: Withdrawal[] =
        Array.isArray(withdrawalData)
          ? (withdrawalData as Withdrawal[])
          : withdrawalData !== null &&
              typeof withdrawalData === 'object' &&
              'withdrawals' in withdrawalData &&
              Array.isArray(withdrawalData.withdrawals)
            ? (withdrawalData.withdrawals as Withdrawal[])
            : [];

      setAgreements(agreementList);
      setWithdrawals(withdrawalList);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [request, user.role]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const submitWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!agreementId) {
      setNotice({
        type: 'error',
        message: 'Please select an eligible agreement.',
      });
      return;
    }

    if (bankAccountLast4 && !/^\d{4}$/.test(bankAccountLast4)) {
      setNotice({
        type: 'error',
        message: 'Enter the last four digits of your bank account.',
      });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      await request('/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          agreementId,
          reason: reason.trim(),
          bankAccountLast4: bankAccountLast4.trim(),
        }),
      });

      setAgreementId('');
      setReason('');
      setBankAccountLast4('');

      setNotice({
        type: 'success',
        message: 'Withdrawal request submitted successfully.',
      });

      await loadData();
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!reviewingId) return;

    if (
      (reviewStatus === 'REJECTED' || reviewStatus === 'SENT_BACK') &&
      !reviewRemarks.trim()
    ) {
      setNotice({
        type: 'error',
        message: 'Please provide remarks for this review decision.',
      });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      await request(`/withdrawals/${reviewingId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: reviewStatus,
          managerRemarks: reviewRemarks.trim(),
        }),
      });

      setReviewingId(null);
      setReviewRemarks('');

      setNotice({
        type: 'success',
        message: `Withdrawal request ${reviewStatus.toLowerCase().replace('_', ' ')} successfully.`,
      });

      await loadData();
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitPayment = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!paymentId) return;

    if (!paymentReference.trim()) {
      setNotice({
        type: 'error',
        message: 'Enter the payment transaction reference.',
      });
      return;
    }

    if (!paymentProofUrl.trim()) {
      setNotice({
        type: 'error',
        message: 'Enter the payment proof URL.',
      });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      await request(`/withdrawals/${paymentId}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          paymentReference: paymentReference.trim(),
          paymentProofUrl: paymentProofUrl.trim(),
        }),
      });

      setPaymentId(null);
      setPaymentReference('');
      setPaymentProofUrl('');

      setNotice({
        type: 'success',
        message: 'Payment details recorded successfully.',
      });

      await loadData();
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = withdrawals.filter(
    (item) => item.status === 'PENDING',
  ).length;

  const approvedCount = withdrawals.filter(
    (item) => item.status === 'APPROVED',
  ).length;

  const paidCount = withdrawals.filter(
    (item) => item.status === 'PAID' || item.status === 'CLOSED',
  ).length;

  const totalRequested = withdrawals.reduce(
    (sum, item) => sum + Number(item.totalAmount || 0),
    0,
  );

  const selectedAgreement = agreements.find(
    (agreement) => agreement.id === agreementId,
  );

  return (
    <div style={styles.page}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={styles.heading}>Withdrawal Management</h1>
          <p style={styles.subtitle}>
            Submit, review and track investment withdrawal requests.
          </p>
        </div>

        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => void loadData()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {notice && (
        <div
          role="alert"
          style={{
            ...styles.notice,
            color: notice.type === 'success' ? '#166534' : '#991b1b',
            background:
              notice.type === 'success' ? '#dcfce7' : '#fee2e2',
            border:
              notice.type === 'success'
                ? '1px solid #bbf7d0'
                : '1px solid #fecaca',
          }}
        >
          {notice.message}
        </div>
      )}

      <div style={styles.cards}>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Total Requests</div>
          <div style={styles.cardValue}>{withdrawals.length}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Pending Requests</div>
          <div style={styles.cardValue}>{pendingCount}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Approved Requests</div>
          <div style={styles.cardValue}>{approvedCount}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Paid / Closed</div>
          <div style={styles.cardValue}>{paidCount}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Total Requested Amount</div>
          <div
            style={{
              ...styles.cardValue,
              fontSize: '20px',
            }}
          >
            {formatCurrency(totalRequested)}
          </div>
        </div>
      </div>

      {canRequest && (
        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>Create Withdrawal Request</h2>

          {agreements.length === 0 ? (
            <p style={styles.smallText}>
              No eligible agreements are currently available for withdrawal.
              If you believe this is incorrect, contact the administrator.
            </p>
          ) : (
            <form onSubmit={submitWithdrawal}>
              <div style={styles.grid}>
                <div style={styles.field}>
                  <label style={styles.label} htmlFor="withdrawalAgreement">
                    Select Agreement *
                  </label>

                  <select
                    id="withdrawalAgreement"
                    style={styles.input}
                    value={agreementId}
                    onChange={(event) => setAgreementId(event.target.value)}
                    required
                  >
                    <option value="">Choose an agreement</option>

                    {agreements.map((agreement) => (
                      <option key={agreement.id} value={agreement.id}>
                        {agreement.agreementNumber} —{' '}
                        {formatCurrency(
                          agreement.totalBalance ??
                            agreement.principal +
                              Number(agreement.accruedInterest ?? 0),
                        )}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.field}>
                  <label style={styles.label} htmlFor="bankLast4">
                    Bank Account Last 4 Digits
                  </label>

                  <input
                    id="bankLast4"
                    style={styles.input}
                    value={bankAccountLast4}
                    onChange={(event) =>
                      setBankAccountLast4(
                        event.target.value.replace(/\D/g, '').slice(0, 4),
                      )
                    }
                    placeholder="e.g. 1234"
                    maxLength={4}
                    inputMode="numeric"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label} htmlFor="withdrawalReason">
                    Reason for Withdrawal
                  </label>

                  <input
                    id="withdrawalReason"
                    style={styles.input}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Enter reason (optional)"
                    maxLength={500}
                  />
                </div>
              </div>

              {selectedAgreement && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '14px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <strong style={{ fontSize: '13px' }}>
                    Selected Agreement Summary
                  </strong>

                  <div
                    style={{
                      ...styles.grid,
                      marginTop: '12px',
                    }}
                  >
                    <div>
                      <div style={styles.smallText}>Principal</div>
                      <strong>
                        {formatCurrency(selectedAgreement.principal)}
                      </strong>
                    </div>

                    <div>
                      <div style={styles.smallText}>Accrued Interest</div>
                      <strong>
                        {formatCurrency(selectedAgreement.accruedInterest)}
                      </strong>
                    </div>

                    <div>
                      <div style={styles.smallText}>Total Balance</div>
                      <strong>
                        {formatCurrency(
                          selectedAgreement.totalBalance ??
                            selectedAgreement.principal +
                              Number(selectedAgreement.accruedInterest ?? 0),
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '18px' }}>
                <button
                  type="submit"
                  style={styles.button}
                  disabled={submitting || !agreementId}
                >
                  {submitting ? 'Submitting...' : 'Submit Withdrawal Request'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {reviewingId && canReview && (
        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>Review Withdrawal Request</h2>

          <form onSubmit={submitReview}>
            <div style={styles.grid}>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="reviewDecision">
                  Decision *
                </label>

                <select
                  id="reviewDecision"
                  style={styles.input}
                  value={reviewStatus}
                  onChange={(event) =>
                    setReviewStatus(
                      event.target.value as
                        | 'APPROVED'
                        | 'REJECTED'
                        | 'SENT_BACK',
                    )
                  }
                >
                  <option value="APPROVED">Approve</option>
                  <option value="REJECTED">Reject</option>
                  <option value="SENT_BACK">Send Back</option>
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label} htmlFor="reviewRemarks">
                  Review Remarks
                </label>

                <input
                  id="reviewRemarks"
                  style={styles.input}
                  value={reviewRemarks}
                  onChange={(event) => setReviewRemarks(event.target.value)}
                  placeholder="Enter review remarks"
                  maxLength={1000}
                />
              </div>
            </div>

            <div style={{ ...styles.actionRow, marginTop: '16px' }}>
              <button
                type="submit"
                style={styles.button}
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Submit Review'}
              </button>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setReviewingId(null);
                  setReviewRemarks('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {paymentId && canRecordPayment && (
        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>Record Withdrawal Payment</h2>

          <form onSubmit={submitPayment}>
            <div style={styles.grid}>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="paymentReference">
                  Payment Transaction Reference *
                </label>

                <input
                  id="paymentReference"
                  style={styles.input}
                  value={paymentReference}
                  onChange={(event) =>
                    setPaymentReference(event.target.value)
                  }
                  placeholder="Enter UTR / transaction reference"
                  maxLength={150}
                  required
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label} htmlFor="paymentProof">
                  Payment Proof URL *
                </label>

                <input
                  id="paymentProof"
                  style={styles.input}
                  value={paymentProofUrl}
                  onChange={(event) =>
                    setPaymentProofUrl(event.target.value)
                  }
                  placeholder="Enter uploaded payment proof URL"
                  maxLength={1000}
                  required
                />
              </div>
            </div>

            <div style={{ ...styles.actionRow, marginTop: '16px' }}>
              <button
                type="submit"
                style={styles.button}
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Record Payment'}
              </button>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setPaymentId(null);
                  setPaymentReference('');
                  setPaymentProofUrl('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>Withdrawal Requests</h2>

        {loading ? (
          <p style={styles.smallText}>Loading withdrawal requests...</p>
        ) : withdrawals.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '35px 15px',
              color: '#64748b',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>↗</div>
            <strong>No withdrawal requests found</strong>
            <p style={styles.smallText}>
              Withdrawal requests will appear here once submitted.
            </p>
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Request No.</th>
                  <th style={styles.th}>Agreement</th>
                  {user.role !== 'CUSTOMER' && (
                    <th style={styles.th}>Customer</th>
                  )}
                  <th style={styles.th}>Principal</th>
                  <th style={styles.th}>Interest</th>
                  <th style={styles.th}>Total Amount</th>
                  <th style={styles.th}>Request Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {withdrawals.map((item) => (
                  <tr key={item.id}>
                    <td style={styles.td}>
                      <strong>{item.requestNumber}</strong>
                    </td>

                    <td style={styles.td}>{item.agreementNumber}</td>

                    {user.role !== 'CUSTOMER' && (
                      <td style={styles.td}>
                        {item.customerName || item.customerId || '—'}
                      </td>
                    )}

                    <td style={styles.td}>
                      {formatCurrency(item.principal)}
                    </td>

                    <td style={styles.td}>
                      {formatCurrency(item.accruedInterest)}
                    </td>

                    <td style={styles.td}>
                      <strong>{formatCurrency(item.totalAmount)}</strong>
                    </td>

                    <td style={styles.td}>
                      {formatDate(item.requestedAt)}
                    </td>

                    <td style={styles.td}>
                      <span style={getStatusStyle(item.status)}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.actionRow}>
                        {canReview && item.status === 'PENDING' && (
                          <button
                            type="button"
                            style={styles.button}
                            onClick={() => {
                              setReviewingId(item.id);
                              setReviewStatus('APPROVED');
                              setReviewRemarks('');
                              setPaymentId(null);
                            }}
                          >
                            Review
                          </button>
                        )}

                        {canRecordPayment &&
                          item.status === 'APPROVED' && (
                            <button
                              type="button"
                              style={styles.button}
                              onClick={() => {
                                setPaymentId(item.id);
                                setPaymentReference('');
                                setPaymentProofUrl('');
                                setReviewingId(null);
                              }}
                            >
                              Record Payment
                            </button>
                          )}

                        {item.paymentProofUrl && (
                          <a
                            href={item.paymentProofUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              ...styles.secondaryButton,
                              textDecoration: 'none',
                            }}
                          >
                            View Proof
                          </a>
                        )}

                        {!(
                          (canReview && item.status === 'PENDING') ||
                          (canRecordPayment && item.status === 'APPROVED') ||
                          item.paymentProofUrl
                        ) && (
                          <span style={styles.smallText}>No actions</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {withdrawals.some((item) => item.managerRemarks) && (
        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>Review Remarks</h2>

          {withdrawals
            .filter((item) => item.managerRemarks)
            .map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '13px',
                  borderBottom: '1px solid #edf0f5',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <strong style={{ fontSize: '13px' }}>
                    {item.requestNumber}
                  </strong>

                  <span style={getStatusStyle(item.status)}>
                    {item.status.replace('_', ' ')}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: '13px',
                    color: '#475569',
                    marginBottom: 0,
                  }}
                >
                  {item.managerRemarks}
                </p>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}