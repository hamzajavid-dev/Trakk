import Link from "next/link";

export default function Home() {
  return (
    <main className="marketing-shell">
      <nav className="marketing-nav">
        <Link href="/" className="brand" aria-label="Trakk home">
          <img src="/trakk-logo.png" alt="Trakk" className="brand-logo" />
        </Link>
        <Link href="/login" className="button button-secondary">Owner sign in</Link>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span className="live-dot" /> Gmail tracking, with receipts</div>
        <h1>Every sent email.<br /><em>Made visible.</em></h1>
        <p>Trakk turns quiet Gmail sends into a clear signal: opens, clicks, confidence, and the story behind every interaction.</p>
        <div className="hero-actions">
          <Link href="/login" className="button button-primary">Open dashboard <span aria-hidden>→</span></Link>
          <a href="#how-it-works" className="text-link">How it works <span aria-hidden>↓</span></a>
        </div>
      </section>

      <section className="signal-card" aria-label="Tracking dashboard preview">
        <div className="signal-topline"><span>Live activity</span><span className="status-pill"><i className="pulse-dot" /> Updating</span></div>
        <div className="signal-grid">
          <div><span className="metric-label">Open rate</span><strong>64<span>%</span></strong><small>↑ 12% this week</small></div>
          <div><span className="metric-label">Link clicks</span><strong>38</strong><small>Across 12 conversations</small></div>
          <div className="signal-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
      </section>

      <section id="how-it-works" className="feature-strip">
        <div><span>01</span><h2>Send as usual</h2><p>Your Gmail workflow stays exactly where it is.</p></div>
        <div><span>02</span><h2>Read the signal</h2><p>Events are classified so proxy noise doesn’t pretend to be intent.</p></div>
        <div><span>03</span><h2>Follow through</h2><p>Open the exact email and see every meaningful moment.</p></div>
      </section>
    </main>
  );
}
