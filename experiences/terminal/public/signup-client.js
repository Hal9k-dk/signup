// Private adapter for the documented shared signup API.
export async function submitSignup(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let result;
    try { result = await response.json(); }
    catch { result = { error: 'Serveren svarede med et ugyldigt svar.' }; }
    return { ok: response.ok, ...result };
  } finally {
    clearTimeout(timeout);
  }
}
