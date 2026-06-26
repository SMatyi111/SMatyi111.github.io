const sdkStatus = document.querySelector("#sdk-status");
const sdkStatusDot = document.querySelector("#sdk-status-dot");
const authButton = document.querySelector("#auth-button");
const authResult = document.querySelector("#auth-result");
const usernameScope = document.querySelector("#username-scope");
const paymentButton = document.querySelector("#payment-button");
const paymentResult = document.querySelector("#payment-result");
const actionCount = document.querySelector("#action-count");
const fulfillButtons = document.querySelectorAll("[data-fulfill-button]");

const searchParams = new URLSearchParams(window.location.search);
const isLocalHost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
const sandbox = searchParams.get("sandbox") !== "0" && (isLocalHost || searchParams.get("sandbox") === "1");
const defaultBackendBaseUrl = window.location.hostname === "smatyi111.github.io"
  ? "https://pi-network-opportunity-research.vercel.app"
  : "";
const backendBaseUrl = (searchParams.get("api") || window.MOL_BACKEND_BASE_URL || defaultBackendBaseUrl).replace(/\/$/, "");

function setStatus(message, mode) {
  sdkStatus.textContent = message;
  sdkStatusDot.className = `status-dot ${mode}`;
}

function printResult(value) {
  authResult.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function printPaymentResult(value) {
  paymentResult.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
  printPaymentResult({
    warning: "Incomplete payment found. Manual follow-up may be required.",
    paymentId: payment?.identifier || payment?.paymentId || null
  });
}

async function postBackend(path, payload) {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || body.pi?.error || `Backend request failed with HTTP ${response.status}`);
  }

  return body;
}

function initializePi() {
  if (!window.Pi) {
    setStatus("Pi SDK not available. Open in Pi Browser or check network access.", "warn");
    authButton.disabled = true;
    paymentButton.disabled = true;
    return;
  }

  try {
    window.Pi.init({ version: "2.0", sandbox });
    setStatus(`Pi SDK ready. Sandbox: ${sandbox ? "on" : "off"}.`, "ok");
    authButton.disabled = false;
    paymentButton.disabled = false;
  } catch (error) {
    setStatus("Pi SDK initialization failed.", "warn");
    authButton.disabled = true;
    paymentButton.disabled = true;
    printResult(error.message || String(error));
  }
}

function updateOrderSummary() {
  const openActions = document.querySelectorAll('[data-fulfillment-label][data-state="needs-action"]').length;
  if (actionCount) {
    actionCount.textContent = String(openActions);
  }
}

fulfillButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const orderCard = button.closest("[data-order-id]");
    const fulfillmentLabel = orderCard?.querySelector("[data-fulfillment-label]");
    const buyerUpdate = orderCard?.querySelector("[data-buyer-update]");
    const receiptTrail = orderCard?.querySelector("[data-receipt-trail]");
    const statusBadge = orderCard?.querySelector(".badge");

    if (!orderCard || !fulfillmentLabel || !buyerUpdate || !receiptTrail || !statusBadge) {
      return;
    }

    fulfillmentLabel.textContent = "Fulfilled";
    fulfillmentLabel.dataset.state = "fulfilled";
    buyerUpdate.textContent = 'Buyer update sent: "Payment received and pickup is ready. Show this receipt at pickup."';
    receiptTrail.insertAdjacentHTML("beforeend", "<li>Merchant marked the order fulfilled.</li>");
    statusBadge.textContent = "Fulfilled";
    statusBadge.className = "badge fulfilled";
    button.textContent = "Fulfilled";
    button.disabled = true;
    updateOrderSummary();
  });
});

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

paymentButton.addEventListener("click", async () => {
  if (!window.Pi) {
    printPaymentResult("Pi SDK is unavailable.");
    return;
  }

  paymentButton.disabled = true;
  printPaymentResult("Starting Testnet payment. The app will call the backend only after Pi returns a payment id.");

  try {
    await withTimeout(
      window.Pi.authenticate(["payments"], onIncompletePaymentFound),
      30000,
      "Pi payment authentication did not complete within 30 seconds."
    );

    window.Pi.createPayment(
      {
        amount: 0.01,
        memo: "Merchant Ops Lab Testnet checklist payment",
        metadata: {
          app: "merchant-ops-lab",
          purpose: "portal-checklist-testnet-payment"
        }
      },
      {
        onReadyForServerApproval: async (paymentId) => {
          printPaymentResult({ status: "Approving payment on backend.", paymentId });
          await postBackend("/api/pi/payments/approve", { paymentId });
          printPaymentResult({ status: "Payment approved by backend.", paymentId });
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          printPaymentResult({ status: "Completing payment on backend.", paymentId, txid });
          await postBackend("/api/pi/payments/complete", { paymentId, txid });
          printPaymentResult({ status: "Payment completed by backend.", paymentId, txid });
        },
        onCancel: (paymentId) => {
          printPaymentResult({ status: "Payment cancelled.", paymentId });
          paymentButton.disabled = false;
        },
        onError: (error, payment) => {
          printPaymentResult({
            error: error?.message || String(error),
            paymentId: payment?.identifier || payment?.paymentId || null
          });
          paymentButton.disabled = false;
        }
      }
    );
  } catch (error) {
    printPaymentResult({
      error: error?.message || String(error),
      note: "Payment requires Pi Browser, Testnet/sandbox authorization, and a backend with PI_API_KEY configured."
    });
    paymentButton.disabled = false;
  }
});

document.querySelectorAll("[data-fulfillment-label]").forEach((label) => {
  label.dataset.state = label.textContent.toLowerCase().includes("needs") ? "needs-action" : "fulfilled";
});

updateOrderSummary();
initializePi();
