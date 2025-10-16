// server.js (top)
const path = require('path');
const fs = require('fs');

// ----- DATA DIR (persistent on Render) -----
const DATA_DIR = process.env.DATA_DIR || __dirname;  // Render will set DATA_DIR=/data

// ----- DB -----
const dbFile = path.join(DATA_DIR, 'db.json');       // <— changed from __dirname

// ----- Uploads (logos) -----
const uploadsDir = path.join(DATA_DIR, 'uploads');   // <— changed from __dirname
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));


function nextId(collection) {
  const arr = db.data[collection] || [];
  return arr.length ? Math.max(...arr.map(r => r.id || 0)) + 1 : 1;
}

// ---------- helpers ----------
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
  const { leagueId, token } = getAuth(req);
  const league = (db.data.leagues || []).find(l => l.id === leagueId);
  if (!league) return res.status(401).json({ error: 'invalid league' });
  if (token !== tokenFor(leagueId, league.pin)) return res.status(401).json({ error: 'invalid token' });
  req.league = league;
  next();
}

// Normalize league so handicap math never silently zeroes out
function normalizeLeague(league) {
  const safe = { ...(league || {}) };
  const baseNum = +safe.handicapBase;
  const pctNum  = +safe.handicapPercent;

  safe.mode = safe.mode === 'scratch' ? 'scratch' : 'handicap';
  safe.handicapBase = Number.isFinite(baseNum) && baseNum > 0 ? baseNum : 200;
  safe.handicapPercent = Number.isFinite(pctNum) && pctNum > 0 ? pctNum : 90;
  safe.gamesPerWeek = Number.isFinite(+safe.gamesPerWeek) && +safe.gamesPerWeek > 0 ? +safe.gamesPerWeek : 3;

  safe.hcpLockFromWeek = Number.isFinite(+safe.hcpLockFromWeek) ? +safe.hcpLockFromWeek : 1;
  safe.hcpLockWeeks    = Number.isFinite(+safe.hcpLockWeeks) ? +safe.hcpLockWeeks : 0;

  safe.teamPointsWin  = Number.isFinite(+safe.teamPointsWin)  ? +safe.teamPointsWin  : 0;
  safe.teamPointsDraw = Number.isFinite(+safe.teamPointsDraw) ? +safe.teamPointsDraw : 0;
  safe.indivPointsWin = Number.isFinite(+safe.indivPointsWin) ? +safe.indivPointsWin : 0;
  safe.indivPointsDraw= Number.isFinite(+safe.indivPointsDraw)? +safe.indivPointsDraw: 0;

  return safe;
}

// Handicap per game for a player
function playerHandicapPerGame(leagueRaw, avg, storedHcp = null) {
  if (Number.isFinite(+storedHcp) && +storedHcp >= 0) return +storedHcp; // caller can force stored
  const league = normalizeLeague(leagueRaw);
  if (!league || league.mode === 'scratch') return 0;
  const base = league.handicapBase;
  const pct  = league.handicapPercent / 100;
  return Math.max(0, Math.round((base - (+avg || 0)) * pct));
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

// compute value used for head-to-head (game) comparison
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

/**
 * Build a per-player stats map from db.data.sheets for this league.
 * Returns Map<playerId, { gms, pts, pinss, pinsh, hgs, hgh, hss, hsh, ave }>
 * If upToWeek is provided, counts only weeks <= upToWeek.
 */
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

        if (ra && rb && num(aVal) > 0 && num(bVal) > 0) {
          if (aVal > bVal) ensure(+ra.playerId).pts += INDIV_WIN;
          else if (bVal > aVal) ensure(+rb.playerId).pts += INDIV_WIN;
          else {
            ensure(+ra.playerId).pts += INDIV_DRAW;
            ensure(+rb.playerId).pts += INDIV_DRAW;
          }
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

  for (const s of stats.values()) s.ave = s.gms ? Math.round((s.pinss / s.gms) * 10) / 10 : 0;
  return stats;
}

// Week-aware display handicap (no writes)
function displayHcpFor(leagueRaw, upToWeek, player, aveForWeek) {
  const league = normalizeLeague(leagueRaw);
  if (league.mode === 'scratch') return 0;

  const start = league.hcpLockFromWeek;
  const len   = league.hcpLockWeeks;
  const end   = start + Math.max(0, len) - 1;

  const withinFreeze = (len > 0) &&
    (upToWeek != null) &&
    upToWeek >= start && upToWeek <= end;

  if (withinFreeze && Number.isFinite(+player.hcp) && +player.hcp >= 0) {
    // During freeze, show the stored value if present
    return +player.hcp;
  }
  // Otherwise compute from the average up to that week
  return playerHandicapPerGame(league, aveForWeek, null);
}

// Handicap used on the match sheet for a given week (freeze-aware)
function hcpForWeek(leagueRaw, weekNumber, player) {
  const league = normalizeLeague(leagueRaw);
  const start = league.hcpLockFromWeek;
  const len   = league.hcpLockWeeks;
  const end   = start + Math.max(0, len) - 1;
  const withinFreeze = len > 0 && weekNumber >= start && weekNumber <= end;

  if (withinFreeze) {
    return Number.isFinite(+player.hcp)
      ? +player.hcp
      : playerHandicapPerGame(league, player.average, null);
  }
  return Number.isFinite(+player.hcp)
    ? +player.hcp
    : playerHandicapPerGame(league, player.average, null);
}

// Recompute player averages up to (and including) a week; and write handicap back post-freeze
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

  const start = league.hcpLockFromWeek;
  const len   = league.hcpLockWeeks;
  const end   = start + Math.max(0, len) - 1;
  const inFreeze = len > 0 && upToWeek >= start && upToWeek <= end;
  const pastFreeze = len === 0 ? true : upToWeek > end;

  for (const [pid, a] of agg.entries()) {
    const p = (db.data.players || []).find(x => x.id === pid && x.league_id === league.id);
    if (!p) continue;

    p.average = a.gms ? Math.round((a.pins / a.gms) * 10) / 10 : (p.average|0);

    if (inFreeze) {
      if (!Number.isFinite(+p.hcp) || +p.hcp < 0) {
        p.hcp = playerHandicapPerGame(league, p.average, null);
      }
    } else if (pastFreeze) {
      p.hcp = playerHandicapPerGame(league, p.average, null);
    }
  }
}

// ----- Health -----
app.get('/api/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

// ----- Leagues -----
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
    hcpLockFromWeek = 1,
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
    hcpLockFromWeek: +hcpLockFromWeek || 1,
    pin: String(pin),
    logo: null,
    created_at: new Date().toISOString()
  };
  db.data.leagues.push(league);
  db.write();
  res.json({ id, name });
});

// Update league settings
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
  if (up.hcpLockFromWeek !== undefined) league.hcpLockFromWeek = numOr(up.hcpLockFromWeek, 1) || 1;

  db.write();
  res.json({ ok: true, league: normalizeLeague(league) });
});

// Upload logo
app.post('/api/leagues/:id/logo', requireAuth, upload.single('logo'), (req, res) => {
  const id = +req.params.id;
  const league = (db.data.leagues || []).find(l => l.id === id);
  if (!league) return res.status(404).json({ error: 'league not found' });
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
  const newPath = path.join(uploadsDir, `${id}-logo${ext}`);
  fs.renameSync(req.file.path, newPath);
  league.logo = `/uploads/${id}-logo${ext}`;
  db.write();
  res.json({ ok: true, logo: league.logo });
});

// ----- Login -----
app.post('/api/login', (req, res) => {
  db.read();
  const { leagueId, pin } = req.body || {};
  const league = (db.data.leagues || []).find(l => l.id === +leagueId);
  if (!league) return res.status(404).json({ error: 'league not found' });
  if (String(pin) !== String(league.pin)) return res.status(401).json({ error: 'invalid pin' });
  res.json({ token: tokenFor(+leagueId, league.pin), league: { id: league.id, name: league.name, logo: league.logo } });
});

// ----- Players -----
app.get('/api/players', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  res.json((db.data.players || [])
    .filter(p => p.league_id === leagueId)
    .sort((a,b)=> a.name.localeCompare(b.name)));
});

app.post('/api/players', requireAuth, (req, res) => {
  const { name, average = 0, hcp = null, gender = null, teamId = null } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  db.read();
  const row = {
    id: nextId('players'),
    league_id: req.league.id,
    name: String(name),
    average: +average || 0,
    hcp: (hcp === '' || hcp == null) ? null : (+hcp || 0),
    gender: (gender === 'M' || gender === 'F') ? gender : null,
    created_at: new Date().toISOString()
  };
  db.data.players.push(row);

  if (teamId) {
    db.data.team_players = (db.data.team_players || []).filter(tp => !(tp.league_id === req.league.id && tp.player_id === row.id));
    db.data.team_players.push({ league_id: req.league.id, team_id: +teamId, player_id: row.id });
  }

  db.write();
  res.json(row);
});

app.put('/api/players/:id', requireAuth, (req, res) => {
  const id = +req.params.id;
  const { name, average, hcp, gender, teamId } = req.body || {};
  db.read();

  const p = (db.data.players || []).find(x => x.id === id && x.league_id === req.league.id);
  if (!p) return res.status(404).json({ error: 'player not found' });

  if (name != null)    p.name = String(name);
  if (average != null) p.average = +average || 0;
  if (hcp === '' || hcp == null) p.hcp = null;
  else if (hcp != null) p.hcp = +hcp || 0;
  if (gender === 'M' || gender === 'F' || gender === null) p.gender = gender ?? null;

  if (teamId !== undefined) {
    db.data.team_players = (db.data.team_players || []).filter(tp => !(tp.league_id === req.league.id && tp.player_id === id));
    if (teamId) db.data.team_players.push({ league_id: req.league.id, team_id: +teamId, player_id: id });
  }

  db.write();
  res.json(p);
});

app.delete('/api/players/:id', requireAuth, (req, res) => {
  const id = +req.params.id;
  db.read();

  const p = (db.data.players || []).find(x => x.id === id && x.league_id === req.league.id);
  if (!p) return res.status(404).json({ error: 'player not found' });

  db.data.players = (db.data.players || []).filter(x => !(x.id === id && x.league_id === req.league.id));
  db.data.team_players = (db.data.team_players || []).filter(tp => !(tp.player_id === id && tp.league_id === req.league.id));

  db.write();
  res.json({ ok: true, id });
});

// ----- Teams -----
app.get('/api/teams', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  res.json((db.data.teams || [])
    .filter(t => t.league_id === leagueId)
    .sort((a,b)=> a.name.localeCompare(b.name)));
});

app.post('/api/teams', requireAuth, (req, res) => {
  const { name, playerIds = [] } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  db.read();
  const id = nextId('teams');
  db.data.teams.push({ id, league_id: req.league.id, name, created_at: new Date().toISOString() });
  for (const pid of playerIds) db.data.team_players.push({ league_id: req.league.id, team_id: id, player_id: +pid });
  db.write(); res.json({ id, name });
});

// ----- Weeks -----
app.post('/api/weeks', requireAuth, (req, res) => {
  const { weekNumber, date = null, pairings = [] } = req.body || {};
  if (!weekNumber) return res.status(400).json({ error: 'weekNumber required' });
  db.read();
  const weekId = nextId('weeks');
  db.data.weeks.push({ id: weekId, league_id: req.league.id, week_number: +weekNumber, date });
  for (const p of pairings) {
    const id = nextId('matches');
    db.data.matches.push({
      id, league_id: req.league.id, week_id: weekId,
      home_team_id: +p.homeTeamId, away_team_id: +p.awayTeamId,
      home_score: 0, away_score: 0, home_points: 0, away_points: 0
    });
  }
  db.write(); res.json({ id: weekId, weekNumber, date });
});

// ----- Players directory with team & live stats (WEEK-AWARE, NO WRITES) -----
app.get('/api/players-with-teams', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  const upToWeek = req.query.week ? +req.query.week : null;

  const leagueRaw  = (db.data.leagues || []).find(l => l.id === leagueId);
  const league = normalizeLeague(leagueRaw);
  const players = (db.data.players || []).filter(p => p.league_id === leagueId);
  const tps     = (db.data.team_players || []).filter(tp => tp.league_id === leagueId);
  const teams   = (db.data.teams || []).filter(t => t.league_id === leagueId);

  const teamById = new Map(teams.map(t => [t.id, t]));
  const firstTeamByPlayer = new Map();
  for (const tp of tps) if (!firstTeamByPlayer.has(tp.player_id)) firstTeamByPlayer.set(tp.player_id, tp.team_id);

  const stats = league ? computePlayerStatsForLeague(league, upToWeek) : new Map();

  const rows = players.map(p => {
    const team_id = firstTeamByPlayer.get(p.id) ?? null;
    const st = stats.get(p.id) || { gms:0, pts:0, pinss:0, pinsh:0, hgs:0, hgh:0, hss:0, hsh:0, ave:+p.average||0 };

    const hcpDisplay = displayHcpFor(league, upToWeek, p, st.ave);

    return {
      id: p.id,
      name: p.name,
      gender: p.gender || null,
      hcp: hcpDisplay,
      team_id,
      team_name: team_id ? (teamById.get(team_id)?.name || 'Team') : '— Sub / Free Agent —',
      gms: st.gms, pts: st.pts, ave: st.ave,
      pinss: st.pinss, pinsh: st.pinsh,
      hgs: st.hgs, hgh: st.hgh, hss: st.hss, hsh: st.hsh
    };
  }).sort((a,b)=> a.team_name.localeCompare(b.team_name) || a.name.localeCompare(b.name));

  res.json(rows);
});

// ----- Matches (list & simple score update) -----
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

app.post('/api/matches/:id/score', requireAuth, (req, res) => {
  const id = +req.params.id;
  const { homePins = 0, awayPins = 0 } = req.body || {};
  db.read();
  const m = (db.data.matches || []).find(x => x.id === id && x.league_id === req.league.id);
  if (!m) return res.status(404).json({ error: 'match not found' });

  const [homePts, awayPts] = teamPointsFor(req.league, homePins|0, awayPins|0);
  m.home_score = homePins|0;
  m.away_score = awayPins|0;
  m.home_points = homePts;
  m.away_points = awayPts;

  db.write();
  res.json({ id, homePins: m.home_score, awayPins: m.away_score, homePoints: homePts, awayPoints: awayPts });
});

// ----- Match Sheet (per-week, two teams, per-bowler games) -----
app.get('/api/match-sheet', (req, res) => {
  db.read();

  const leagueId   = +(req.headers['x-league-id'] || req.query.leagueId || 0);
  const weekNumber = +(req.query.weekNumber || 1);
  const homeTeamId = +(req.query.homeTeamId || 0);
  const awayTeamId = +(req.query.awayTeamId || 0);

  const leagueRaw = (db.data.leagues || []).find(l => l.id === leagueId);
  const league = normalizeLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: 'league not found' });

  const teams   = (db.data.teams || []).filter(t => t.league_id === leagueId);
  const home    = teams.find(t => t.id === homeTeamId) || null;
  const away    = teams.find(t => t.id === awayTeamId) || null;
  const tps     = (db.data.team_players || []).filter(tp => tp.league_id === leagueId);
  const players = (db.data.players || []);

  const rosterIdsFor = (teamId) => new Set(tps.filter(tp => tp.team_id === teamId).map(tp => tp.player_id));

  const shape = (p) => ({
    id: p.id,
    name: p.name,
    average: +p.average || 0,
    gender: p.gender || null,
    hcp: hcpForWeek(league, weekNumber, p)
  });

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

  const sumSeries = (arr=[]) => arr.reduce((s, r) => s + (+r.g1||0) + (+r.g2||0) + (+r.g3||0), 0);
  const homeSeriesScratch = sumSeries(homeGames);
  const awaySeriesScratch = sumSeries(awayGames);
  match.home_score = homeSeriesScratch;
  match.away_score = awaySeriesScratch;

  const [hp, ap] = teamPointsFor(league, homeSeriesScratch, awaySeriesScratch);
  match.home_points = hp;
  match.away_points = ap;

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

  // recompute averages + write handicap according to freeze rules
  recomputePlayersUpToWeek(league, +weekNumber);

  db.write();
  res.json({ ok: true, matchId: match.id });
});

// ===== Sheet-driven totals for team standings =====
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
  theAwayRows = sheet.awayGames || [];

  const homeScratch = homeRows.reduce((a,r)=>a+sSeries(r), 0);
  const awayScratch = theAwayRows.reduce((a,r)=>a+sSeries(r), 0);
  const homeHandicap = homeRows.reduce((a,r)=>a+hSeries(r), 0);
  const awayHandicap = theAwayRows.reduce((a,r)=>a+hSeries(r), 0);

  const homeHgs = Math.max(0, ...homeRows.map(r => Math.max(num(r.g1), num(r.g2), num(r.g3))));
  const awayHgs = Math.max(0, ...theAwayRows.map(r => Math.max(num(r.g1), num(r.g2), num(r.g3))));
  const homeHgh = Math.max(0, ...homeRows.map(r => Math.max(num(r.g1)+num(r.hcp), num(r.g2)+num(r.hcp), num(r.g3)+num(r.hcp))));
  const awayHgh = Math.max(0, ...theAwayRows.map(r => Math.max(num(r.g1)+num(r.hcp), num(r.g2)+num(r.hcp), num(r.g3)+num(r.hcp))));
  const homeHss = Math.max(0, ...homeRows.map(r => sSeries(r)));
  const awayHss = Math.max(0, ...theAwayRows.map(r => sSeries(r)));
  const homeHsh = Math.max(0, ...homeRows.map(r => hSeries(r)));
  const awayHsh = Math.max(0, ...theAwayRows.map(r => hSeries(r)));

  return {
    homeScratch, awayScratch,
    homeHandicap, awayHandicap,
    homeHgs, awayHgs, homeHgh, awayHgh, homeHss, awayHss, homeHsh, awayHsh
  };
}

// ----- Standings (teams) (WEEK-AWARE, NO WRITES) -----
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
      for (const m of played) {
        const totals = sheetTotalsForMatch(league, m);

        if (totals) {
          const isHome = m.home_team_id === t.id;
          const sS = isHome ? totals.homeScratch   : totals.awayScratch;
          const sH = isHome ? totals.homeHandicap : totals.awayHandicap;

          pinsS += sS;
          pinsH += (league.mode === 'scratch' ? sS : sH);

          hgs = Math.max(hgs, isHome ? totals.homeHgs : totals.awayHgs);
          hgh = Math.max(hgh, isHome ? totals.homeHgh : totals.awayHgh);
          hss = Math.max(hss, isHome ? totals.homeHss : totals.awayHss);
          hsh = Math.max(hsh, isHome ? totals.homeHsh : totals.awayHsh);
        } else {
          const { scratch, handicap } = seriesForMatch(league, m, t.id);
          pinsS += scratch;
          pinsH += handicap;
          hgs = Math.max(hgs, approxHighGameFromSeries(scratch, gamesPerWeek));
          hgh = Math.max(hgh, approxHighGameFromSeries(handicap, gamesPerWeek));
          hss = Math.max(hss, scratch);
          hsh = Math.max(hsh, handicap);
        }

        won += (m.home_team_id === t.id ? num(m.home_points) : num(m.away_points));
      }

      const games = played.length * gamesPerWeek;
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

// ----- Individual standings (by team) (WEEK-AWARE, NO WRITES) -----
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

    const stats = computePlayerStatsForLeague(league, upToWeek);

    const groups = teams.map(team => {
      const roster = tps
        .filter(tp => tp.team_id === team.id)
        .map(tp => players.find(p => p.id === tp.player_id))
        .filter(Boolean)
        .map(p => {
          const st = stats.get(p.id) || { gms:0, pts:0, pinss:0, pinsh:0, hgs:0, hgh:0, hss:0, hsh:0, ave:+p.average||0 };

          const hcpDisplay = displayHcpFor(league, upToWeek, p, st.ave);

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

// ===== Archive / Sheets =====

// List weeks (with how many sheets saved per week)
app.get('/api/weeks', (req, res) => {
  db.read();
  const leagueId = +(req.headers['x-league-id'] || req.query.leagueId || 0);

  const weeks = (db.data.weeks || []).filter(w => w.league_id === leagueId);
  const sheets = (db.data.sheets || []).filter(s => s.league_id === leagueId);

  const countByWeek = new Map();
  for (const s of sheets) {
    countByWeek.set(s.week_number, (countByWeek.get(s.week_number) || 0) + 1);
  }

  const out = weeks
    .map(w => ({
      id: w.id,
      week_number: w.week_number,
      date: w.date,
      sheet_count: countByWeek.get(w.week_number) || 0
    }))
    .sort((a,b)=> a.week_number - b.week_number);

  res.json(out);
});

// List all saved sheets for a league (optionally filter by weekNumber)
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
        const num = v => (Number.isFinite(+v) ? +v : 0);
        const sSeries = r => (num(r.g1) + num(r.g2) + num(r.g3));
        const hSeries = r => (num(r.g1)+num(r.hcp) + num(r.g2)+num(r.hcp) + num(r.g3)+num(r.hcp));
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

// Get a single saved sheet (for editing)
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

// Delete a saved sheet
app.delete('/api/sheet', requireAuth, (req, res) => {
  db.read();
  const league = req.league;
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
  db.write();

  if (after === before) return res.status(404).json({ error: 'sheet not found' });
  res.json({ ok: true, removed: before - after });
});


// ----- Serve client -----
app.use(express.static(path.join(__dirname, 'client', 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

// ----- Start -----
app.listen(PORT, () => {
  console.log(`Bowling League server running on http://localhost:${PORT}`);
});
