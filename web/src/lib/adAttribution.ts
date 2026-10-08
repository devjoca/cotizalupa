const STORAGE_KEY = "cotizalupa_meta_click";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FBCLID = /^[A-Za-z0-9_-]{1,500}$/;

// Only the public landing reads the ad URL. Report links never load ad code.
export function rememberMetaClick() {
  const clickId = new URLSearchParams(window.location.search).get("fbclid");
  if (!clickId || !FBCLID.test(clickId)) return;
  const now = Date.now();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      fbc: `fb.1.${now}.${clickId}`,
      expiresAt: now + MAX_AGE_MS,
    }));
  } catch {
    // Private browsing may deny local storage. Checkout still works.
  }
}

export function currentMetaFBC(): string | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== "object" || saved === null ||
        !("fbc" in saved) || typeof saved.fbc !== "string" ||
        !("expiresAt" in saved) || typeof saved.expiresAt !== "number" ||
        saved.expiresAt <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    return saved.fbc;
  } catch {
    return;
  }
}
