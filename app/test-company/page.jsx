// app/test-company/page.jsx
"use client";

import CompanyCardSearchContainer from "../../components/Company/CompanyCardSearchContainer";

export default function TestCompanyPage() {
  return (
    <div className="container">
      <header className="page-header">
        <div className="titles">
          <div className="eyebrow">Test</div>
          <h1 className="page-title">Company Search Test</h1>
          <p className="subtitle">Testing the company search and display functionality</p>
        </div>
      </header>

      <section style={{ marginTop: "32px" }}>
        <CompanyCardSearchContainer />
      </section>

      <style jsx>{`
        .container {
          padding: 32px;
          max-width: 800px;
          margin: 0 auto;
        }
        .page-header {
          margin-bottom: 32px;
        }
        .eyebrow {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0.6;
          margin-bottom: 8px;
        }
        .page-title {
          font-size: 32px;
          font-weight: 600;
          margin: 0 0 8px 0;
        }
        .subtitle {
          font-size: 16px;
          opacity: 0.7;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
