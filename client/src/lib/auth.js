// client/src/lib/auth.js
const KEY = 'leagueAuth';

// Save { id, name, token }
export function saveLeagueAuth(obj) {
  localStorage.setItem(KEY, JSON.stringify(obj || null));
}

// Read saved auth or null
export function getSavedLeague() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

// Clear auth
export function clearLeagueAuth() {
  localStorage.removeItem(KEY);
}

// Headers to hit protected endpoints
export function getAuthHeaders() {
  const saved = getSavedLeague();
  if (!saved?.id || !saved?.token) return {};
  return {
    'x-league-id': String(saved.id),
    'x-auth-token': saved.token,
  };
}

// True if we have a token
export function isAuthed() {
  const s = getSavedLeague();
  return !!(s?.id && s?.token);
}
