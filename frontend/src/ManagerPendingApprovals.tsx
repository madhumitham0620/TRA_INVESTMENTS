import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import './App.css';

const API_URL = 'http://localhost:4000/api/agreements';

type ReviewAction = 'APPROVE' | 'REJECT' | 'SEND_BACK';

type Agreement = {
  id: string | number;
  agreementNumber?: string;
  customerName?: string;
  customerUserId?: string;
  customerId?: string;
  customerEmail?: string;
  amount?: number | string;
  principalAmount?: number | string;
  interestRate?: number | string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  status: string;
  remarks?: string | null;
  managerRemarks?: string | null;
};

type ApiResponse = {
  message?: string;
  error?: string;
  agreements?: Agreement[];
  data?: Agreement[] | { agreements?: Agreement[] };
};

function getErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const response = data as ApiResponse;

    if (response.message) {
      return response.message;
    }

    if (response.error) {
      return response.error;
    }
  }

  return fallback;
}

function getAgreementList(response: ApiResponse): Agreement[] {
  if (Array.isArray(response.agreements)) {
    return response.agreements;
  }

  if (Array.isArray(response.data)) {
    return response.data;
  }

  if (
    response.data &&
    !Array.isArray(response.data) &&
    Array.isArray(response.data.agreements)
  ) {
    return response.data.agreements;
  }

  return [];
}

function getInvestmentAmount(agreement: Agreement): number | string {
  return agreement.principalAmount ?? agreement.amount ?? 0;
}

function formatCurrency(value: number | string | undefined): string {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return '—';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value?: string): string {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function displayStatus(status: string): string {
  return status.replaceAll('_', ' ');
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return {
      message: text,
    };
  }
}

function ManagerPendingApprovals() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedAgreement, setSelectedAgreement] =
    useState<Agreement | null>(null);

  const [action, setAction] = useState<ReviewAction>('APPROVE');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const loadAgreements = useCallback(async (isRefresh = false) => {
    setPageError('');

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const token = sessionStorage.getItem('tra-invest-token');

      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch(`${API_URL}/pending`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const data = await readApiResponse(response);

      if (!response.ok) {
        console.error('Pending agreements API error:', {
          status: response.status,
          response: data,
        });

        throw new Error(
          `HTTP ${response.status}: ${getErrorMessage(
            data,
            'Could not load pending agreements.',
          )}`,
        );
      }

      setAgreements(getAgreementList(data));
    } catch (error) {
      console.error('Load agreements error:', error);

      setPageError(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while loading agreements.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAgreements();
  }, [loadAgreements]);

  function openReview(
    agreement: Agreement,
    nextAction: ReviewAction,
  ) {
    setSelectedAgreement(agreement);
    setAction(nextAction);
    setRemarks('');
    setReviewError('');
    setNotice('');
  }

  function closeReview() {
    if (submitting) return;

    setSelectedAgreement(null);
    setRemarks('');
    setReviewError('');
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAgreement) return;

    const trimmedRemarks = remarks.trim();

    if (action !== 'APPROVE' && !trimmedRemarks) {
      setReviewError(
        'Please enter remarks when rejecting or sending back an agreement.',
      );
      return;
    }

    setSubmitting(true);
    setReviewError('');
    setNotice('');

    try {
      const token = sessionStorage.getItem('tra-invest-token');

      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch(
        `${API_URL}/${encodeURIComponent(
          String(selectedAgreement.id),
        )}/review`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action,
            remarks: trimmedRemarks,
          }),
        },
      );

      const data = await readApiResponse(response);

      if (!response.ok) {
        console.error('Agreement review API error:', {
          status: response.status,
          response: data,
        });

        throw new Error(
          `HTTP ${response.status}: ${getErrorMessage(
            data,
            'Could not submit the agreement decision.',
          )}`,
        );
      }

      const actionMessages: Record<ReviewAction, string> = {
        APPROVE: 'Agreement approved successfully.',
        REJECT: 'Agreement rejected successfully.',
        SEND_BACK: 'Agreement sent back for corrections.',
      };

      setSelectedAgreement(null);
      setRemarks('');
      setNotice(data.message || actionMessages[action]);

      await loadAgreements(true);
    } catch (error) {
      console.error('Review agreement error:', error);

      setReviewError(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while reviewing the agreement.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount = agreements.filter(
    (agreement) => agreement.status === 'PENDING_APPROVAL',
  ).length;

  return (
    <section className="approvals-page">
      <div className="approvals-heading">
        <div>
          <span className="eyebrow">AGREEMENT WORKFLOW</span>
          <h2>Manager Pending Approvals</h2>
          <p>Review investment agreements and record your decision.</p>
        </div>

        <button
          type="button"
          className="approvals-refresh"
          onClick={() => void loadAgreements(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      <div className="approvals-summary">
        <div className="approvals-summary-icon" aria-hidden="true">
          ▤
        </div>

        <div>
          <span>Awaiting your review</span>
          <strong>{loading ? '—' : pendingCount}</strong>
          <small>
            {pendingCount === 1
              ? 'Agreement requires a decision'
              : 'Agreements requiring a decision'}
          </small>
        </div>
      </div>

      {notice && (
        <div className="approvals-notice success" role="status">
          <span>{notice}</span>

          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice('')}
          >
            ×
          </button>
        </div>
      )}

      {pageError && (
        <div className="approvals-notice error" role="alert">
          <strong>Unable to load agreements</strong>
          <p>{pageError}</p>

          <button
            type="button"
            className="approvals-inline-button"
            onClick={() => void loadAgreements()}
          >
            Try again
          </button>
        </div>
      )}

      <div className="approvals-table-card">
        <div className="approvals-table-heading">
          <div>
            <h3>Agreements for review</h3>
            <p>Review the submitted agreement details below.</p>
          </div>

          <span className="approvals-count">
            {loading ? 'Loading…' : `${agreements.length} total`}
          </span>
        </div>

        {loading ? (
          <div className="approvals-empty">
            <div className="approvals-loader" />
            <strong>Loading pending agreements...</strong>
            <p>Please wait while the records are retrieved.</p>
          </div>
        ) : pageError ? (
          <div className="approvals-empty">
            <strong>Agreements could not be displayed.</strong>
            <p>Check the error above and try again.</p>
          </div>
        ) : agreements.length === 0 ? (
          <div className="approvals-empty">
            <div className="approvals-empty-icon" aria-hidden="true">
              ✓
            </div>
            <strong>No pending agreements</strong>
            <p>There are no agreements awaiting approval right now.</p>
          </div>
        ) : (
          <div className="approvals-table-scroll">
            <table className="approvals-table">
              <thead>
                <tr>
                  <th>Agreement</th>
                  <th>Customer</th>
                  <th>Investment</th>
                  <th>Interest rate</th>
                  <th>Start date</th>
                  <th>End date</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>

              <tbody>
                {agreements.map((agreement) => (
                  <tr key={agreement.id}>
                    <td>
                      <strong className="agreement-number">
                        {agreement.agreementNumber ||
                          String(agreement.id).slice(0, 8)}
                      </strong>

                      <span className="table-secondary">
                        ID: {String(agreement.id).slice(0, 8)}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {agreement.customerName || 'Customer'}
                      </strong>

                      {agreement.customerUserId && (
                        <span className="table-secondary">
                          ID: {agreement.customerUserId}
                        </span>
                      )}

                      {agreement.customerEmail && (
                        <span className="table-secondary">
                          {agreement.customerEmail}
                        </span>
                      )}
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(getInvestmentAmount(agreement))}
                      </strong>
                    </td>

                    <td>
                      {agreement.interestRate !== undefined
                        ? `${agreement.interestRate}%`
                        : '—'}
                    </td>

                    <td>{formatDate(agreement.startDate)}</td>
                    <td>{formatDate(agreement.endDate)}</td>

                    <td>
                      <span className="agreement-status pending">
                        {displayStatus(agreement.status)}
                      </span>
                    </td>

                    <td>
                      {agreement.status === 'PENDING_APPROVAL' ? (
                        <div className="agreement-actions">
                          <button
                            type="button"
                            className="review-action approve"
                            onClick={() =>
                              openReview(agreement, 'APPROVE')
                            }
                          >
                            Approve
                          </button>

                          <button
                            type="button"
                            className="review-action more"
                            onClick={() =>
                              openReview(agreement, 'SEND_BACK')
                            }
                          >
                            Send back
                          </button>

                          <button
                            type="button"
                            className="review-action reject"
                            onClick={() =>
                              openReview(agreement, 'REJECT')
                            }
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="table-secondary">
                          No action required
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedAgreement && (
        <div
          className="review-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeReview();
            }
          }}
        >
          <section
            className="review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
          >
            <div className="review-modal-header">
              <div>
                <span className="eyebrow">MANAGER DECISION</span>

                <h3 id="review-modal-title">
                  {action === 'APPROVE'
                    ? 'Approve agreement'
                    : action === 'REJECT'
                      ? 'Reject agreement'
                      : 'Send agreement back'}
                </h3>
              </div>

              <button
                type="button"
                className="review-modal-close"
                aria-label="Close review dialog"
                onClick={closeReview}
                disabled={submitting}
              >
                ×
              </button>
            </div>

            <div className="review-agreement-summary">
              <div>
                <span>Agreement</span>
                <strong>
                  {selectedAgreement.agreementNumber ||
                    String(selectedAgreement.id).slice(0, 8)}
                </strong>
              </div>

              <div>
                <span>Customer</span>
                <strong>
                  {selectedAgreement.customerName || 'Customer'}
                </strong>
              </div>

              <div>
                <span>Investment amount</span>
                <strong>
                  {formatCurrency(
                    getInvestmentAmount(selectedAgreement),
                  )}
                </strong>
              </div>
            </div>

            <form className="review-form" onSubmit={submitReview}>
              <label htmlFor="review-action">Decision</label>

              <select
                id="review-action"
                value={action}
                onChange={(event) => {
                  setAction(event.target.value as ReviewAction);
                  setReviewError('');
                }}
                disabled={submitting}
              >
                <option value="APPROVE">Approve</option>
                <option value="REJECT">Reject</option>
                <option value="SEND_BACK">
                  Send back for corrections
                </option>
              </select>

              <label htmlFor="review-remarks">
                Remarks {action === 'APPROVE' ? '(optional)' : '(required)'}
              </label>

              <textarea
                id="review-remarks"
                rows={4}
                maxLength={2000}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder={
                  action === 'APPROVE'
                    ? 'Add an optional approval note...'
                    : action === 'REJECT'
                      ? 'Explain why this agreement is being rejected...'
                      : 'Explain which corrections are needed...'
                }
                required={action !== 'APPROVE'}
                disabled={submitting}
              />

              <span className="review-character-count">
                {remarks.length}/2000 characters
              </span>

              {reviewError && (
                <div className="approvals-notice error" role="alert">
                  {reviewError}
                </div>
              )}

              <div className="review-modal-actions">
                <button
                  type="button"
                  className="review-cancel"
                  onClick={closeReview}
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={`review-confirm ${action.toLowerCase()}`}
                  disabled={submitting}
                >
                  {submitting
                    ? 'Submitting...'
                    : action === 'APPROVE'
                      ? 'Confirm approval'
                      : action === 'REJECT'
                        ? 'Confirm rejection'
                        : 'Send back agreement'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default ManagerPendingApprovals;