import { useEffect, useState, type FormEvent } from 'react';
import './ProfileSettings.css';

type ProfileUser = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  mustChangePassword?: boolean;
  createdAt?: string;
  lastLogin?: string;
};

type ProfileSettingsProps = {
  onLogout: () => void;
};

type Section =
  | 'personal'
  | 'account'
  | 'security'
  | 'activity'
  | null;

const API_URL = 'http://localhost:4000/api/profile';

function getToken(): string {
  return (
    sessionStorage.getItem('tra-invest-token') ||
    sessionStorage.getItem('tra_invest_token') ||
    ''
  );
}

async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = getToken();

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    sessionStorage.removeItem('tra-invest-token');
    sessionStorage.removeItem('tra_invest_token');
    sessionStorage.removeItem('tra-invest-user');
    throw new Error('Your session has expired. Please log in again.');
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Something went wrong.');
  }

  return data;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function formatDate(value?: string): string {
  if (!value) return 'Not available';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Not available';

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfileSettings({
  onLogout,
}: ProfileSettingsProps) {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('personal');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

  useEffect(() => {
    const savedEmailNotifications = localStorage.getItem(
      'tra-invest-email-notifications'
    );
    const savedSecurityAlerts = localStorage.getItem(
      'tra-invest-security-alerts'
    );

    if (savedEmailNotifications !== null) {
      setEmailNotifications(savedEmailNotifications === 'true');
    }

    if (savedSecurityAlerts !== null) {
      setSecurityAlerts(savedSecurityAlerts === 'true');
    }

    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setError('');

    try {
      const data = await apiRequest('');

      const profile: ProfileUser = data.user || data.profile || data;

      setUser(profile);
      setFullName(profile.fullName || '');
      setEmail(profile.email || '');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unable to load profile.';

      setError(errorMessage);

      if (errorMessage.toLowerCase().includes('session has expired')) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(section: Exclude<Section, null>) {
    setMessage('');
    setError('');

    setActiveSection((current) =>
      current === section ? null : section
    );
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setSaving(true);

    try {
      const data = await apiRequest('', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
        }),
      });

      const updatedUser: ProfileUser =
        data.user || data.profile || {
          ...user,
          fullName: fullName.trim(),
          email: email.trim(),
        };

      setUser(updatedUser);
      setFullName(updatedUser.fullName || fullName.trim());
      setEmail(updatedUser.email || email.trim());
      setMessage('Your profile has been updated successfully.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update your profile.'
      );
    } finally {
      setSaving(false);
    }
  }

  function passwordMeetsRequirements(password: string): boolean {
    return (
      password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    );
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please complete all password fields.');
      return;
    }

    if (!passwordMeetsRequirements(newPassword)) {
      setError(
        'Your new password must meet all the requirements shown below.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('Your new password must be different from your current password.');
      return;
    }

    setChangingPassword(true);

    try {
      await apiRequest('/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Your password has been changed successfully.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to change your password.'
      );
    } finally {
      setChangingPassword(false);
    }
  }

  function updateEmailNotifications(value: boolean) {
    setEmailNotifications(value);
    localStorage.setItem(
      'tra-invest-email-notifications',
      String(value)
    );
  }

  function updateSecurityAlerts(value: boolean) {
    setSecurityAlerts(value);
    localStorage.setItem('tra-invest-security-alerts', String(value));
  }

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-loading">
          <div className="profile-spinner" />
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="profile-page">
      <div className="profile-container">
        <header className="profile-page-header">
          <div>
            <span className="profile-eyebrow">MY ACCOUNT</span>
            <h1>Profile & Settings</h1>
            <p>
              Manage your personal information, account preferences and
              security.
            </p>
          </div>

          <button
            type="button"
            className="profile-refresh-button"
            onClick={loadProfile}
          >
            <span aria-hidden="true">↻</span>
            Refresh
          </button>
        </header>

        {error && (
          <div className="profile-alert profile-alert-error" role="alert">
            <span className="profile-alert-icon">!</span>
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}

        {message && (
          <div className="profile-alert profile-alert-success" role="status">
            <span className="profile-alert-icon">✓</span>
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')}>
              ×
            </button>
          </div>
        )}

        {/* PROFILE OVERVIEW */}
        <section className="profile-overview-card">
          <div className="profile-avatar">
            {getInitials(user?.fullName || 'User')}
          </div>

          <div className="profile-overview-info">
            <span className="profile-overview-label">YOUR PROFILE</span>
            <h2>{user?.fullName || 'User'}</h2>
            <p>{user?.email || 'Email not available'}</p>

            <div className="profile-overview-tags">
              <span className="profile-tag profile-role-tag">
                {user?.role?.replaceAll('_', ' ') || 'USER'}
              </span>

              <span
                className={`profile-tag ${
                  user?.status?.toUpperCase() === 'ACTIVE'
                    ? 'profile-active-tag'
                    : 'profile-inactive-tag'
                }`}
              >
                <span className="profile-status-dot" />
                {user?.status || 'Unknown'}
              </span>
            </div>
          </div>

          <div className="profile-overview-id">
            <span>USER ID</span>
            <strong>{user?.userId || 'Not available'}</strong>
          </div>
        </section>

        {/* VERTICAL ACCORDION */}
        <section className="profile-sections">
          <div className="profile-section-heading">
            <h2>Manage Your Account</h2>
            <p>Select a section below to view or update its details.</p>
          </div>

          {/* PERSONAL PROFILE */}
          <section
            className={`profile-accordion ${
              activeSection === 'personal' ? 'is-open' : ''
            }`}
          >
            <button
              type="button"
              className="profile-accordion-trigger"
              onClick={() => toggleSection('personal')}
              aria-expanded={activeSection === 'personal'}
            >
              <span className="profile-section-icon">01</span>
              <span className="profile-accordion-title">
                <strong>Personal Profile</strong>
                <small>Update your name and contact information</small>
              </span>
              <span className="profile-accordion-arrow">
                {activeSection === 'personal' ? '−' : '+'}
              </span>
            </button>

            {activeSection === 'personal' && (
              <div className="profile-accordion-content">
                <div className="profile-content-heading">
                  <h3>Personal Information</h3>
                  <p>Keep your registered information accurate and up to date.</p>
                </div>

                <form onSubmit={handleProfileSave}>
                  <div className="profile-form-grid">
                    <label className="profile-field">
                      <span>Full Name</span>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Enter your full name"
                        autoComplete="name"
                        required
                      />
                    </label>

                    <label className="profile-field">
                      <span>Email Address</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Enter your email address"
                        autoComplete="email"
                        required
                      />
                    </label>

                    <label className="profile-field">
                      <span>User ID</span>
                      <input
                        type="text"
                        value={user?.userId || ''}
                        readOnly
                        disabled
                      />
                      <small>Your User ID cannot be changed.</small>
                    </label>

                    <label className="profile-field">
                      <span>Account Role</span>
                      <input
                        type="text"
                        value={user?.role?.replaceAll('_', ' ') || ''}
                        readOnly
                        disabled
                      />
                      <small>Your role is assigned by the system.</small>
                    </label>
                  </div>

                  <div className="profile-form-actions">
                    <button
                      type="button"
                      className="profile-secondary-button"
                      onClick={() => {
                        setFullName(user?.fullName || '');
                        setEmail(user?.email || '');
                        setError('');
                        setMessage('');
                      }}
                    >
                      Reset
                    </button>

                    <button
                      type="submit"
                      className="profile-primary-button"
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* ACCOUNT SETTINGS */}
          <section
            className={`profile-accordion ${
              activeSection === 'account' ? 'is-open' : ''
            }`}
          >
            <button
              type="button"
              className="profile-accordion-trigger"
              onClick={() => toggleSection('account')}
              aria-expanded={activeSection === 'account'}
            >
              <span className="profile-section-icon">02</span>
              <span className="profile-accordion-title">
                <strong>Account Settings</strong>
                <small>Manage your account preferences and notifications</small>
              </span>
              <span className="profile-accordion-arrow">
                {activeSection === 'account' ? '−' : '+'}
              </span>
            </button>

            {activeSection === 'account' && (
              <div className="profile-accordion-content">
                <div className="profile-content-heading">
                  <h3>Preferences</h3>
                  <p>Choose which account notifications you want to receive.</p>
                </div>

                <div className="profile-setting-row">
                  <div>
                    <strong>Email Notifications</strong>
                    <p>Receive account-related updates by email.</p>
                  </div>

                  <label className="profile-switch">
                    <input
                      type="checkbox"
                      checked={emailNotifications}
                      onChange={(event) =>
                        updateEmailNotifications(event.target.checked)
                      }
                    />
                    <span className="profile-switch-slider" />
                  </label>
                </div>

                <div className="profile-setting-row">
                  <div>
                    <strong>Security Alerts</strong>
                    <p>Keep security notifications enabled for your account.</p>
                  </div>

                  <label className="profile-switch">
                    <input
                      type="checkbox"
                      checked={securityAlerts}
                      onChange={(event) =>
                        updateSecurityAlerts(event.target.checked)
                      }
                    />
                    <span className="profile-switch-slider" />
                  </label>
                </div>

                <div className="profile-information-note">
                  <strong>Note</strong>
                  <p>
                    These preferences are currently saved in this browser.
                    They are not yet synchronized with your database.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* SECURITY SETTINGS */}
          <section
            className={`profile-accordion ${
              activeSection === 'security' ? 'is-open' : ''
            }`}
          >
            <button
              type="button"
              className="profile-accordion-trigger"
              onClick={() => toggleSection('security')}
              aria-expanded={activeSection === 'security'}
            >
              <span className="profile-section-icon">03</span>
              <span className="profile-accordion-title">
                <strong>Security Settings</strong>
                <small>Change your password and protect your account</small>
              </span>
              <span className="profile-accordion-arrow">
                {activeSection === 'security' ? '−' : '+'}
              </span>
            </button>

            {activeSection === 'security' && (
              <div className="profile-accordion-content">
                <div className="profile-content-heading">
                  <h3>Change Password</h3>
                  <p>
                    Use a strong password to help keep your TRA Invest account
                    secure.
                  </p>
                </div>

                <form onSubmit={handlePasswordChange}>
                  <div className="profile-password-fields">
                    <label className="profile-field">
                      <span>Current Password</span>
                      <div className="profile-password-input">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(event) =>
                            setCurrentPassword(event.target.value)
                          }
                          placeholder="Enter current password"
                          autoComplete="current-password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowCurrentPassword(!showCurrentPassword)
                          }
                        >
                          {showCurrentPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </label>

                    <label className="profile-field">
                      <span>New Password</span>
                      <div className="profile-password-input">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(event) =>
                            setNewPassword(event.target.value)
                          }
                          placeholder="Enter new password"
                          autoComplete="new-password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </label>

                    <label className="profile-field">
                      <span>Confirm New Password</span>
                      <div className="profile-password-input">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(event) =>
                            setConfirmPassword(event.target.value)
                          }
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                        >
                          {showConfirmPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="profile-password-requirements">
                    <strong>Password requirements</strong>
                    <ul>
                      <li className={newPassword.length >= 12 ? 'met' : ''}>
                        At least 12 characters
                      </li>
                      <li className={/[a-z]/.test(newPassword) ? 'met' : ''}>
                        One lowercase letter
                      </li>
                      <li className={/[A-Z]/.test(newPassword) ? 'met' : ''}>
                        One uppercase letter
                      </li>
                      <li className={/\d/.test(newPassword) ? 'met' : ''}>
                        One number
                      </li>
                      <li
                        className={
                          /[^A-Za-z0-9]/.test(newPassword) ? 'met' : ''
                        }
                      >
                        One special character
                      </li>
                    </ul>
                  </div>

                  <div className="profile-form-actions">
                    <button
                      type="button"
                      className="profile-secondary-button"
                      onClick={() => {
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setError('');
                        setMessage('');
                      }}
                    >
                      Clear Fields
                    </button>

                    <button
                      type="submit"
                      className="profile-primary-button"
                      disabled={changingPassword}
                    >
                      {changingPassword ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* ACCOUNT ACTIVITY */}
          <section
            className={`profile-accordion ${
              activeSection === 'activity' ? 'is-open' : ''
            }`}
          >
            <button
              type="button"
              className="profile-accordion-trigger"
              onClick={() => toggleSection('activity')}
              aria-expanded={activeSection === 'activity'}
            >
              <span className="profile-section-icon">04</span>
              <span className="profile-accordion-title">
                <strong>Account Activity</strong>
                <small>View your account status and available information</small>
              </span>
              <span className="profile-accordion-arrow">
                {activeSection === 'activity' ? '−' : '+'}
              </span>
            </button>

            {activeSection === 'activity' && (
              <div className="profile-accordion-content">
                <div className="profile-content-heading">
                  <h3>Account Information</h3>
                  <p>Review the account details currently available.</p>
                </div>

                <div className="profile-activity-list">
                  <div className="profile-activity-item">
                    <span>Account Name</span>
                    <strong>{user?.fullName || 'Not available'}</strong>
                  </div>

                  <div className="profile-activity-item">
                    <span>User ID</span>
                    <strong>{user?.userId || 'Not available'}</strong>
                  </div>

                  <div className="profile-activity-item">
                    <span>Account Role</span>
                    <strong>
                      {user?.role?.replaceAll('_', ' ') || 'Not available'}
                    </strong>
                  </div>

                  <div className="profile-activity-item">
                    <span>Account Status</span>
                    <strong>{user?.status || 'Not available'}</strong>
                  </div>

                  <div className="profile-activity-item">
                    <span>Member Since</span>
                    <strong>{formatDate(user?.createdAt)}</strong>
                  </div>

                  <div className="profile-activity-item">
                    <span>Last Login</span>
                    <strong>{formatDate(user?.lastLogin)}</strong>
                  </div>
                </div>

                <div className="profile-information-note">
                  <strong>Activity history</strong>
                  <p>
                    Detailed login history and device activity are not
                    available from the current profile response.
                  </p>
                </div>
              </div>
            )}
          </section>
        </section>

        {/* SIGN OUT */}
        <section className="profile-logout-card">
          <div>
            <h3>Sign out of your account</h3>
            <p>End your current TRA Invest session on this device.</p>
          </div>

          <button
            type="button"
            className="profile-logout-button"
            onClick={onLogout}
          >
            Sign Out
          </button>
        </section>

        <footer className="profile-footer">
          TRA Invest · Profile & Account Management
        </footer>
      </div>
    </main>
  );
}