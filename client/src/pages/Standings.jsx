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
  const authHeaders = useMemo(() => getAuthHeaders(), []);

  // Load current league (to know total weeks, name, etc.)
  useEffect(() => {
    async function loadLeague() {
      const res = await fetch('/api/leagues');
      const all = await res.json();
      const id = Number(authHeaders['x-league-id'] || 0);
      setLeague(all.find(l => l.id === id) || null);
    }
    loadLeague();
  }, [authHeaders]);

  // Fetch team standings (week-aware)
  useEffect(() => {
    async function loadTeams() {
      const q = week ? `?week=${encodeURIComponent(week)}` : '';
      const res = await fetch(`/api/standings${q}`, { headers: authHeaders });
      setTeams(await res.json());
    }
    loadTeams();
  }, [authHeaders, week]);

  // Fetch individual standings (week-aware)
  useEffect(() => {
    async function loadPlayers() {
      const q = week ? `?week=${encodeURIComponent(week)}` : '';
      const res = await fetch(`/api/standings/players${q}`, { headers: authHeaders });
      setPlayerGroups(await res.json());
    }
    loadPlayers();
  }, [authHeaders, week]);

  const maxWeeks = league?.weeks ? Number(league.weeks) : 20;

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2 style={{ margin:0 }}>Standings{week ? ` – Week ${week}` : ''}</h2>
        <WeekPicker maxWeeks={maxWeeks} />
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

