// src/pages/Standings.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import WeekPicker from '../components/WeekPicker.jsx';
import { getAuthHeaders } from '../lib/auth.js';

export default function Standings() {
  const [params] = useSearchParams();
  const week = params.get('week'); // string or null

  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [playerGroups, setPlayerGroups] = useState([]);
  const [enteredWeekOptions, setEnteredWeekOptions] = useState([]);

  const authHeaders = useMemo(() => getAuthHeaders(), []);

  // Load current league (optional, just for title / total weeks fallback)
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/leagues');
      const all = await res.json();
      const id = Number(authHeaders['x-league-id'] || 0);
      setLeague(all.find(l => l.id === id) || null);
    })();
  }, [authHeaders]);

  // Load **entered** weeks for dropdown
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/weeks?enteredOnly=1`, { headers: authHeaders });
      const weeks = await res.json(); // [{ id, week_number, date, sheet_count }]
      // Build labels like "Week 4 — 2024-10-03" when a date exists
      const opts = weeks.map(w => {
        const iso = w.date ? new Date(w.date).toISOString().slice(0, 10) : null;
        return { value: String(w.week_number), label: iso ? `Week ${w.week_number} — ${iso}` : `Week ${w.week_number}` };
      });
      setEnteredWeekOptions(opts);
    })();
  }, [authHeaders]);

  // Fetch team standings (week-aware)
  useEffect(() => {
    (async () => {
      const q = week ? `?week=${encodeURIComponent(week)}` : '';
      const res = await fetch(`/api/standings${q}`, { headers: authHeaders });
      setTeams(await res.json());
    })();
  }, [authHeaders, week]);

  // Fetch individual standings (week-aware)
  useEffect(() => {
    (async () => {
      const q = week ? `?week=${encodeURIComponent(week)}` : '';
      const res = await fetch(`/api/standings/players${q}`, { headers: authHeaders });
      setPlayerGroups(await res.json());
    })();
  }, [authHeaders, week]);

  const maxWeeks = league?.weeks ? Number(league.weeks) : 20;

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2 style={{ margin:0 }}>Standings{week ? ` – Week ${week}` : ''}</h2>
        {/* Pass the options so the picker shows only entered weeks.
            It will fall back to 1..maxWeeks if options is empty. */}
        <WeekPicker options={enteredWeekOptions} maxWeeks={maxWeeks} />
      </div>

      {/* Team standings */}
      <div style={{ border:'1px solid var(--border, #ddd)', borderRadius:12, padding:12 }}>
        <h3 style={{ marginTop:0 }}>Teams</h3>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th align="left">#</th>
                <th align="left">Team</th>
                <th>Gms</th>
                <th>Pts</th>
                <th>PinS</th>
                <th>PinH</th>
                <th>Hgs</th>
                <th>Hgh</th>
                <th>Hss</th>
                <th>Hsh</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>{t.pos}</td>
                  <td>{t.name}</td>
                  <td align="center">{t.games}</td>
                  <td align="center">{t.won}</td>
                  <td align="center">{t.pinss}</td>
                  <td align="center">{t.pinsh}</td>
                  <td align="center">{t.hgs}</td>
                  <td align="center">{t.hgh}</td>
                  <td align="center">{t.hss}</td>
                  <td align="center">{t.hsh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual standings by team */}
      <div style={{ display:'grid', gap:16 }}>
        {playerGroups.map(group => (
          <div key={group.team.id} style={{ border:'1px solid var(--border, #ddd)', borderRadius:12, padding:12 }}>
            <h3 style={{ marginTop:0 }}>{group.team.name}</h3>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th align="left">Player</th>
                    <th>Gms</th>
                    <th>Pts</th>
                    <th>Hcp</th>
                    <th>Ave.</th>
                    <th>PinS</th>
                    <th>PinH</th>
                    <th>Hgs</th>
                    <th>Hgh</th>
                    <th>Hss</th>
                    <th>Hsh</th>
                  </tr>
                </thead>
                <tbody>
                  {(group.players || []).map(p => (
                    <tr key={p.player_id}>
                      <td>{p.name}</td>
                      <td align="center">{p.gms}</td>
                      <td align="center">{p.pts}</td>
                      <td align="center">{p.hcp}</td>
                      <td align="center">{p.ave}</td>
                      <td align="center">{p.pinss}</td>
                      <td align="center">{p.pinsh}</td>
                      <td align="center">{p.hgs}</td>
                      <td align="center">{p.hgh}</td>
                      <td align="center">{p.hss}</td>
                      <td align="center">{p.hsh}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
