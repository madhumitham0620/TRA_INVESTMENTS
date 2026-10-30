
import { useEffect, useState } from 'react';

type Customer = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

const API_URL = 'http://localhost:4000/api/customers';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadCustomers() {
      try {
        const token = sessionStorage.getItem('tra-invest-token');

        if (!token) {
          setError('Please sign in again to view customers.');
          return;
        }

        const response = await fetch(API_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              'Authentication failed. Please sign out and sign in again.',
            );
          }

          throw new Error(data.message || 'Could not load customers.');
        }

        setCustomers(data.customers ?? data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Something went wrong.',
        );
      } finally {
        setLoading(false);
      }
    }

    void loadCustomers();
  }, []);

  return (
    <section className="customers-page">
      <h2>Customer Management</h2>
      <p>View registered TRA Invest customers.</p>

      {loading && <p>Loading customers...</p>}

      {error && <p role="alert">{error}</p>}

      {!loading && !error && customers.length === 0 && (
        <p>No customers found.</p>
      )}

      {!loading && !error && customers.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Registered</th>
              </tr>
            </thead>

            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.userId}</td>
                  <td>{customer.fullName}</td>
                  <td>{customer.email}</td>
                  <td>{customer.status}</td>
                  <td>
                    {customer.createdAt
                      ? new Date(customer.createdAt).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
