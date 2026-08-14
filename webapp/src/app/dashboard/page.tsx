import Link from "next/link";
import { getDashboardSnapshot, isConfirmedClick, isConfirmedOpen, summariseEmails } from "@/lib/dashboardData";

function relativeTime(value: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 1 ? "just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; }
function confidence(value: number) { return value >= 85 ? "High confidence" : value >= 55 ? "Likely" : "Low confidence"; }

export default async function DashboardPage() {
  const { emails, events, links } = await getDashboardSnapshot();
  const summaries = summariseEmails(emails, events);
  const opens = events.filter(isConfirmedOpen);
  const clicks = events.filter(isConfirmedClick);
  const confirmedFeed = events.filter((event) => isConfirmedOpen(event) || isConfirmedClick(event));
  const clickCounts = new Map<string, number>();
  clicks.forEach((event) => { if (event.link_id) clickCounts.set(event.link_id, (clickCounts.get(event.link_id) ?? 0) + 1); });
  const topLinks = links.map((link) => ({ ...link, clicks: clickCounts.get(link.id) ?? 0 })).filter((link) => link.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 4);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); const key = date.toISOString().slice(0, 10); return { label: date.toLocaleDateString("en", { weekday: "short" }).slice(0, 1), total: opens.filter((event) => event.at.slice(0, 10) === key).length }; });
  const maxDay = Math.max(1, ...days.map((day) => day.total));

  return <>
    <header className="dashboard-header"><div><p className="eyebrow">Overview</p><h1>Good morning.</h1><p className="header-subtitle">Here’s the pulse of your sent email.</p></div><Link className="button button-secondary" href="/dashboard/sent">View all sends <span aria-hidden>→</span></Link></header>
    <section className="metric-row">
      <article className="metric-card"><span>Tracked emails</span><strong>{emails.length}</strong><small>{emails.filter((email) => email.tracking_enabled).length} currently active</small></article>
      <article className="metric-card"><span>Confirmed opens</span><strong>{opens.length}</strong><small>{opens.length ? `${Math.round((opens.length / Math.max(1, emails.length)) * 100)} per 100 sends` : "Waiting for your first signal"}</small></article>
      <article className="metric-card accent"><span>Link clicks</span><strong>{clicks.length}</strong><small>{clicks.length ? "Action taken by recipients" : "No clicks yet"}</small></article>
    </section>
    <section className="dashboard-grid">
      <article className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">Right now</p><h2>Latest activity</h2></div><span className="status-pill">● Live</span></div>
        <div className="activity-list">{confirmedFeed.slice(0, 6).map((event) => { const email = emails.find((item) => item.id === event.email_id); return <Link href={`/dashboard/sent/${event.email_id}`} className="activity-item" key={event.id}><span className={`event-dot event-${event.type}`} /> <div><strong>{event.type === "click" ? "Link clicked" : event.type === "open" ? "Email opened" : "Preview detected"}</strong><p>{email?.subject ?? "Tracked email"}</p></div><div className="activity-meta"><span>{confidence(event.confidence)}</span><time>{relativeTime(event.at)}</time></div></Link>; })}{events.length === 0 && <div className="empty-state"><span>◌</span><p>Activity will appear here as recipients engage with your email.</p></div>}</div>
      </article>
      <article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">Last 7 days</p><h2>Opens over time</h2></div><strong>{opens.length}</strong></div><div className="bar-chart">{days.map((day, i) => <div className="bar-column" key={`${day.label}-${i}`}><span className="bar-value">{day.total || ""}</span><i style={{ height: `${Math.max(8, (day.total / maxDay) * 100)}%` }} /><small>{day.label}</small></div>)}</div></article>
    </section>
    <section className="dashboard-grid lower-grid"><article className="panel sends-panel"><div className="panel-heading"><div><p className="eyebrow">Recent sends</p><h2>Keep the thread</h2></div><Link href="/dashboard/sent" className="subtle-link">All emails →</Link></div><div className="compact-list">{summaries.slice(0, 4).map((email) => <Link href={`/dashboard/sent/${email.id}`} key={email.id}><div><strong>{email.subject}</strong><small>Sent {relativeTime(email.sent_at)}</small></div><span>{email.opens} opens · {email.clicks} clicks</span></Link>)}{summaries.length === 0 && <div className="empty-state"><p>Your tracked Gmail sends will collect here.</p></div>}</div></article>
      <article className="panel links-panel"><div className="panel-heading"><div><p className="eyebrow">Intent</p><h2>Top clicked links</h2></div></div><div className="link-list">{topLinks.map((link) => <div key={link.id}><span>{new URL(link.url).hostname.replace("www.", "")}</span><strong>{link.clicks}</strong><i style={{ width: `${Math.min(100, (link.clicks / Math.max(1, topLinks[0]?.clicks ?? 1)) * 100)}%` }} /></div>)}{topLinks.length === 0 && <div className="empty-state"><p>Click data will surface your most compelling links.</p></div>}</div></article></section>
  </>;
}
