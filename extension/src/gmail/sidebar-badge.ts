import { findSentNavLink } from "./selectors";
import { DOUBLE_CHECK_SVG } from "./icons";

const BADGE_CLASS = "trakk-sent-nav-badge";

function paint() {
  const link = findSentNavLink();
  if (!link || link.querySelector(`.${BADGE_CLASS}`)) return;
  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  badge.innerHTML = DOUBLE_CHECK_SVG;
  badge.title = "Trakk is tracking your sent mail";
  link.append(badge);
}

export function observeSentNavBadge() {
  let scheduled = false;
  const refresh = () => { if (scheduled) return; scheduled = true; window.setTimeout(() => { scheduled = false; paint(); }, 500); };
  new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
  refresh();
}
