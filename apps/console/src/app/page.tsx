export default function ConsoleHomePage() {
  return (
    <main className="page">
      <p className="eyebrow">Cocurdex Console</p>
      <h1>Team workspace</h1>
      <p className="lede">
        Authenticated surface for organization-level Issues, docs, and members.
        Auth, org membership, and API wiring land in later phases (ADR 0003).
      </p>
      <dl className="meta">
        <div>
          <dt>API</dt>
          <dd>
            <code>@cocurdex/api</code> (default{" "}
            <code>http://localhost:8787</code>)
          </dd>
        </div>
        <div>
          <dt>Public site</dt>
          <dd>
            <code>@cocurdex/web</code> — marketing and docs only
          </dd>
        </div>
        <div>
          <dt>Local product data</dt>
          <dd>Desktop daemon + SQLite remain the on-device write authority</dd>
        </div>
      </dl>
    </main>
  );
}
