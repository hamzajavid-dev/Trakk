import Link from "next/link";
import { requireDashboardUser } from "@/lib/dashboardAuth";
import { LogoutButton } from "./logout-button";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireDashboardUser();
  return <div className="dashboard-shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><span className="brand-mark">T</span><span>trakk</span></Link>
      <nav className="side-nav"><Link href="/dashboard"><span>◌</span> Overview</Link><Link href="/dashboard/sent"><span>↗</span> Sent emails</Link></nav>
      <div className="sidebar-footer"><div className="owner-avatar">{user.email?.slice(0, 1).toUpperCase()}</div><div><strong>{user.email?.split("@")[0]}</strong><small>Owner account</small></div><LogoutButton /></div>
    </aside>
    <main className="dashboard-main">{children}</main>
  </div>;
}
