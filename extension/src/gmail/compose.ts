import type { InboxSDK, ComposeView } from "@inboxsdk/core";
import { registerSentEmail, updateEmailThreadId } from "../api";
import type { TrakkConfig } from "../types";

const enabledByCompose = new WeakMap<object, boolean>();
const emailIdByCompose = new WeakMap<object, string>();

function composeElement(view: ComposeView) { return view.getElement(); }

function installToggle(view: ComposeView) {
  if (composeElement(view).querySelector(".trakk-compose-toggle")) return;
  enabledByCompose.set(view, true);
  const control = document.createElement("label");
  control.className = "trakk-compose-toggle";
  control.innerHTML = '<input type="checkbox" checked> Track with Trakk';
  control.querySelector<HTMLInputElement>("input")?.addEventListener("change", (event) => enabledByCompose.set(view, (event.target as HTMLInputElement).checked));
  const statusBar = view.addStatusBar({ height: 28, orderHint: 10 });
  statusBar.el.append(control);
}

function rewriteLinks(body: HTMLElement, trackingUrls: string[]) {
  const anchors = [...body.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((link) => /^https?:\/\//i.test(link.href));
  anchors.forEach((anchor, index) => { const replacement = trackingUrls[index]; if (replacement) anchor.href = replacement; });
}

function injectPixel(body: HTMLElement, pixelUrl: string) {
  if (body.querySelector("img[data-trakk-pixel]")) return;
  const pixel = document.createElement("img");
  pixel.src = pixelUrl; pixel.alt = ""; pixel.width = 1; pixel.height = 1; pixel.dataset.trakkPixel = "true";
  pixel.style.cssText = "border:0;height:1px;width:1px;opacity:0;position:absolute";
  body.append(pixel);
}

function showTrackingNotice(view: ComposeView, text: string, tone: "success" | "error") {
  const notice = view.addComposeNotice({ height: 30, orderHint: 20 });
  notice.el.textContent = text;
  notice.el.style.cssText = `align-items:center;background:${tone === "success" ? "#e8f7e5" : "#fff0ec"};color:${tone === "success" ? "#14613e" : "#a4422a"};display:flex;font:12px Arial;padding:0 12px;`;
  window.setTimeout(() => notice.destroy(), 5_000);
}

export function registerComposeTracking(sdk: InboxSDK, config: TrakkConfig) {
  sdk.Compose.registerComposeViewHandler((view) => {
    installToggle(view);
    // A brand-new compose has no real Gmail thread ID yet at presend time, so
    // the request modifier below registers with a placeholder; once InboxSDK
    // confirms the actual send, correct it to the real thread ID so the Sent
    // list's ✓/✓✓ badges can find this email by its true thread.
    view.on("sent", (data) => {
      const emailId = emailIdByCompose.get(view);
      if (!emailId) return;
      void data.getThreadID()
        .then((threadId) => updateEmailThreadId(config, emailId, threadId))
        .catch((error) => console.error("[Trakk] Could not confirm thread ID after send", error));
    });
    view.registerRequestModifier(async ({ body }) => {
      if (!enabledByCompose.get(view)) return { body };
      const documentBody = new DOMParser().parseFromString(body, "text/html").body;
      if (documentBody.querySelector("img[data-trakk-pixel]")) return { body };
      const links = [...documentBody.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .map((link) => link.href).filter((href) => /^https?:\/\//i.test(href));
      const threadId = view.getThreadID() || composeElement(view).dataset.threadId || crypto.randomUUID();
      const subject = view.getSubject().trim() || "(No subject)";
      const recipients = view.getToRecipients().length + view.getCcRecipients().length + view.getBccRecipients().length;
      try {
        const registration = await registerSentEmail(config, { threadId, subject, recipientCount: Math.max(1, recipients), links });
        emailIdByCompose.set(view, registration.emailId);
        rewriteLinks(documentBody, registration.links.map((link) => link.trackingUrl));
        injectPixel(documentBody, registration.pixelUrl);
        console.info("[Trakk] Email registered for tracking", registration.emailId);
        showTrackingNotice(view, "Trakk: tracking added to this email.", "success");
        return { body: documentBody.innerHTML };
      } catch (error) {
        console.error("[Trakk] Email registration failed", error);
        showTrackingNotice(view, "Trakk could not add tracking. Check the extension connection.", "error");
        return { body };
      }
    });
  });
}
