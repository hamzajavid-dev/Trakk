import { getDashboardSnapshot, summariseEmails } from "@/lib/dashboardData";
import { SentList } from "./sent-list";

export default async function SentPage() {
  const snapshot = await getDashboardSnapshot();
  return <><header className="dashboard-header"><div><p className="eyebrow">Email library</p><h1>Sent emails.</h1><p className="header-subtitle">Every tracked message, with the signal attached.</p></div></header><SentList emails={summariseEmails(snapshot.emails, snapshot.events)} /></>;
}
