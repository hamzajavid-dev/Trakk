"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EmailSummary } from "@/lib/dashboardData";

function date(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }

function csvCell(value: string) { return `"${value.replace(/"/g, '""')}"`; }

function downloadCsv(emails: EmailSummary[]) {
  const header = ["Subject", "Recipients", "Sent", "Last Opened", "Opens", "Clicks", "Tracking"];
  const rows = emails.map((email) => [
    email.subject,
    String(email.recipient_count),
    new Date(email.sent_at).toISOString(),
    email.lastOpenAt ? new Date(email.lastOpenAt).toISOString() : "Not opened yet",
    String(email.opens),
    String(email.clicks),
    email.tracking_enabled ? "On" : "Paused",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `trakk-sent-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SentList({ emails }: { emails: EmailSummary[] }) {
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [sort, setSort] = useState("activity");
  const visible = useMemo(() => emails.filter((email) => email.subject.toLowerCase().includes(query.toLowerCase())).filter((email) => filter === "all" || (filter === "engaged" ? email.opens + email.clicks > 0 : filter === "tracking" ? email.tracking_enabled : !email.tracking_enabled)).sort((a, b) => sort === "opens" ? b.opens - a.opens : sort === "clicks" ? b.clicks - a.clicks : sort === "sent" ? b.sent_at.localeCompare(a.sent_at) : (b.latestActivity ?? b.sent_at).localeCompare(a.latestActivity ?? a.sent_at)), [emails, filter, query, sort]);
  return <section className="email-library"><div className="list-toolbar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject…" /></label><div className="select-group"><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter emails"><option value="all">All sends</option><option value="engaged">Has activity</option><option value="tracking">Tracking on</option><option value="paused">Tracking paused</option></select><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort emails"><option value="activity">Latest activity</option><option value="sent">Recently sent</option><option value="opens">Most opens</option><option value="clicks">Most clicks</option></select><button type="button" className="button button-secondary export-button" onClick={() => downloadCsv(visible)} disabled={visible.length === 0}>Export CSV</button></div></div>
    <div className="email-table"><div className="email-table-head"><span>Subject</span><span>Sent</span><span>Signal</span><span>Tracking</span></div>{visible.map((email) => <Link href={`/dashboard/sent/${email.id}`} className="email-row" key={email.id}><div><strong>{email.subject}</strong><small>{email.recipient_count} {email.recipient_count === 1 ? "recipient" : "recipients"}</small></div><time>{date(email.sent_at)}</time><div className="signal-count"><span>{email.opens} <small>opens</small></span><span>{email.clicks} <small>clicks</small></span></div><span className={email.tracking_enabled ? "tracking-state on" : "tracking-state"}>{email.tracking_enabled ? "● On" : "Paused"}</span></Link>)}{visible.length === 0 && <div className="empty-state table-empty"><span>◌</span><p>{emails.length ? "No emails match that view." : "Nothing tracked yet. Send an email through the extension to start here."}</p></div>}</div></section>;
}
