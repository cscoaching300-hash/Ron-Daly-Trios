const getAuth = () => {
  try { return JSON.parse(localStorage.getItem('league_auth') || 'null') } catch { return null }
}

const API = (path, options = {}) => {
  const auth = getAuth()
  const headers = {
    ...(options.headers || {}),
    'Content-Type': 'application/json',
    ...(auth?.token ? { 'x-auth-token': auth.token } : {}),
    ...(auth?.leagueId ? { 'x-league-id': String(auth.leagueId) } : {})
  }
  const url = auth?.leagueId && !path.includes('?')
    ? `${path}?leagueId=${auth.leagueId}`
    : path
  return fetch(url, { ...options, headers }).then(r => r.json())
}

export const listLeagues = () => fetch('/api/leagues').then(r => r.json())
export const createLeague = (payload) => API('/api/leagues', { method: 'POST', body: JSON.stringify(payload) })

export const uploadLeagueLogo = async (leagueId, file) => {
  const auth = getAuth()
  const fd = new FormData()
  fd.append('logo', file)
  const res = await fetch(`/api/leagues/${leagueId}/logo`, {
    method: 'POST',
    headers: {
      ...(auth?.token ? { 'x-auth-token': auth.token } : {}),
      ...(auth?.leagueId ? { 'x-league-id': String(auth.leagueId) } : {}),
    },
    body: fd
  })
  return res.json()
}

export const loginLeague = (leagueId, pin) =>
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leagueId, pin })
  }).then(r => r.json())

export const getPlayers = () => API('/api/players')
export const getTeams = () => API('/api/teams')
export const addTeam = (name, playerIds=[]) =>
  API('/api/teams', { method:'POST', body: JSON.stringify({ name, playerIds }) })
export const createWeek = (weekNumber, date, pairings=[]) =>
  API('/api/weeks', { method:'POST', body: JSON.stringify({ weekNumber, date, pairings }) })
export const getMatches = () => API('/api/matches')
export const scoreMatch = (id, homePins, awayPins) =>
  API(`/api/matches/${id}/score`, { method:'POST', body: JSON.stringify({ homePins, awayPins }) })
export const getStandings = () => API('/api/standings')
export const getPlayerStandings = () => API('/api/standings/players')
export const getMatchSheet = (weekNumber, homeTeamId, awayTeamId) =>
  API(`/api/match-sheet?weekNumber=${weekNumber}&homeTeamId=${homeTeamId}&awayTeamId=${awayTeamId}`)
export const saveMatchSheet = (payload) =>
  API('/api/match-sheet', { method: 'POST', body: JSON.stringify(payload) })
export const getPlayersWithTeams = () => API('/api/players-with-teams')

// ✅ Unified addPlayer (use either args or a payload object)
export const addPlayer = (...args) => {
  let payload
  if (typeof args[0] === 'object' && args[0] !== null) {
    payload = args[0] // { name, average, hcp, gender, teamId }
  } else {
    const [name, average = 0, hcp = null, gender = null, teamId = null] = args
    payload = { name, average, hcp, gender, teamId }
  }
  return API('/api/players', { method:'POST', body: JSON.stringify(payload) })
}

export const updatePlayer = (id, payload) =>
  API(`/api/players/${id}`, { method:'PUT', body: JSON.stringify(payload) })
export const deletePlayer = (id) =>
  API(`/api/players/${id}`, { method: 'DELETE' })
export const updateLeague = (id, payload) =>
  API(`/api/leagues/${id}`, { method:'PUT', body: JSON.stringify(payload) })
// Get the currently-selected league (from localStorage) by reading the league list
export const getCurrentLeague = async () => {
  const auth = getAuth()
  if (!auth?.leagueId) return null
  const leagues = await listLeagues()
  return leagues.find(l => l.id === +auth.leagueId) || null
}

