// client/src/api.js

// ---- Auth helpers (robust to both storage keys & shapes) ----
const LS_KEYS = ['league_auth', 'leagueAuth'];

export function getAuth() {
  let raw = null;
  for (const k of LS_KEYS) {
    try {
      raw = JSON.parse(localStorage.getItem(k) || 'null');
      if (raw) break;
    } catch {}
  }
  if (!raw) return null;

  const leagueId =
    raw.leagueId ?? raw.id ?? raw.league?.id ?? null;
  const token =
    raw.token ?? raw.league_token ?? raw.authToken ?? null;

  if (!leagueId || !token) return null;
  return { leagueId: +leagueId, token: String(token) };
}

export function setAuth({ leagueId, token }) {
  const payload = { leagueId: +leagueId, token: String(token) };
  localStorage.setItem('league_auth', JSON.stringify(payload)); // canonical
  // keep old key in sync so older code continues to work
  localStorage.setItem('leagueAuth', JSON.stringify(payload));
}

export function clearAuth() {
  for (const k of LS_KEYS) localStorage.removeItem(k);
}

export function isAuthed() {
  const a = getAuth();
  return !!(a?.leagueId && a?.token);
}

// ---- Fetch wrapper (always sends auth headers if present) ----
async function jsonFetch(path, options = {}) {
  const auth = getAuth();

  const headers = {
    ...(options.headers || {}),
    'Content-Type': options.body instanceof FormData ? undefined : 'application/json',
    ...(auth?.token ? { 'x-auth-token': auth.token } : {}),
    ...(auth?.leagueId ? { 'x-league-id': String(auth.leagueId) } : {}),
  };

  // Only add ?leagueId=… for GETs that don't already have it
  let url = path;
  if (
    auth?.leagueId &&
    (!options.method || options.method.toUpperCase() === 'GET') &&
    !/[?&]leagueId=/.test(path)
  ) {
    url += (path.includes('?') ? '&' : '?') + `leagueId=${encodeURIComponent(auth.leagueId)}`;
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  if (!res.ok) {
    let msg = text || `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      msg = parsed?.error || parsed?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : null;
}

// ---- Leagues ----
export const listLeagues = () => jsonFetch('/api/leagues');

export const createLeague = (payload) =>
  jsonFetch('/api/leagues', { method: 'POST', body: JSON.stringify(payload) });

export async function loginLeague(leagueId, pin) {
  const res = await jsonFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ leagueId, pin }),
  });
  // Persist auth so all subsequent calls include headers
  if (res?.token && (res?.league?.id ?? leagueId)) {
    setAuth({ leagueId: res.league?.id ?? leagueId, token: res.token });
  }
  return res;
}

export async function uploadLeagueLogo(leagueId, file) {
  const auth = getAuth();
  const fd = new FormData();
  fd.append('logo', file);
  const headers = {
    ...(auth?.token ? { 'x-auth-token': auth.token } : {}),
    ...(auth?.leagueId ? { 'x-league-id': String(auth.leagueId) } : {}),
    // DO NOT set Content-Type for FormData
  };
  const res = await fetch(`/api/leagues/${leagueId}/logo`, {
    method: 'POST',
    headers,
    body: fd,
  });
  if (!res.ok) throw new Error('Logo upload failed');
  return res.json();
}

export const updateLeague = (id, payload) =>
  jsonFetch(`/api/leagues/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

// ---- Players ----
export const getPlayers = () => jsonFetch('/api/players');

export const addPlayer = (...args) => {
  let payload;
  if (typeof args[0] === 'object' && args[0] !== null) {
    payload = args[0];
  } else {
    const [name, average = 0, hcp = null, gender = null, teamId = null] = args;
    payload = { name, average, hcp, gender, teamId };
  }
  return jsonFetch('/api/players', { method: 'POST', body: JSON.stringify(payload) });
};

export const updatePlayer = (id, payload) =>
  jsonFetch(`/api/players/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deletePlayer = (id) =>
  jsonFetch(`/api/players/${id}`, { method: 'DELETE' });

// ---- Teams ----
export const getTeams = () => jsonFetch('/api/teams');

export const addTeam = (name, playerIds = []) =>
  jsonFetch('/api/teams', { method: 'POST', body: JSON.stringify({ name, playerIds }) });

// ---- Weeks / Matches ----
export const createWeek = (weekNumber, date, pairings = []) =>
  jsonFetch('/api/weeks', { method: 'POST', body: JSON.stringify({ weekNumber, date, pairings }) });

export const getMatches = () => jsonFetch('/api/matches');

export const scoreMatch = (id, homePins, awayPins) =>
  jsonFetch(`/api/matches/${id}/score`, { method: 'POST', body: JSON.stringify({ homePins, awayPins }) });

// ---- Standings / Players-with-teams (week-aware) ----
export const getStandings = (week) => {
  const qs = week ? `?week=${encodeURIComponent(week)}` : '';
  return jsonFetch(`/api/standings${qs}`);
};

export const getPlayerStandings = (week) => {
  const qs = week ? `?week=${encodeURIComponent(week)}` : '';
  return jsonFetch(`/api/standings/players${qs}`);
};

export const getPlayersWithTeams = (week) => {
  const qs = week ? `?week=${encodeURIComponent(week)}` : '';
  return jsonFetch(`/api/players-with-teams${qs}`);
};

// ---- Match sheet ----
export const getMatchSheet = (weekNumber, homeTeamId, awayTeamId) =>
  jsonFetch(`/api/match-sheet?${new URLSearchParams({ weekNumber, homeTeamId, awayTeamId }).toString()}`);

export const saveMatchSheet = (payload) =>
  jsonFetch('/api/match-sheet', { method: 'POST', body: JSON.stringify(payload) });

// ---- Convenience: current league object from listLeagues ----
export const getCurrentLeague = async () => {
  const auth = getAuth();
  if (!auth?.leagueId) return null;
  const leagues = await listLeagues();
  return leagues.find((l) => l.id === +auth.leagueId) || null;
};
