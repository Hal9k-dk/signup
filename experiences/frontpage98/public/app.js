import { submitSignup } from "./signup-client.js";

const form = document.querySelector("#signup-form");
const button = document.querySelector("#submit-button");
const reset = document.querySelector("#reset-form");
const status = document.querySelector("#form-status");
let sending = false;

form.addEventListener("reset", () => {
  status.textContent = "";
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sending || !form.reportValidity()) return;
  sending = true;
  button.disabled = true;
  reset.disabled = true;
  button.textContent = "Sender via informationsmotorvejen…";
  status.textContent = "";
  try {
    const result = await submitSignup(form);
    if (!result.ok) {
      status.textContent =
        Object.values(result.fields || {}).join(" ") ||
        result.error ||
        "Noget gik galt. Prøv igen.";
      const invalid = Object.keys(result.fields || {})[0];
      if (invalid) form.elements.namedItem(invalid)?.focus();
      return;
    }
    form.reset();
    status.textContent = result.message;
  } catch {
    status.textContent =
      "Forbindelsen blev afbrudt. Er der nogen, der bruger telefonen? Prøv igen.";
  } finally {
    sending = false;
    button.disabled = false;
    reset.disabled = false;
    button.textContent = "Send indmeldelse >>";
  }
});
