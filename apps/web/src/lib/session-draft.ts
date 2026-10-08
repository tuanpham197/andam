/**
 * Unsent form input kept for the browser tab (TC-LOG-017, TC-CUS-017): survives leaving the page,
 * a failed request or a trip to "Dấu hiệu nguy hiểm". Storage may be unavailable (private mode),
 * in which case the form simply starts empty.
 */
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept: the form still works.
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
