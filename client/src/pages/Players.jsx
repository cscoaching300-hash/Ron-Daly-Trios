// src/pages/Players.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import WeekPicker from '../components/WeekPicker.jsx';
import { getAuthHeaders } from '../lib/auth.js';

const cell = { padding: 6, borderBottom: '1px solid var(--border)' };
const th = { ...cell, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'left' };
const td = { ...cell, whiteSpace: 'nowrap', textAlign: 'left' };

export default function Players() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [league, setLeague] = useState(null);

  const [params] = useSearchParams();
  const week = params.get('week') || ''; // string or ''

  const headers = useMemo(() => getAuthHeaders(), []);

  // Load league once (to know how many weeks to show in the picker)
  useEffect(() => {
    async function loadLeague() {
      try {
        const res = await fetch('/api/leagues');
        const all = await res.json();
        const id = Number(headers['x-league-id'] || 0);
        setLeague(all.find(l => l.id === id) || null);
      } catch {
        // non-fatal for this page
      }
    }
    loadLeague();
  }, [headers]);

  // Load players whenever week changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setErr(null);
        const q = week ? `?week=${encodeURIComponent(week)}` : '';
        const res = await fetch(`/api/players-with-teams${q}`, { headers });
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [headers, week]);

  // group by team name
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of rows) {
      const key = p.team_name || '— Sub / Free Agent —';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    for (const k of map.keys()) {
      map.get(k).sort(
        (a, b) =>
          (b.pts || 0) - (a.pts || 0) ||
          (b.pinsh || 0) - (a.pinsh || 0) ||
          a.name.localeCompare(b.name)
      );
    }
    return [...map.entries()];
  }, [rows]);

  if (loading) return <div className="card">Loading players…</div>;
  if (err) return <div className="card" style={{ color: 'var(--danger)' }}>Error: {err}</div>;

  const maxWeeks = league?.weeks ? Number(league.weeks) : 20;

  return (
    <div className="card">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2 style={{ marginTop: 0 }}>Players{week ? ` – Week ${week}` : ''}</h2>
        <WeekPicker maxWeeks={maxWeeks} label="Week" />
      </div>

      {groups.length === 0 && <div className="muted">No players yet.</div>}

      <div style={{ display: 'grid', gap: 16 }}>
        {groups.map(([teamName, players]) => (
          <section key={teamName} className="card" style={{ padding: 12 }}>
            <h3 style={{ margin: '4px 0 8px' }}>{teamName}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Player</th>
                    <th style={th}>Hcp</th>
                    <th style={th}>Gms</th>
                    <th style={th}>Pts</th>
                    <th style={th}>Ave.</th>
                    <th style={th}>PinsS</th>
                    <th style={th}>PinsH</th>
                    <th style={th}>Hgs</th>
                    <th style={th}>Hgh</th>
                    <th style={th}>Hss</th>
                    <th style={th}>Hsh</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(p => (
                    <tr key={p.id}>
                      <td style={td}>{p.name}</td>
                      <td style={td}>{p.hcp ?? 0}</td>
                      <td style={td}>{p.gms ?? 0}</td>
                      <td style={td}>{p.pts ?? 0}</td>
                      <td style={td}>{p.ave ?? (+p.average || 0)}</td>
                      <td style={td}>{p.pinss ?? 0}</td>
                      <td style={td}>{p.pinsh ?? 0}</td>
                      <td style={td}>{p.hgs ?? 0}</td>
                      <td style={td}>{p.hgh ?? 0}</td>
                      <td style={td}>{p.hss ?? 0}</td>
                      <td style={td}>{p.hsh ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}


