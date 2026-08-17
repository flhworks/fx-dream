const APPLICATION_ENDPOINT = "__FXD_APPLICATION_ENDPOINT__";

const errorMessages = {
  "request-too-large": "The submitted form was too large. Please shorten the free-text fields.",
  "invalid-form": "The form could not be read. Please review it and try again.",
  "required-fields": "Please complete every required field using a valid value.",
  "company-name-required": "Please provide the company name for a company application.",
  "acknowledgements-required": "Please review and accept every required acknowledgement.",
  "rate-limited": "Too many recent applications match this request. Keep any existing reference and try again later.",
  "storage-failed": "The application could not be recorded. No payment is due. Please try again later.",
  "submission-conflict": "This saved form was changed after its first submission. Keep the existing reference, reload this page, and submit again only if a new application is required.",
  "policy-version-outdated": "The application terms or privacy notice changed while this form was open. Reload this page and review the current versions.",
  "intake-unavailable": "Applications are temporarily unavailable. No payment is due. Please try again later.",
};

function randomHex(bytes) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function showMessage(message, kind = "error") {
  const output = document.querySelector("#form-status");
  if (!output) return;
  output.textContent = message;
  output.className = kind === "error" ? "form-error" : "notice-card";
  output.hidden = false;
  output.tabIndex = -1;
  output.focus();
}

function selectedPlan() {
  const requested = new URLSearchParams(location.search).get("plan");
  return requested === "PRIVATE IMPLEMENTATION" ? requested : "PRO SYSTEM";
}

const form = document.querySelector("#purchase-application");
const submit = document.querySelector("#application-submit");
const token = document.querySelector('input[name="submission_token"]');
const plan = document.querySelector('select[name="plan"]');

const endpointIsConfigured = (() => {
  try {
    const endpoint = new URL(APPLICATION_ENDPOINT);
    return endpoint.protocol === "https:" && endpoint.username === "" && endpoint.password === "";
  } catch {
    return false;
  }
})();

if (
  form &&
  submit &&
  token &&
  plan &&
  endpointIsConfigured &&
  globalThis.crypto?.getRandomValues
) {
  token.value = randomHex(32);
  plan.value = selectedPlan();
  submit.disabled = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    const priorLabel = submit.textContent;
    submit.textContent = "Submitting…";

    try {
      const body = new URLSearchParams();
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string") body.append(name, value);
      }
      const response = await fetch(APPLICATION_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
        credentials: "omit",
        mode: "cors",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      const result = await response.json().catch(() => null);
      if (
        response.ok &&
        result?.ok === true &&
        /^FXD-A-\d{8}-[A-Z0-9]{10}$/.test(result.reference ?? "")
      ) {
        location.assign(`./received/?reference=${encodeURIComponent(result.reference)}`);
        return;
      }
      const code = typeof result?.code === "string" ? result.code : "intake-unavailable";
      showMessage(errorMessages[code] ?? errorMessages["intake-unavailable"]);
    } catch {
      showMessage(errorMessages["intake-unavailable"]);
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = priorLabel;
    }
  });
} else if (submit) {
  showMessage(
    endpointIsConfigured
      ? "Applications require a modern browser with JavaScript enabled."
      : "Application submission is not active in this review build. No payment is due.",
  );
}
