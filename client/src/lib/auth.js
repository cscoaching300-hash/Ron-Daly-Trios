// client/src/lib/auth.js

const KEY = 'leagueAuth';

/**
 * Save the league auth object to localStorage.
 * Shape: { id, name, token, logo? }
 */
export function saveLeagueAuth(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj || null));
  } catch {
    // ignore storage errors
  }
}

/**
 * Read the saved auth object (or null if missing/invalid).
 */
export function getSavedLeague() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

/**
 * Remove any saved auth.
 */
export function clearLeagueAuth() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Headers required by the server to identify & authorize the current league.
 * Use on ALL protected endpoints.
 */
export function getAuthHeaders() {
  const saved = getSavedLeague();
  if (!saved?.id || !saved?.token) return {};
  return {
    'x-league-id': String(saved.id),
    'x-auth-token': saved.token,
  };
}

/**
 * Simple boolean: do we have a league and token saved?
 */
export function isAuthed() {
  const s = getSavedLeague();
  return !!(s?.id && s?.token);
}

/**
 * Optional helper: perform login against the API and persist the result.
 * Returns { id, name, token, logo } on success.
 */
export async function loginToLeague(leagueId, pin) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leagueId, pin }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Login failed (${res.status})`);
  }

  const data = await res.json(); // { token, league: { id, name, logo } }
  const payload = {
    id: data?.league?.id,
    name: data?.league?.name,
    logo: data?.league?.logo || null,
    token: data?.token,
  };

  if (!payload.id || !payload.token) {
    throw new Error('Invalid login response');
  }

  saveLeagueAuth(payload);
  return payload;
}

/**
 * Optional helper: clear auth (call on "Log out" click).
 */
export function logout() {
  clearLeagueAuth();
}

