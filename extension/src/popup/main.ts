import { cleanAppUrl } from "../types";
import "./style.css";

const appUrl = document.querySelector<HTMLInputElement>("#appUrl")!;
const extensionSecret = document.querySelector<HTMLInputElement>("#extensionSecret")!;
const inboxSdkAppId = document.querySelector<HTMLInputElement>("#inboxSdkAppId")!;
const notice = document.querySelector<HTMLParagraphElement>("#notice")!;
const brandMark = document.querySelector<HTMLImageElement>("#brandMark")!;

brandMark.src = chrome.runtime.getURL("icons/icon128.png");

async function load() {
  const saved = await chrome.storage.local.get(["appUrl", "extensionSecret", "inboxSdkAppId"]);
  appUrl.value = typeof saved.appUrl === "string" ? saved.appUrl : "";
  extensionSecret.value = typeof saved.extensionSecret === "string" ? saved.extensionSecret : "";
  inboxSdkAppId.value = typeof saved.inboxSdkAppId === "string" ? saved.inboxSdkAppId : "";
}

document.querySelector<HTMLFormElement>("#settings")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const url = new URL(cleanAppUrl(appUrl.value));
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Use HTTPS, or localhost while developing.");
    const appId = inboxSdkAppId.value.trim();
    if (!appId) throw new Error("Enter the InboxSDK app ID from register.inboxsdk.com.");
    await chrome.storage.local.set({ appUrl: url.toString().replace(/\/$/, ""), extensionSecret: extensionSecret.value.trim(), inboxSdkAppId: appId });
    notice.textContent = "Saved. Reload Gmail to activate Trakk.";
    notice.className = "success";
  } catch (error) {
    notice.textContent = error instanceof Error ? error.message : "Enter a valid web app URL.";
    notice.className = "error";
  }
});
void load();
