import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <main className="screen" id="landing">
      <div className="screen-grid">
        <div>
          <p className="eyebrow">AI filing intelligence</p>
          <h1>The annual report, reduced to what changed.</h1>
          <p className="lead">
            FilingLens turns German annual reports into impact-ranked findings,
            cited follow-up answers, and shareable analyst reports.
          </p>
          <div className="actions">
            <Link className="button" to="/login">Sign in</Link>
            <Link className="button accent" to="/analyses/new">See a comparison</Link>
          </div>
        </div>

        <div className="phone" aria-label="Mobile preview">
          <div className="phone-screen">
            <div className="phone-top">
              <div>
                <div className="row-title">Siemens AG</div>
                <div className="row-sub">2025 vs 2024 · risk report</div>
              </div>
              <span className="chip soft-accent">Live</span>
            </div>
            <div className="metric-strip">
              <div className="metric accent">
                <div className="metric-value">9</div>
                <div className="metric-label">High impact</div>
              </div>
              <div className="metric">
                <div className="metric-value">18</div>
                <div className="metric-label">Source citations</div>
              </div>
            </div>
            <div className="row-list" style={{ padding: '34px 0 0' }}>
              <div className="data-row">
                <div>
                  <div className="row-title">Free cash flow reached record high</div>
                  <div className="row-sub">FY2025 · €10.8bn</div>
                </div>
                <span className="chip red">High</span>
              </div>
              <div className="data-row">
                <div>
                  <div className="row-title">ROCE moved lower</div>
                  <div className="row-sub">FY2025 · 17.8%</div>
                </div>
                <span className="chip red">High</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
