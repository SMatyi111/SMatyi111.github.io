const CONSENT_KEY = "tracespark:analytics-consent:v1";
const INSTALL_KEY = "tracespark:install-id:v1";
const APP_VERSION = "0.1.1";

const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const sameOriginBackend = localHosts.has(window.location.hostname)
  || window.location.hostname.endsWith(".vercel.app");
const backendBaseUrl = sameOriginBackend ? "" : "https://pi-network-opportunity-research.vercel.app";

export function analyticsChoice() {
  return localStorage.getItem(CONSENT_KEY);
}

export function setAnalyticsChoice(choice) {
  if (!['allow', 'decline'].includes(choice)) throw new Error("Invalid analytics choice.");
  localStorage.setItem(CONSENT_KEY, choice);
  if (choice === "decline") localStorage.removeItem(INSTALL_KEY);
}

function installId() {
  let value = localStorage.getItem(INSTALL_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(INSTALL_KEY, value);
  }
  return value;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function track(event, properties = {}) {
  if (analyticsChoice() !== "allow") return false;

  try {
    const anonymousId = (await sha256(`tracespark:v1:${installId()}`)).slice(0, 24);
    const response = await fetch(`${backendBaseUrl}/api/analytics/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event,
        anonymousId,
        day: new Date().toISOString().slice(0, 10),
        version: APP_VERSION,
        properties
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function resetAllLocalData() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith("tracespark:"))
    .forEach((key) => localStorage.removeItem(key));
}
