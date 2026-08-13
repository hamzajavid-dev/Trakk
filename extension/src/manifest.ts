import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Trakk for Gmail",
  version: "0.1.0",
  description: "Private Gmail open and click tracking for your Trakk dashboard.",
  action: { default_popup: "src/popup/index.html", default_title: "Trakk settings" },
  background: { service_worker: "src/background.ts", type: "module" },
  content_scripts: [{ matches: ["https://mail.google.com/*"], js: ["src/content.ts"], run_at: "document_idle" }],
  permissions: ["storage", "alarms", "scripting", "declarativeNetRequest", "declarativeNetRequestWithHostAccess"],
  host_permissions: ["https://mail.google.com/*", "https://*/*", "http://localhost/*"],
});
