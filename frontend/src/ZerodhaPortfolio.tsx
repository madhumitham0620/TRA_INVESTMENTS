
import { useMemo, useState } from 'react';
import './ZerodhaPortfolio.css';

type Holding = {
  symbol: string;
  company: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
};

type Position = {
  symbol: string;
  exchange: string;
  product: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
};

type PortfolioTab = 'holdings' | 'positions';

const sampleHoldings: Holding[] = [
  {
    symbol: 'RELIANCE',
    company: 'Reliance Industries',
    exchange: 'NSE',
    quantity: 10,
    averagePrice: 2450,
    currentPrice: 2680,
  },
  {
    symbol: 'TCS',
    company: 'Tata Consultancy Services',
    exchange: 'NSE',
    quantity: 5,
    averagePrice: 3900,
    currentPrice: 4120,
  },
  {
    symbol: 'INFY',
    company: 'Infosys Limited',
    exchange: 'NSE',
    quantity: 12,
    averagePrice: 1450,
    currentPrice: 1390,
  },
  {
    symbol: 'HDFCBANK',
    company: 'HDFC Bank',
    exchange: 'NSE',
    quantity: 15,
    averagePrice: 1600,
    currentPrice: 1725,
  },
  {
    symbol: 'ITC',
    company: 'ITC Limited',
    exchange: 'NSE',
    quantity: 20,
    averagePrice: 430,
    currentPrice: 468,
  },
];

const samplePositions: Position[] = [
  {
    symbol: 'SBIN',
    exchange: 'NSE',
    product: 'CNC',
    quantity: 10,
    averagePrice: 780,
    currentPrice: 805,
  },
  {
    symbol: 'TATAMOTORS',
    exchange: 'NSE',
    product: 'MIS',
    quantity: -5,
    averagePrice: 720,
    currentPrice: 712,
  },
  {
    symbol: 'ICICIBANK',
    exchange: 'NSE',
    product: 'CNC',
    quantity: 8,
    averagePrice: 1240,
    currentPrice: 1265,
  },
];

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

const number = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(value);

export default function ZerodhaPortfolio() {
  const [activeTab, setActiveTab] = useState<PortfolioTab>('holdings');
  const [search, setSearch] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshCount, setRefreshCount] = useState(0);

  const holdings = useMemo(
    () =>
      sampleHoldings.map((item) => {
        const invested = item.quantity * item.averagePrice;
        const current = item.quantity * item.currentPrice;
        return {
          ...item,
          invested,
          current,
          pnl: current - invested,
          pnlPercent: invested ? ((current - invested) / invested) * 100 : 0,
        };
      }),
    [],
  );

  const positions = useMemo(
    () =>
      samplePositions.map((item) => {
        const invested = Math.abs(item.quantity * item.averagePrice);
        const pnl = item.quantity * (item.currentPrice - item.averagePrice);
        return {
          ...item,
          invested,
          pnl,
          pnlPercent: invested ? (pnl / invested) * 100 : 0,
        };
      }),
    [],
  );

  const totalInvested = holdings.reduce((sum, item) => sum + item.invested, 0);
  const currentValue = holdings.reduce((sum, item) => sum + item.current, 0);
  const totalPnl = currentValue - totalInvested;
  const totalPnlPercent = totalInvested
    ? (totalPnl / totalInvested) * 100
    : 0;

  const visibleHoldings = holdings.filter((item) => {
    const term = search.trim().toLowerCase();
    return (
      item.symbol.toLowerCase().includes(term) ||
      item.company.toLowerCase().includes(term)
    );
  });

  const visiblePositions = positions.filter((item) => {
    const term = search.trim().toLowerCase();
    return (
      item.symbol.toLowerCase().includes(term) ||
      item.exchange.toLowerCase().includes(term)
    );
  });

  function handleRefresh() {
    // Sample mode: refreshes the displayed timestamp only.
    // Replace this handler with a backend fetch when Zerodha credentials are available.
    setLastRefreshed(new Date());
    setRefreshCount((count) => count + 1);
  }

  return (
    <main className="zp-page">
      <header className="zp-header">
        <div>
          <div className="zp-eyebrow">TRA INVEST / INVESTMENTS</div>
          <h1>Portfolio Overview</h1>
          <p className="zp-subtitle">
            View your holdings, positions, and portfolio performance.
          </p>
        </div>

        <div className="zp-header-actions">
          <span className="zp-status">
            <span className="zp-status-dot" />
            Demo data
          </span>
          <button className="zp-refresh" onClick={handleRefresh} type="button">
            ↻ Refresh
          </button>
        </div>
      </header>

      <div className="zp-demo-notice">
        <strong>Sample data</strong>
        <span>
          These figures are illustrative only. This page is not connected to
          your Zerodha account and does not show live market prices.
        </span>
      </div>

      <section className="zp-summary-grid">
        <article className="zp-summary-card">
          <div className="zp-card-label">Invested value</div>
          <div className="zp-card-value">{money(totalInvested)}</div>
          <div className="zp-card-foot">Across {holdings.length} sample holdings</div>
        </article>

        <article className="zp-summary-card">
          <div className="zp-card-label">Current value</div>
          <div className="zp-card-value">{money(currentValue)}</div>
          <div className="zp-card-foot">Illustrative portfolio value</div>
        </article>

        <article className="zp-summary-card">
          <div className="zp-card-label">Total profit / loss</div>
          <div className={`zp-card-value ${totalPnl >= 0 ? 'zp-positive' : 'zp-negative'}`}>
            {totalPnl >= 0 ? '+' : ''}
            {money(totalPnl)}
          </div>
          <div className={`zp-card-foot ${totalPnl >= 0 ? 'zp-positive' : 'zp-negative'}`}>
            {totalPnlPercent >= 0 ? '+' : ''}
            {totalPnlPercent.toFixed(2)}% overall
          </div>
        </article>

        <article className="zp-summary-card">
          <div className="zp-card-label">Open positions</div>
          <div className="zp-card-value">{positions.length}</div>
          <div className="zp-card-foot">Sample positions only</div>
        </article>
      </section>

      <section className="zp-table-card">
        <div className="zp-table-heading">
          <div>
            <h2>Investment details</h2>
            <p>Search and review your portfolio data.</p>
          </div>

          <label className="zp-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search symbol or company"
              aria-label="Search portfolio"
            />
          </label>
        </div>

        <div className="zp-tabs" role="tablist" aria-label="Portfolio data">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'holdings'}
            className={activeTab === 'holdings' ? 'active' : ''}
            onClick={() => setActiveTab('holdings')}
          >
            Holdings <span>{visibleHoldings.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'positions'}
            className={activeTab === 'positions' ? 'active' : ''}
            onClick={() => setActiveTab('positions')}
          >
            Positions <span>{visiblePositions.length}</span>
          </button>
        </div>

        {activeTab === 'holdings' ? (
          <div className="zp-table-scroll">
            <table className="zp-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Exchange</th>
                  <th className="numeric">Qty.</th>
                  <th className="numeric">Avg. price</th>
                  <th className="numeric">LTP</th>
                  <th className="numeric">Invested</th>
                  <th className="numeric">Current value</th>
                  <th className="numeric">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {visibleHoldings.map((item) => (
                  <tr key={item.symbol}>
                    <td>
                      <div className="zp-symbol">{item.symbol}</div>
                      <div className="zp-company">{item.company}</div>
                    </td>
                    <td><span className="zp-exchange">{item.exchange}</span></td>
                    <td className="numeric">{number(item.quantity)}</td>
                    <td className="numeric">{money(item.averagePrice)}</td>
                    <td className="numeric">{money(item.currentPrice)}</td>
                    <td className="numeric">{money(item.invested)}</td>
                    <td className="numeric">{money(item.current)}</td>
                    <td className={`numeric ${item.pnl >= 0 ? 'zp-positive' : 'zp-negative'}`}>
                      <strong>{item.pnl >= 0 ? '+' : ''}{money(item.pnl)}</strong>
                      <div className="zp-row-percent">
                        {item.pnlPercent >= 0 ? '+' : ''}{item.pnlPercent.toFixed(2)}%
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleHoldings.length === 0 && (
                  <tr><td colSpan={8} className="zp-empty">No matching holdings found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="zp-table-scroll">
            <table className="zp-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Exchange</th>
                  <th>Product</th>
                  <th className="numeric">Qty.</th>
                  <th className="numeric">Avg. price</th>
                  <th className="numeric">LTP</th>
                  <th className="numeric">Invested</th>
                  <th className="numeric">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {visiblePositions.map((item) => (
                  <tr key={`${item.symbol}-${item.product}`}>
                    <td><div className="zp-symbol">{item.symbol}</div></td>
                    <td><span className="zp-exchange">{item.exchange}</span></td>
                    <td>{item.product}</td>
                    <td className="numeric">{number(item.quantity)}</td>
                    <td className="numeric">{money(item.averagePrice)}</td>
                    <td className="numeric">{money(item.currentPrice)}</td>
                    <td className="numeric">{money(item.invested)}</td>
                    <td className={`numeric ${item.pnl >= 0 ? 'zp-positive' : 'zp-negative'}`}>
                      <strong>{item.pnl >= 0 ? '+' : ''}{money(item.pnl)}</strong>
                      <div className="zp-row-percent">
                        {item.pnlPercent >= 0 ? '+' : ''}{item.pnlPercent.toFixed(2)}%
                      </div>
                    </td>
                  </tr>
                ))}
                {visiblePositions.length === 0 && (
                  <tr><td colSpan={8} className="zp-empty">No matching positions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <footer className="zp-table-footer">
          <span>Mode: sample data · Read-only</span>
          <span>
            Last refreshed: {lastRefreshed.toLocaleTimeString('en-IN')}
            {refreshCount > 0 ? ` · ${refreshCount} refresh${refreshCount === 1 ? '' : 'es'}` : ''}
          </span>
        </footer>
      </section>

      <section className="zp-connect-card">
        <div className="zp-connect-icon" aria-hidden="true">↗</div>
        <div className="zp-connect-copy">
          <h2>Zerodha Kite Connect</h2>
          <p>
            Live account data is not connected yet. When your developer app
            and credentials are ready, connect through the TRA Invest backend.
            Keep API secrets out of the frontend.
          </p>
        </div>
        <span className="zp-pending">Setup pending</span>
      </section>
    </main>
  );
}
