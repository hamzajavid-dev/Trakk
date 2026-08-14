import * as InboxSDK from "@inboxsdk/core";
import { observeThreadRows } from "./gmail/status-badges";
import { registerComposeTracking } from "./gmail/compose";
import { registerActivityPanel } from "./gmail/activity-panel";
import { observeSentNavBadge } from "./gmail/sidebar-badge";
import { getConfig } from "./types";
import "./styles.css";

async function start() {
  const config = await getConfig();
  if (!config) return;

  const sdk = await InboxSDK.load(2, config.inboxSdkAppId);
  registerComposeTracking(sdk, config);
  registerActivityPanel(sdk, config);
  observeThreadRows(config);
  observeSentNavBadge();
}

void start();
