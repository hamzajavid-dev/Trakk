import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Trakk for Gmail",
  version: "0.1.0",
  description: "Private Gmail open and click tracking for your Trakk dashboard.",
  icons: { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Trakk settings",
    default_icon: { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png" },
  },
  background: { service_worker: "src/background.ts", type: "module" },
  content_scripts: [{ matches: ["https://mail.google.com/*"], js: ["src/content.ts"], run_at: "document_idle" }],
  permissions: ["storage", "alarms", "scripting", "declarativeNetRequest", "declarativeNetRequestWithHostAccess"],
  host_permissions: ["https://mail.google.com/*", "https://*/*", "http://localhost/*"],
  web_accessible_resources: [{ resources: ["icons/*.png"], matches: ["https://mail.google.com/*"] }],
});
