const sdkStatus = document.querySelector("#sdk-status");
const sdkStatusDot = document.querySelector("#sdk-status-dot");
const authButton = document.querySelector("#auth-button");
const authResult = document.querySelector("#auth-result");
const usernameScope = document.querySelector("#username-scope");

const searchParams = new URLSearchParams(window.location.search);
const isLocalHost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
const sandbox = searchParams.get("sandbox") !== "0" && (isLocalHost || searchParams.get("sandbox") === "1");

function setStatus(message, mode) {
  sdkStatus.textContent = message;
  sdkStatusDot.className = `status-dot ${mode}`;
}

function printResult(value) {
  authResult.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function safeAuthResult(auth) {
  return {
    accessTokenPresent: Boolean(auth?.accessToken),
    user: {
      uid: auth?.user?.uid || null,
      username: auth?.user?.username || null
    }
  };
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function onIncompletePaymentFound(payment) {
  printResult({
    warning: "Incomplete payment found. Payment flows are intentionally not implemented in this prototype.",
    paymentId: payment?.identifier || payment?.paymentId || null
  });
}

function initializePi() {
  if (!window.Pi) {
    setStatus("Pi SDK not available. Open in Pi Browser or check network access.", "warn");
    authButton.disabled = true;
    return;
  }

  try {
    window.Pi.init({ version: "2.0", sandbox });
    setStatus(`Pi SDK ready. Sandbox: ${sandbox ? "on" : "off"}.`, "ok");
    authButton.disabled = false;
  } catch (error) {
    setStatus("Pi SDK initialization failed.", "warn");
    authButton.disabled = true;
    printResult(error.message || String(error));
  }
}

authButton.addEventListener("click", async () => {
  if (!window.Pi) {
    printResult("Pi SDK is unavailable.");
    return;
  }

  const scopes = usernameScope.checked ? ["username"] : [];
  authButton.disabled = true;
  printResult(`Requesting Pi authentication with scopes: ${scopes.length ? scopes.join(", ") : "(none)"}`);

  try {
    const auth = await withTimeout(
      window.Pi.authenticate(scopes, onIncompletePaymentFound),
      30000,
      "Pi authentication did not complete within 30 seconds. The app may need the Developer Portal sandbox URL/authorization flow, or the portal checklist may still be blocked by wallet/API setup."
    );
    printResult(safeAuthResult(auth));
  } catch (error) {
    printResult({
      error: error?.message || String(error),
      note: "Auth may require Pi Browser, sandbox authorization, or user consent."
    });
  } finally {
    authButton.disabled = false;
  }
});

initializePi();
