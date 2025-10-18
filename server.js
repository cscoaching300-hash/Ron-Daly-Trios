// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { LowSync } = require('lowdb');
const { JSONFileSync } = require('lowdb/node');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* ================================
   DATA DIR (persistent on Render)
   ================================ */
const DATA_DIR = process.env.DATA_DIR || __dirname; // Render can set DATA_DIR=/data

/* ===== DB (LowDB) ===== */
const dbFile = path.join(DATA_DIR, 'db.json');

const defaultData = {
  leagues: [],
  players: [],
  teams: [],
  team_players: [],
  weeks: [],
  matches: [],
  sheets: [], // per-week saved bowler games
};

const adapter = new JSONFileSync(dbFile);
const db = new LowSync(adapter, { defaultData });
db.read();
if (!db.data || typeof db.data !== 'object') db.data = { ...defaultData };
for (const k of Object.keys(defaultData)) {
  if (!Array.isArray(db.data[k])) db.data[k] = [];
}

/* ---- migration: ensure start_average on all players ---- */
db.data.players = (db.data.players || []).map(p => {
  const hasStart = Number.isFinite(+p.start_average);
  const startAverage = hasStart ? +p.start_average : (Number.isFinite(+p.average) ? +p.average : 0);
  return { ...p, start_average: startAverage };
});
db.write();

/* ===== Uploads (logos) ===== */
const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));
const upload = multer({ dest: uploadsDir });

/* ===== Helpers ===== */
function nextId(collection) {
  const arr = db.data[collection] || [];
  return arr.length ? Math.max(...arr.map(r => r.id || 0)) + 1 : 1;
}
const num = (v) => (Number.isFinite(+v) ? +v : 0);

function tokenFor(leagueId, pin) {
  return Buffer.from(`${leagueId}:${pin}`).toString('base64');
}
function getAuth(req) {
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  const token = String(req.headers['x-auth-token'] || '');
  return { leagueId, token };
}
function requireAuth(req, res, next) {
  db.read();
  const { leagueId, token } = getAuth(req);
  const league = (db.data.leagues || []).find(l => l.id === leagueId);
  if (!league) return res.status(401).json({ error: 'invalid league' });
  if (token !== tokenFor(leagueId, league.pin)) return res.status(401).json({ error: 'invalid token' });
  req.league = league;
  next();
}

/* ===== League normalization ===== */
function normalizeLeague(league) {
  const safe = { ...(league || {}) };

  // Modes/points
  safe.mode = safe.mode === 'scratch' ? 'scratch' : 'handicap';

  // Handicap params
  const baseNum = Number.isFinite(+safe.handicapBase) ? +safe.handicapBase : 200;
  const pctNum  = Number.isFinite(+safe.handicapPercent) ? +safe.handicapPercent : 90;
  safe.handicapBase = baseNum > 0 ? baseNum : 200;
  safe.handicapPercent = pctNum > 0 ? pctNum : 90;

  // Games per week
  safe.gamesPerWeek = Number.isFinite(+safe.gamesPerWeek) && +safe.gamesPerWeek > 0 ? +safe.gamesPerWeek : 3;

  // Freeze window — support starting at week 0
  const lockStart = Number.isFinite(+safe.hcpLockFromWeek) ? +safe.hcpLockFromWeek : 0;
  const lockLen   = Number.isFinite(+safe.hcpLockWeeks) ? +safe.hcpLockWeeks : 0;
  safe.hcpLockFromWeek = Math.max(0, lockStart);
  safe.hcpLockWeeks = Math.max(0, lockLen);

  // Points
  safe.teamPointsWin  = Number.isFinite(+safe.teamPointsWin)  ? +safe.teamPointsWin  : 0;
  safe.teamPointsDraw = Number.isFinite(+safe.teamPointsDraw) ? +safe.teamPointsDraw : 0;
  safe.indivPointsWin = Number.isFinite(+safe.indivPointsWin) ? +safe.indivPointsWin : 0;
  safe.indivPointsDraw= Number.isFinite(+safe.indivPointsDraw)? +safe.indivPointsDraw: 0;

  return safe;
}

/* ===== Freeze helpers ===== */
function freezeWindow(league) {
  const start = +league.hcpLockFromWeek || 0;
  const len   = +league.hcpLockWeeks || 0;
  const end   = len > 0 ? start + len - 1 : -1; // inclusive end; -1 means disabled
  return { start, len, end };
}
function inFreeze(league, weekNumber) {
  const { len, start, end } = freezeWindow(league);
  return len > 0 && Number.isFinite(+weekNumber) && +weekNumber >= start && +weekNumber <= end;
}

/* ===== Handicap/Stats utils ===== */
function playerHandicapPerGame(leagueRaw, avg, storedHcp = null) {
  if (Number.isFinite(+storedHcp) && +storedHcp >= 0) return +storedHcp; // explicit override
  const league = normalizeLeague(leagueRaw);
  if (!league || league.mode === 'scratch') return 0;
  const base = league.handicapBase;
  const pct  = league.handicapPercent / 100;
  return Math.max(0, Math.round((base - (+avg || 0)) * pct));
}
function manualOrStartHcp(league, player) {
  if (Number.isFinite(+player.hcp) && +player.hcp >= 0) return +player.hcp;
  const startAve = Number.isFinite(+player.start_average) ? +player.start_average : (+player.average || 0);
  return playerHandicapPerGame(league, startAve, null);
}
function teamHandicapPerGame(leagueRaw, teamId) {
  const league = normalizeLeague(leagueRaw);
  if (!league || league.mode === 'scratch') return 0;
  const roster = (db.data.team_players || [])
    .filter(tp => tp.team_id === teamId && tp.league_id === league.id)
    .map(tp => (db.data.players || []).find(p => p.id === tp.player_id))
    .filter(Boolean);
  let perGame = 0;
  for (const b of roster) perGame += Math.max(0, league.handicapBase - (+b.average || 0)) * (league.handicapPercent / 100);
  return Math.round(perGame);
}
function seriesForMatch(leagueRaw, match, sideTeamId) {
  const league = normalizeLeague(leagueRaw);
  const games = league.gamesPerWeek;
  const s = match.home_team_id === sideTeamId ? (+match.home_score || 0) : (+match.away_score || 0);
  const h = s + teamHandicapPerGame(league, sideTeamId) * games;
  return { scratch: s, handicap: league.mode === 'scratch' ? s : h };
}
function approxHighGameFromSeries(series, gamesPerWeek) {
  const g = Math.max(1, +gamesPerWeek || 3);
  return Math.ceil((+series || 0) / g);
}
function teamPointsFor(leagueRaw, homePins, awayPins) {
  const league = normalizeLeague(leagueRaw);
  if (homePins === awayPins) return [league.teamPointsDraw, league.teamPointsDraw];
  return homePins > awayPins ? [league.teamPointsWin, 0] : [0, league.teamPointsWin];
}
function cmpVal(leagueRaw, g, hcp) {
  const league = normalizeLeague(leagueRaw);
  const scratch = num(g);
  return league.mode === 'scratch' ? scratch : scratch + num(hcp);
}
function rowScratchSeries(r){ return num(r.g1)+num(r.g2)+num(r.g3); }
function rowHandicapSeries(leagueRaw, r){
  const league = normalizeLeague(leagueRaw);
  return rowScratchSeries(r) + (league.mode==='scratch' ? 0 : 3*num(r.hcp));
}

/* ===== Blind-aware scoring helper ===== */
function blindAwareOutcome(aVal, bVal, aBlind, bBlind, winPts, drawPts) {
  // both blind => no points
  if (aBlind && bBlind) return [0, 0];

  // A blind => A never scores; B only if strictly greater
  if (aBlind && !bBlind) return (bVal > aVal) ? [0, winPts] : [0, 0];

  // B blind => B never scores; A only if strictly greater
  if (!aBlind && bBlind) return (aVal > bVal) ? [winPts, 0] : [0, 0];

  // neither blind => normal outcome
  if (aVal === bVal) return [drawPts, drawPts];
  return (aVal > bVal) ? [winPts, 0] : [0, winPts];
}

/* Build per-player stats from sheets up to week */
function computePlayerStatsForLeague(leagueRaw, upToWeek = null) {
  const league = normalizeLeague(leagueRaw);
  const sheets = (db.data.sheets || [])
    .filter(s => s.league_id === league.id && (upToWeek == null || s.week_number <= upToWeek));
  const INDIV_WIN  = num(league.indivPointsWin);
  const INDIV_DRAW = num(league.indivPointsDraw);

  const stats = new Map();
  const ensure = (pid) => {
    if (!stats.has(pid)) stats.set(pid, { gms:0, pts:0, pinss:0, pinsh:0, hgs:0, hgh:0, hss:0, hsh:0, ave:0 });
    return stats.get(pid);
  };

  for (const s of sheets) {
    const A = (s.homeGames || []).filter(r => r && r.playerId);
    const B = (s.awayGames || []).filter(r => r && r.playerId);
    const maxRows = Math.max(A.length, B.length);

    for (let i = 0; i < maxRows; i++) {
      const ra = A[i], rb = B[i];

      for (const gKey of ['g1','g2','g3']) {
        const aVal = ra ? cmpVal(league, ra[gKey], ra?.hcp) : null;
        const bVal = rb ? cmpVal(league, rb[gKey], rb?.hcp) : null;

        if (ra && num(ra[gKey]) > 0) {
          const aS = ensure(+ra.playerId);
          aS.gms += 1;
          aS.pinss += num(ra[gKey]);
          aS.pinsh += (league.mode === 'scratch' ? num(ra[gKey]) : num(ra[gKey]) + num(ra.hcp));
          aS.hgs = Math.max(aS.hgs, num(ra[gKey]));
          aS.hgh = Math.max(aS.hgh, num(ra[gKey]) + (league.mode === 'scratch' ? 0 : num(ra.hcp)));
        }
        if (rb && num(rb[gKey]) > 0) {
          const bS = ensure(+rb.playerId);
          bS.gms += 1;
          bS.pinss += num(rb[gKey]);
          bS.pinsh += (league.mode === 'scratch' ? num(rb[gKey]) : num(rb[gKey]) + num(rb.hcp));
          bS.hgs = Math.max(bS.hgs, num(rb[gKey]));
          bS.hgh = Math.max(bS.hgh, num(rb[gKey]) + (league.mode === 'scratch' ? 0 : num(rb.hcp)));
        }

        // blind-aware singles points
        if (ra && rb && num(aVal) > 0 && num(bVal) > 0) {
          const aBlind = !!ra.blind;
          const bBlind = !!rb.blind;

          const [aPts, bPts] = blindAwareOutcome(
            num(aVal),
            num(bVal),
            aBlind,
            bBlind,
            INDIV_WIN,
            INDIV_DRAW
          );

          if (aPts) ensure(+ra.playerId).pts += aPts;
          if (bPts) ensure(+rb.playerId).pts += bPts;
        }
      }

      if (ra) {
        const aS = ensure(+ra.playerId);
        aS.hss = Math.max(aS.hss, rowScratchSeries(ra));
        aS.hsh = Math.max(aS.hsh, rowHandicapSeries(league, ra));
      }
      if (rb) {
        const bS = ensure(+rb.playerId);
        bS.hss = Math.max(bS.hss, rowScratchSeries(rb));
        bS.hsh = Math.max(bS.hsh, rowHandicapSeries(league, rb));
      }
    }
  }

  // Averages: no decimals, always rounded down
  for (const s of stats.values()) s.ave = s.gms ? Math.floor(s.pinss / s.gms) : 0;
  return stats;
}

/* Display HCP after freeze */
function hcpDisplayFromEffectiveAverage(league, effectiveAvg) {
  if (!league || league.mode === 'scratch') return 0;
  const base = +league.handicapBase || 200;
  const pct  = (+league.handicapPercent || 0) / 100;
  return Math.max(0, Math.round((base - (+effectiveAvg || 0)) * pct));
}

/* Single source of truth for display (Players, Standings, Enter Scores) */
function hcpDisplayForList(league, displayWeek, player, effectiveAvg) {
  if (inFreeze(league, displayWeek)) return manualOrStartHcp(league, player);
  if (Number.isFinite(+effectiveAvg) && +effectiveAvg > 0) {
    return hcpDisplayFromEffectiveAverage(league, +effectiveAvg);
  }
  return manualOrStartHcp(league, player);
}

/* Recompute players as of a cutoff week (persisted fields)
   IMPORTANT: p.hcp is manual-only and is NOT modified here. */
function recomputePlayersUpToWeek(leagueRaw, upToWeek) {
  const league = normalizeLeague(leagueRaw);
  const sheets = (db.data.sheets || [])
    .filter(s => s.league_id === league.id && s.week_number <= upToWeek);

  const agg = new Map(); // pid -> { gms, pins }
  const bump = (row) => {
    if (!row?.playerId) return;
    const pid = +row.playerId;
    const a = agg.get(pid) || { gms:0, pins:0 };
    a.gms  += 3;
    a.pins += (num(row.g1) + num(row.g2) + num(row.g3));
    agg.set(pid, a);
  };
  for (const s of sheets) {
    (s.homeGames || []).forEach(bump);
    (s.awayGames || []).forEach(bump);
  }

  const allPlayers = (db.data.players || []).filter(p => p.league_id === league.id);

  for (const p of allPlayers) {
    const a = agg.get(p.id);
    if (a && a.gms) {
      p.average = Math.floor(a.pins / a.gms);
    } else {
      const fallback = Number.isFinite(+p.start_average) ? +p.start_average : (+p.average || 0);
      p.average = Math.floor(fallback);
    }
    // DO NOT modify p.hcp here (manual-only).
  }
}

/* ===== Health ===== */
app.get('/api/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

/* ===== Leagues ===== */
app.get('/api/leagues', (req, res) => { db.read(); res.json(db.data.leagues); });

app.post('/api/leagues', (req, res) => {
  db.read();
  const {
    name,
    teamsCount = 0,
    weeks = 0,
    handicapBase = 200,
    handicapPercent = 90,
    teamPointsWin = 2,
    teamPointsDraw = 1,
    indivPointsWin = 1,
    indivPointsDraw = 0,
    gamesPerWeek = 3,
    mode = 'handicap',
    hcpLockWeeks = 0,
    hcpLockFromWeek = 0,
    pin
  } = req.body || {};

  if (!name) return res.status(400).json({ error: 'name required' });
  if (!pin)  return res.status(400).json({ error: 'admin pin required' });

  const id = nextId('leagues');
  const league = {
    id,
    name,
    teamsCount: +teamsCount || 0,
    weeks: +weeks || 0,
    handicapBase: +handicapBase || 200,
    handicapPercent: +handicapPercent || 90,
    teamPointsWin: +teamPointsWin || 0,
    teamPointsDraw: +teamPointsDraw || 0,
    indivPointsWin: +indivPointsWin || 0,
    indivPointsDraw: +indivPointsDraw || 0,
    gamesPerWeek: +gamesPerWeek || 3,
    mode: mode === 'scratch' ? 'scratch' : 'handicap',
    hcpLockWeeks: +hcpLockWeeks || 0,
    hcpLockFromWeek: +hcpLockFromWeek || 0,
    pin: String(pin),
    logo: null,
    created_at: new Date().toISOString()
  };
  db.data.leagues.push(league);
  db.write();
  res.json({ id, name });
});

app.put('/api/leagues/:id', requireAuth, (req, res) => {
  db.read();
  const id = +req.params.id;
  const league = (db.data.leagues || []).find(l => l.id === id);
  if (!league) return res.status(404).json({ error: 'league not found' });
  if (req.league.id !== league.id) return res.status(403).json({ error: 'forbidden' });

  const up = req.body || {};
  const numOr = (v, def) => (v === undefined ? undefined : (+v || def));

  if (up.name !== undefined) league.name = String(up.name);
  if (up.handicapBase !== undefined) league.handicapBase = +up.handicapBase || 200;
  if (up.handicapPercent !== undefined) league.handicapPercent = +up.handicapPercent || 90;
  if (up.gamesPerWeek !== undefined) league.gamesPerWeek = +up.gamesPerWeek || 3;
  if (up.mode !== undefined) league.mode = up.mode === 'scratch' ? 'scratch' : 'handicap';
  if (up.teamPointsWin !== undefined) league.teamPointsWin = +up.teamPointsWin || 0;
  if (up.teamPointsDraw !== undefined) league.teamPointsDraw = +up.teamPointsDraw || 0;
  if (up.indivPointsWin !== undefined) league.indivPointsWin = +up.indivPointsWin || 0;
  if (up.indivPointsDraw !== undefined) league.indivPointsDraw = +up.indivPointsDraw || 0;

  if (up.hcpLockWeeks !== undefined) league.hcpLockWeeks = numOr(up.hcpLockWeeks, 0);
  if (up.hcpLockFromWeek !== undefined) league.hcpLockFromWeek = numOr(up.hcpLockFromWeek, 0);

  db.write();
  res.json({ ok: true, league: normalizeLeague(league) });
});

/* ===== Players ===== */
app.get('/api/players', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  res.json((db.data.players || [])
    .filter(p => p.league_id === leagueId)
    .sort((a,b)=> a.name.localeCompare(b.name)));
});

// CREATE PLAYER (floor averages)
app.post('/api/players', requireAuth, (req, res) => {
  db.read();
  const league = normalizeLeague(req.league);
  const { name, average = 0, hcp = null, gender = null, teamId = null } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  const startAve   = Math.floor(+average || 0);
  const initialHcp = Number.isFinite(+hcp) ? +hcp : playerHandicapPerGame(league, startAve, null);

  const row = {
    id: nextId('players'),
    league_id: league.id,
    name: String(name),
    average: startAve,
    start_average: startAve,
    hcp: initialHcp,
    gender: (gender === 'M' || gender === 'F') ? gender : null,
    created_at: new Date().toISOString()
  };
  db.data.players.push(row);

  if (teamId) {
    db.data.team_players = (db.data.team_players || []).filter(tp => !(tp.league_id === league.id && tp.player_id === row.id));
    db.data.team_players.push({ league_id: league.id, team_id: +teamId, player_id: row.id });
  }

  db.write();
  res.json(row);
});

// UPDATE PLAYER (manual handicap unchanged unless explicitly set; floor averages)
app.put('/api/players/:id', requireAuth, (req, res) => {
  db.read();
  const id = +req.params.id;
  const { name, average, hcp, gender, teamId, start_average } = req.body || {};

  const p = (db.data.players || []).find(x => x.id === id && x.league_id === req.league.id);
  if (!p) return res.status(404).json({ error: 'player not found' });

  if (name != null) p.name = String(name);
  if (average != null) p.average = Math.floor(+average || 0);
  if (start_average != null) p.start_average = Math.floor(+start_average || 0);

  // Manual handicap: update ONLY if the 'hcp' key is present and valid.
  if (Object.prototype.hasOwnProperty.call(req.body, 'hcp')) {
    if (hcp !== '' && hcp !== null && Number.isFinite(+hcp)) {
      p.hcp = Math.max(0, +hcp);
    }
  }

  if (gender === 'M' || 'F' || gender === null) p.gender = gender ?? null;

  if (teamId !== undefined) {
    db.data.team_players = (db.data.team_players || [])
      .filter(tp => !(tp.league_id === req.league.id && tp.player_id === id));
    if (teamId) db.data.team_players.push({ league_id: req.league.id, team_id: +teamId, player_id: id });
  }

  db.write();
  res.json(p);
});

app.delete('/api/players/:id', requireAuth, (req, res) => {
  db.read();
  const id = +req.params.id;

  const p = (db.data.players || []).find(x => x.id === id && x.league_id === req.league.id);
  if (!p) return res.status(404).json({ error: 'player not found' });

  db.data.players = (db.data.players || []).filter(x => !(x.id === id && x.league_id === req.league.id));
  db.data.team_players = (db.data.team_players || []).filter(tp => !(tp.player_id === id && tp.league_id === req.league.id));

  db.write();
  res.json({ ok: true, id });
});

/* ===== Teams ===== */
app.get('/api/teams', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  res.json((db.data.teams || [])
    .filter(t => t.league_id === leagueId)
    .sort((a,b)=> a.name.localeCompare(b.name)));
});

app.post('/api/teams', requireAuth, (req, res) => {
  db.read();
  const { name, playerIds = [] } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = nextId('teams');
  db.data.teams.push({ id, league_id: req.league.id, name, created_at: new Date().toISOString() });
  for (const pid of playerIds) db.data.team_players.push({ league_id: req.league.id, team_id: id, player_id: +pid });
  db.write(); res.json({ id, name });
});

/* ===== Players directory (respects freeze for DISPLAY) ===== */
app.get('/api/players-with-teams', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);

  // displayWeek decides freeze; statsUpTo controls aggregation (null = all weeks)
  const displayWeek = req.query.week != null ? +req.query.week : 0;
  const statsUpTo   = req.query.week != null ? +req.query.week : null;

  const leagueRaw  = (db.data.leagues || []).find(l => l.id === leagueId);
  const league = normalizeLeague(leagueRaw);
  const players = (db.data.players || []).filter(p => p.league_id === leagueId);
  const tps     = (db.data.team_players || []).filter(tp => tp.league_id === leagueId);
  const teams   = (db.data.teams || []).filter(t => t.league_id === leagueId);

  const teamById = new Map(teams.map(t => [t.id, t]));
  const firstTeamByPlayer = new Map();
  for (const tp of tps) if (!firstTeamByPlayer.has(tp.player_id)) firstTeamByPlayer.set(tp.player_id, tp.team_id);

  const playerStats = league ? computePlayerStatsForLeague(league, statsUpTo) : new Map();

  const rows = players.map(p => {
    const team_id = firstTeamByPlayer.get(p.id) ?? null;
    const st = playerStats.get(p.id) || { gms:0, pts:0, pinss:0, pinsh:0, hgs:0, hgh:0, hss:0, hsh:0, ave:+p.average||0 };
    const effectiveAvg = (st.ave && st.ave > 0) ? st.ave : (+p.average || 0);
    const showHcp = hcpDisplayForList(league, displayWeek, p, effectiveAvg);

    return {
      id: p.id,
      name: p.name,
      gender: p.gender || null,
      hcp: showHcp,
      team_id,
      team_name: team_id ? (teamById.get(team_id)?.name || 'Team') : '— Sub / Free Agent —',
      gms: st.gms, pts: st.pts, ave: st.ave,
      pinss: st.pinss, pinsh: st.pinsh,
      hgs: st.hgs, hgh: st.hgh, hss: st.hss, hsh: st.hsh
    };
  }).sort((a,b)=> a.team_name.localeCompare(b.team_name) || a.name.localeCompare(b.name));

  res.json(rows);
});

/* ===== Matches ===== */
app.get('/api/matches', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  const rows = (db.data.matches || [])
    .filter(m => m.league_id === leagueId)
    .map(m => {
      const w  = (db.data.weeks  || []).find(w => w.id === m.week_id) || {};
      const ht = (db.data.teams  || []).find(t => t.id === m.home_team_id) || { name: 'Home' };
      const at = (db.data.teams  || []).find(t => t.id === m.away_team_id) || { name: 'Away' };
      return { ...m, week_number: w.week_number, date: w.date, home_name: ht.name, away_name: at.name };
    })
    .sort((a,b)=> (a.week_number||0)-(b.week_number||0) || a.id-b.id);
  res.json(rows);
});

/* ===== Match Sheet (now mirrors Players-page HCP outside freeze) ===== */
app.get('/api/match-sheet', (req, res) => {
  db.read();

  const leagueId   = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  const weekNumber = Number.isFinite(+req.query.weekNumber) ? +req.query.weekNumber : 0;
  const homeTeamId = +(req.query.homeTeamId || 0);
  const awayTeamId = +(req.query.awayTeamId || 0);

  const leagueRaw = (db.data.leagues || []).find(l => l.id === leagueId);
  const league = normalizeLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: 'league not found' });

  // Align stats/effectiveAvg with Players page for the chosen week
  const statsForWeek = computePlayerStatsForLeague(league, weekNumber);

  const teams   = (db.data.teams || []).filter(t => t.league_id === leagueId);
  const home    = teams.find(t => t.id === homeTeamId) || null;
  const away    = teams.find(t => t.id === awayTeamId) || null;
  const tps     = (db.data.team_players || []).filter(tp => tp.league_id === leagueId);
  const players = (db.data.players || []);

  const rosterIdsFor = (teamId) => new Set(tps.filter(tp => tp.team_id === teamId).map(tp => tp.player_id));

  const shape = (p) => {
    const st = statsForWeek.get(p.id);
    const statAve  = st && Number.isFinite(+st.ave) ? +st.ave : 0;
    const fallback = Number.isFinite(+p.average) ? +p.average : (Number.isFinite(+p.start_average) ? +p.start_average : 0);
    const effAvg   = statAve > 0 ? statAve : fallback;

    return {
      id: p.id,
      name: p.name,
      average: effAvg,
      gender: p.gender || null,
      hcp: hcpDisplayForList(league, weekNumber, p, effAvg) // <- identical to Players page
    };
  };

  const homeRosterIds = home ? rosterIdsFor(home.id) : new Set();
  const awayRosterIds = away ? rosterIdsFor(away.id) : new Set();

  const homeRoster = home ? players.filter(p => homeRosterIds.has(p.id)).map(shape).sort((a,b)=>a.name.localeCompare(b.name)) : [];
  const awayRoster = away ? players.filter(p => awayRosterIds.has(p.id)).map(shape).sort((a,b)=>a.name.localeCompare(b.name)) : [];

  const homeSubs = players.filter(p => !homeRosterIds.has(p.id)).map(shape).sort((a,b)=>a.name.localeCompare(b.name));
  const awaySubs = players.filter(p => !awayRosterIds.has(p.id)).map(shape).sort((a,b)=>a.name.localeCompare(b.name));

  res.json({
    league: {
      id: league.id,
      name: league.name,
      gamesPerWeek: league.gamesPerWeek,
      teamPointsWin: league.teamPointsWin,
      teamPointsDraw: league.teamPointsDraw,
      indivPointsWin: league.indivPointsWin,
      indivPointsDraw: league.indivPointsDraw,
      mode: league.mode,
      hcpLockWeeks: league.hcpLockWeeks,
      hcpLockFromWeek: league.hcpLockFromWeek,
    },
    weekNumber,
    homeTeam: home ? { id: home.id, name: home.name } : null,
    awayTeam: away ? { id: away.id, name: away.name } : null,
    homeRoster, awayRoster, homeSubs, awaySubs
  });
});

/* ===== Utility used by POST /api/match-sheet when client doesn't send totals ===== */
function computeSinglesTotalsServer(homeRows, awayRows, indivWin, indivDraw, useHandicap) {
  const maxRows = Math.max(homeRows.length, awayRows.length);
  let homePts = 0, awayPts = 0;
  const val = (r, key) => (r ? num(r[key]) + (useHandicap ? num(r.hcp) : 0) : 0);
  const isBlind = (r) => !!(r && r.blind);
  for (let i = 0; i < maxRows; i++) {
    const a = homeRows[i], b = awayRows[i];
    if (!a || !b) continue;
    for (const gk of ['g1','g2','g3']) {
      const av = val(a, gk), bv = val(b, gk);
      const [aPts, bPts] = blindAwareOutcome(av, bv, isBlind(a), isBlind(b), indivWin, indivDraw);
      homePts += aPts;
      awayPts += bPts;
    }
  }
  return { homePts, awayPts };
}

/* ===== Save Match Sheet ===== */
app.post('/api/match-sheet', requireAuth, (req, res) => {
  db.read();
  const league = normalizeLeague(req.league);
  const { weekNumber, homeTeamId, awayTeamId, homeGames, awayGames } = req.body || {};

  if (!weekNumber || !homeTeamId || !awayTeamId)
    return res.status(400).json({ error: 'weekNumber, homeTeamId, awayTeamId required' });

  // ensure week
  let week = (db.data.weeks || []).find(w => w.league_id === league.id && w.week_number === +weekNumber);
  if (!week) {
    const weekId = nextId('weeks');
    week = { id: weekId, league_id: league.id, week_number: +weekNumber, date: null };
    db.data.weeks.push(week);
  }

  // ensure match
  let match = (db.data.matches || []).find(m =>
    m.league_id === league.id && m.week_id === week.id &&
    m.home_team_id === +homeTeamId && m.away_team_id === +awayTeamId
  );
  if (!match) {
    const matchId = nextId('matches');
    match = { id: matchId, league_id: league.id, week_id: week.id,
      home_team_id: +homeTeamId, away_team_id: +awayTeamId,
      home_score: 0, away_score: 0, home_points: 0, away_points: 0 };
    db.data.matches.push(match);
  }

  // Scratch series (stored like before)
  const sumSeriesScratch = (rows=[]) =>
    rows.reduce((s, r) => s + num(r.g1) + num(r.g2) + num(r.g3), 0);

  const homeSeriesScratch = sumSeriesScratch(homeGames || []);
  const awaySeriesScratch = sumSeriesScratch(awayGames || []);
  match.home_score = homeSeriesScratch;
  match.away_score = awaySeriesScratch;

  // If the client reported the TOTAL points (games+series+singles), trust it.
  const rpHome = num(req.body.totalPointsHome ?? (req.body.totalPoints && req.body.totalPoints.home));
  const rpAway = num(req.body.totalPointsAway ?? (req.body.totalPoints && req.body.totalPoints.away));
  const clientProvidedTotals = ('totalPointsHome' in (req.body||{})) || ('totalPointsAway' in (req.body||{})) || ('totalPoints' in (req.body||{}));

  if (clientProvidedTotals) {
    match.home_points = rpHome;
    match.away_points = rpAway;
  } else {
    // Fallback: compute team points per game + series (hcp if handicap mode) + singles points
    const W = num(league.teamPointsWin);
    const D = num(league.teamPointsDraw);
    const useHandicap = league.mode === 'handicap';

    const gameTotal = (rows, gKey) =>
      (rows || []).reduce((s, r) => s + num(r[gKey]) + (useHandicap ? num(r.hcp) : 0), 0);

    let homeTeamPts = 0, awayTeamPts = 0;
    for (const gKey of ['g1','g2','g3']) {
      const h = gameTotal(homeGames, gKey);
      const a = gameTotal(awayGames, gKey);
      if (h > a) homeTeamPts += W;
      else if (a > h) awayTeamPts += W;
      else { homeTeamPts += D; awayTeamPts += D; }
    }
    const seriesTotal = (rows) => ['g1','g2','g3'].reduce((s, gk) => s + gameTotal(rows, gk), 0);
    const hs = seriesTotal(homeGames), as = seriesTotal(awayGames);
    if (hs > as) homeTeamPts += W;
    else if (as > hs) awayTeamPts += W;
    else { homeTeamPts += D; awayTeamPts += D; }

    const singles = computeSinglesTotalsServer(
      homeGames || [],
      awayGames || [],
      num(league.indivPointsWin),
      num(league.indivPointsDraw),
      useHandicap
    );

    match.home_points = homeTeamPts + singles.homePts;
    match.away_points = awayTeamPts + singles.awayPts;
  }

  // overwrite sheet for same league/week/teams
  db.data.sheets = (db.data.sheets || []).filter(s =>
    !(s.league_id===league.id && s.week_number===+weekNumber && s.homeTeamId===+homeTeamId && s.awayTeamId===+awayTeamId)
  );
  db.data.sheets.push({
    league_id: league.id,
    week_number: +weekNumber,
    homeTeamId: +homeTeamId,
    awayTeamId: +awayTeamId,
    homeGames: homeGames || [],
    awayGames: awayGames || [],
    saved_at: new Date().toISOString()
  });

  // recompute averages ONLY; manual hcp is never changed here
  recomputePlayersUpToWeek(league, +weekNumber);

  db.write();
  res.json({ ok: true, matchId: match.id });
});

/* ===== Sheet-driven totals for team standings ===== */
const sSeries = r => (num(r.g1) + num(r.g2) + num(r.g3));
const hSeries = r => (num(r.g1)+num(r.hcp) + num(r.g2)+num(r.hcp) + num(r.g3)+num(r.hcp));

function sheetTotalsForMatch(leagueRaw, match) {
  const league = normalizeLeague(leagueRaw);
  const week = (db.data.weeks || []).find(w => w.id === match.week_id);
  if (!week) return null;

  const sheet = (db.data.sheets || []).find(s =>
    s.league_id === league.id &&
    s.week_number === week.week_number &&
    s.homeTeamId === match.home_team_id &&
    s.awayTeamId === match.away_team_id
  );
  if (!sheet) return null;

  const homeRows = sheet.homeGames || [];
  const awayRows = sheet.awayGames || [];

  const homeScratch = homeRows.reduce((a,r)=>a+sSeries(r), 0);
  const awayScratch = awayRows.reduce((a,r)=>a+sSeries(r), 0);
  const homeHandicap = homeRows.reduce((a,r)=>a+hSeries(r), 0);
  const awayHandicap = awayRows.reduce((a,r)=>a+hSeries(r), 0);

  const homeHgs = Math.max(0, ...homeRows.map(r => Math.max(num(r.g1), num(r.g2), num(r.g3))));
  const awayHgs = Math.max(0, ...awayRows.map(r => Math.max(num(r.g1), num(r.g2), num(r.g3))));
  const homeHgh = Math.max(0, ...homeRows.map(r => Math.max(num(r.g1)+num(r.hcp), num(r.g2)+num(r.hcp), num(r.g3)+num(r.hcp))));
  const awayHgh = Math.max(0, ...awayRows.map(r => Math.max(num(r.g1)+num(r.hcp), num(r.g2)+num(r.hcp), num(r.g3)+num(r.hcp))));
  const homeHss = Math.max(0, ...homeRows.map(r => sSeries(r)));
  const awayHss = Math.max(0, ...awayRows.map(r => sSeries(r)));
  const homeHsh = Math.max(0, ...homeRows.map(r => hSeries(r)));
  const awayHsh = Math.max(0, ...awayRows.map(r => hSeries(r)));

  return {
    homeScratch, awayScratch,
    homeHandicap, awayHandicap,
    homeHgs, awayHgs, homeHgh, awayHgh, homeHss, awayHss, homeHsh, awayHsh
  };
}

/* ===== Standings (teams) ===== */
app.get('/api/standings', (req, res) => {
  try {
    db.read();
    const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
    const upToWeek = req.query.week ? +req.query.week : null;

    const leagueRaw = (db.data.leagues || []).find(l => l && l.id === leagueId);
    const league = normalizeLeague(leagueRaw);
    if (!league) return res.json([]);

    const gamesPerWeek = league.gamesPerWeek;
    const teams = (db.data.teams || []).filter(t => t && t.league_id === league.id);
    const matches = (db.data.matches || []).filter(m => m && m.league_id === league.id)
      .filter(m => {
        if (upToWeek == null) return true;
        const w = (db.data.weeks || []).find(x => x.id === m.week_id);
        return w ? w.week_number <= upToWeek : true;
      });

    const rows = teams.map(t => {
      const played = matches.filter(m => m.home_team_id === t.id || m.away_team_id === t.id);

      let pinsS = 0, pinsH = 0, hgs = 0, hgh = 0, hss = 0, hsh = 0, won = 0;
      let matchesWithSheet = 0;

      for (const m of played) {
        const totals = sheetTotalsForMatch(league, m);
        if (!totals) continue;                // skip matches without a sheet

        matchesWithSheet += 1;

        const isHome = m.home_team_id === t.id;
        const sS = isHome ? totals.homeScratch   : totals.awayScratch;
        const sH = isHome ? totals.homeHandicap : totals.awayHandicap;

        pinsS += sS;
        pinsH += (league.mode === 'scratch' ? sS : sH);

        hgs = Math.max(hgs, isHome ? totals.homeHgs : totals.awayHgs);
        hgh = Math.max(hgh, isHome ? totals.homeHgh : totals.awayHgh);
        hss = Math.max(hss, isHome ? totals.homeHss : totals.awayHss);
        hsh = Math.max(hsh, isHome ? totals.homeHsh : totals.awayHsh);

        // Points come directly from match (these are the "Total Points" from Enter Scores)
        won += (m.home_team_id === t.id ? num(m.home_points) : num(m.away_points));
      }

      const games = matchesWithSheet * gamesPerWeek;
      return { id: t.id, name: t.name, games, won, pinsh: pinsH, pinss: pinsS, hgh, hgs, hsh, hss };
    });

    rows.sort((a,b)=> b.won - a.won || b.pinsh - a.pinsh || a.name.localeCompare(b.name));
    const withPos = rows.map((r,i)=> ({ pos:i+1, ...r }));
    res.json(withPos);
  } catch (err) {
    console.error('Standings error:', err);
    res.status(500).json({ error: 'standings_failed', message: String(err?.message || err) });
  }
});

/* ===== Individual standings (by team) ===== */
app.get('/api/standings/players', (req, res) => {
  try {
    db.read();
    const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
    const upToWeek = req.query.week ? +req.query.week : null;

    const leagueRaw   = (db.data.leagues || []).find(l => l && l.id === leagueId);
    const league = normalizeLeague(leagueRaw);
    if (!league) return res.json([]);

    const teams   = (db.data.teams || []).filter(t => t && t.league_id === league.id);
    const tps     = (db.data.team_players || []).filter(tp => tp && tp.league_id === league.id);
    const players = (db.data.players || []).filter(p => p && p.league_id === league.id);

    const statsMap = computePlayerStatsForLeague(league, upToWeek);
    const displayWeek = (upToWeek != null) ? +upToWeek : 0;

    const groups = teams.map(team => {
      const roster = tps
        .filter(tp => tp.team_id === team.id)
        .map(tp => players.find(p => p.id === tp.player_id))
        .filter(Boolean)
        .map(p => {
          const st = statsMap.get(p.id) || { gms:0, pts:0, pinss:0, pinsh:0, hgs:0, hgh:0, hss:0, hsh:0, ave:+p.average||0 };

          const effAvg = (st.ave && st.ave > 0) ? st.ave : (+p.average || 0);
          const hcpDisplay = hcpDisplayForList(league, displayWeek, p, effAvg);

          return {
            player_id: p.id,
            name: p.name,
            hcp: hcpDisplay,
            ave: st.ave,
            gms: st.gms, pts: st.pts,
            pinss: st.pinss, pinsh: st.pinsh,
            hgs: st.hgs, hgh: st.hgh, hss: st.hss, hsh: st.hsh
          };
        })
        .sort((a,b)=> b.pts - a.pts || b.pinsh - a.pinsh || a.name.localeCompare(b.name));

      return { team: { id: team.id, name: team.name }, players: roster };
    });

    res.json(groups);
  } catch (err) {
    console.error('player standings error:', err);
    res.status(500).json({ error: 'player_standings_failed', message: String(err?.message || err) });
  }
});

/* ===== Weeks: entered-only helpers ===== */

// Distinct weeks that have at least one saved sheet (i.e., entered weeks)
app.get('/api/weeks/entered', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);

  const allWeeks  = (db.data.weeks  || []).filter(w => w.league_id === leagueId);
  const allSheets = (db.data.sheets || []).filter(s => s.league_id === leagueId);

  // Unique week_numbers present in sheets
  const enteredWeekNumbers = Array.from(new Set(allSheets.map(s => s.week_number))).sort((a,b) => a - b);

  // Map weeks by week_number to fetch dates (if weeks were created with dates)
  const byWeekNumber = new Map(allWeeks.map(w => [w.week_number, w]));

  const result = enteredWeekNumbers.map(wn => ({
    week_number: wn,
    date: byWeekNumber.get(wn)?.date ?? null,
    sheet_count: allSheets.filter(s => s.week_number === wn).length,
  }));

  res.json(result);
});

/* ===== Archive / Sheets ===== */
app.get('/api/weeks', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  const enteredOnly = String(req.query.enteredOnly || '').trim() === '1';

  const weeks  = (db.data.weeks  || []).filter(w => w.league_id === leagueId);
  const sheets = (db.data.sheets || []).filter(s => s.league_id === leagueId);

  const countByWeek = new Map();
  for (const s of sheets) {
    countByWeek.set(s.week_number, (countByWeek.get(s.week_number) || 0) + 1);
  }

  let out = weeks
    .map(w => ({
      id: w.id,
      week_number: w.week_number,
      date: w.date,
      sheet_count: countByWeek.get(w.week_number) || 0
    }))
    .sort((a,b)=> a.week_number - b.week_number);

  if (enteredOnly) {
    out = out.filter(w => w.sheet_count > 0);
    const known = new Set(out.map(w => w.week_number));
    for (const [wn, cnt] of countByWeek.entries()) {
      if (!known.has(wn)) out.push({ id: null, week_number: wn, date: null, sheet_count: cnt });
    }
    out.sort((a,b)=> a.week_number - b.week_number);
  }

  res.json(out);
});

app.get('/api/sheets', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  const weekNumber = req.query.weekNumber ? +req.query.weekNumber : null;

  const teams = (db.data.teams || []).filter(t => t.league_id === leagueId);
  const teamName = id => teams.find(t => t.id === id)?.name || `Team ${id}`;

  const items = (db.data.sheets || [])
    .filter(s => s.league_id === leagueId && (weekNumber == null || s.week_number === weekNumber))
    .map(s => {
      const totals = (() => {
        const homeRows = s.homeGames || [];
        const awayRows = s.awayGames || [];
        const nn = v => (Number.isFinite(+v) ? +v : 0);
        const sSeries = r => (nn(r.g1) + nn(r.g2) + nn(r.g3));
        const hSeries = r => (nn(r.g1)+nn(r.hcp) + nn(r.g2)+nn(r.hcp) + nn(r.g3)+nn(r.hcp));
        const homeScratch = homeRows.reduce((a,r)=>a+sSeries(r), 0);
        const awayScratch = awayRows.reduce((a,r)=>a+sSeries(r), 0);
        const homeHandicap = homeRows.reduce((a,r)=>a+hSeries(r), 0);
        const awayHandicap = awayRows.reduce((a,r)=>a+hSeries(r), 0);
        return { homeScratch, awayScratch, homeHandicap, awayHandicap };
      })();

      return {
        week_number: s.week_number,
        homeTeamId: s.homeTeamId,
        awayTeamId: s.awayTeamId,
        home_team_name: teamName(s.homeTeamId),
        away_team_name: teamName(s.awayTeamId),
        saved_at: s.saved_at,
        totals
      };
    })
    .sort((a,b)=> a.week_number - b.week_number || a.home_team_name.localeCompare(b.home_team_name));

  res.json(items);
});

app.get('/api/sheet', (req, res) => {
  db.read();
  const leagueId   = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  const weekNumber = +req.query.weekNumber;
  const homeTeamId = +req.query.homeTeamId;
  const awayTeamId = +req.query.awayTeamId;

  if (!leagueId || !weekNumber || !homeTeamId || !awayTeamId) {
    return res.status(400).json({ error: 'weekNumber, homeTeamId, awayTeamId required' });
  }

  const sheet = (db.data.sheets || []).find(s =>
    s.league_id === leagueId &&
    s.week_number === weekNumber &&
    s.homeTeamId === homeTeamId &&
    s.awayTeamId === awayTeamId
  );

  if (!sheet) return res.status(404).json({ error: 'sheet not found' });
  res.json(sheet);
});

app.delete('/api/sheet', requireAuth, (req, res) => {
  db.read();
  const league = normalizeLeague(req.league);
  const weekNumber = +req.query.weekNumber;
  const homeTeamId = +req.query.homeTeamId;
  const awayTeamId = +req.query.awayTeamId;

  if (!weekNumber || !homeTeamId || !awayTeamId) {
    return res.status(400).json({ error: 'weekNumber, homeTeamId, awayTeamId required' });
  }

  const before = (db.data.sheets || []).length;
  db.data.sheets = (db.data.sheets || []).filter(s =>
    !(s.league_id===league.id && s.week_number===weekNumber && s.homeTeamId===homeTeamId && s.awayTeamId===awayTeamId)
  );

  const after = db.data.sheets.length;
  if (after === before) {
    db.write();
    return res.status(404).json({ error: 'sheet not found' });
  }

  // Reset the corresponding match (keep schedule, clear result)
  const week = (db.data.weeks || []).find(w => w.league_id === league.id && w.week_number === weekNumber);
  if (week) {
    const match = (db.data.matches || []).find(m =>
      m.league_id === league.id && m.week_id === week.id &&
      m.home_team_id === homeTeamId && m.away_team_id === awayTeamId
    );
    if (match) {
      match.home_score = 0;
      match.away_score = 0;
      match.home_points = 0;
      match.away_points = 0;
    }
  }

  // Recompute averages ONLY; manual hcp is never changed here
  const remainingWeeks = (db.data.sheets || [])
    .filter(s => s.league_id === league.id)
    .map(s => s.week_number);
  const lastWeek = remainingWeeks.length ? Math.max(...remainingWeeks) : 0;
  recomputePlayersUpToWeek(league, lastWeek);

  db.write();
  res.json({ ok: true, removed: before - after });
});


/* ===== Serve client (Vite dist) ===== */
app.use(express.static(path.join(__dirname, 'client', 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

/* ===== Start ===== */
app.listen(PORT, () => {
  console.log(`Bowling League server running on http://localhost:${PORT}`);
});

