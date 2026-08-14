import Link from "next/link";
import { requireDashboardUser } from "@/lib/dashboardAuth";
import { LogoutButton } from "./logout-button";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireDashboardUser();
  return <div className="dashboard-shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><img src="/trakk-logo.png" alt="Trakk" className="brand-logo" /></Link>
      <nav className="side-nav">
        <Link href="/dashboard"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1.5 8.5h2.8l1.4-4.5 2.6 8 1.4-4.5h3.8" /></svg> Overview</Link>
        <Link href="/dashboard/sent"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4.5 11.5l7-7M11.5 4.5h-5M11.5 4.5v5" /></svg> Sent emails</Link>
      </nav>
      <div className="sidebar-footer"><div className="owner-avatar">{user.email?.slice(0, 1).toUpperCase()}</div><div><strong>{user.email?.split("@")[0]}</strong><small>Owner account</small></div><LogoutButton /></div>
    </aside>
    <main className="dashboard-main">{children}</main>
  </div>;
}
