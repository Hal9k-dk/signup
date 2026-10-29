// Local transport adapter for the documented shared Go API.
// Experiences own their markup, validation UI, gates and submission lifecycle.
export async function submitSignup(form) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
      signal: controller.signal,
    });
    const result = await response.json();
    return { ok: response.ok, ...result };
  } finally {
    clearTimeout(timeout);
  }
}
