// client/src/pages/Archive.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { getAuthHeaders } from '../lib/auth.js'
import WeekPicker from '../components/WeekPicker.jsx'

const cell = { padding: 6, borderBottom: '1px solid var(--border)' }
const th = { ...cell, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'left' }
const td = { ...cell, whiteSpace: 'nowrap', textAlign: 'left' }

export default function Archive() {
  const [weeks, setWeeks] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [params, setParams] = useSearchParams()
  const week = params.get('week') || ''

  const headers = getAuthHeaders()
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/weeks', { headers })
      .then(r=>r.json()).then(setWeeks).catch(()=>{})
  }, [])

  useEffect(() => {
    setLoading(true); setErr(null)
    const q = week ? `?weekNumber=${encodeURIComponent(week)}` : ''
    fetch(`/api/sheets${q}`, { headers })
      .then(r => r.json())
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(e => setErr(String(e?.message || e)))
      .finally(()=> setLoading(false))
  }, [week])

  const onPickWeek = (w) => {
    if (!w) { params.delete('week'); setParams(params, { replace:true }); return; }
    params.set('week', w); setParams(params, { replace:true })
  }

  const doDelete = async (r) => {
    if (!confirm(`Delete sheet for Week ${r.week_number}: ${r.home_team_name} vs ${r.away_team_name}?`)) return;
    const qs = new URLSearchParams({
      weekNumber: String(r.week_number),
      homeTeamId: String(r.homeTeamId),
      awayTeamId: String(r.awayTeamId),
    })
    const res = await fetch(`/api/sheet?${qs.toString()}`, { method:'DELETE', headers })
    const data = await res.json()
    if (!res.ok || data?.error) {
      alert(data?.error || 'Delete failed'); return;
    }
    // refresh
    const q = week ? `?weekNumber=${encodeURIComponent(week)}` : ''
    const fresh = await fetch(`/api/sheets${q}`, { headers }).then(r=>r.json())
    setRows(Array.isArray(fresh) ? fresh : [])
  }

  const weekOptions = useMemo(() => weeks.map(w => w.week_number), [weeks])

  return (
    <div className="card">
      <h2 style={{marginTop:0}}>Archive</h2>

      <div style={{ display:'flex', gap:12, alignItems:'center', margin:'8px 0 16px' }}>
        <WeekPicker value={week} onChange={onPickWeek} options={weekOptions} />
        <span className="muted">
          {week ? `Showing week ${week}` : 'Showing all weeks'}
        </span>
      </div>

      {loading && <div className="card">Loading…</div>}
      {err && <div className="card" style={{ color:'var(--danger)' }}>Error: {err}</div>}

      {!loading && rows.length === 0 && (
        <div className="muted">No saved sheets{week ? ` for week ${week}` : ''}.</div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ borderCollapse:'collapse', width:'100%' }}>
            <thead>
              <tr>
                <th style={th}>Week</th>
                <th style={th}>Match</th>
                <th style={th}>Scratch (H/A)</th>
                <th style={th}>Handicap (H/A)</th>
                <th style={th}>Saved</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.week_number}-${r.homeTeamId}-${r.awayTeamId}`}>
                  <td style={td}>{r.week_number}</td>
                  <td style={td}>{r.home_team_name} vs {r.away_team_name}</td>
                  <td style={td}>
                    {r.totals?.homeScratch ?? 0} / {r.totals?.awayScratch ?? 0}
                  </td>
                  <td style={td}>
                    {r.totals?.homeHandicap ?? 0} / {r.totals?.awayHandicap ?? 0}
                  </td>
                  <td style={td}>{new Date(r.saved_at).toLocaleString()}</td>
                  <td style={td}>
                    <Link
                      className="btn"
                      to={`/enter?week=${r.week_number}&homeTeamId=${r.homeTeamId}&awayTeamId=${r.awayTeamId}`}
                      title="Edit sheet"
                    >
                      Edit
                    </Link>{' '}
                    <button className="btn secondary" onClick={()=>doDelete(r)} title="Delete sheet">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
