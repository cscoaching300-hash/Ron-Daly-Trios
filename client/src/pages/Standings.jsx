// client/src/pages/Standings.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getAuthHeaders } from '../lib/auth.js'

const baseCell = { padding: 8, borderBottom: '1px solid var(--border)' }
const th = { ...baseCell, fontWeight: 700 }
const td = baseCell

// numeric alignment helper
const thNum = { ...th, textAlign: 'right' }
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

export default function Standings() {
  const [league, setLeague] = useState(null)
  const [teamRows, setTeamRows] = useState([])
  const [playerGroups, setPlayerGroups] = useState([]) // [{team:{id,name}, players:[...]}]
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    async function load() {
      try {
        setLoading(true)
        const [lgRes, teamRes, pRes] = await Promise.all([
          fetch('/api/leagues', { headers: getAuthHeaders() }),
          fetch('/api/standings', { headers: getAuthHeaders() }),
          fetch('/api/standings/players', { headers: getAuthHeaders() }),
        ])
        const leagues = await lgRes.json()
        const leagueFromToken = leagues[0] || null
        const teams = await teamRes.json()
        const pGroups = await pRes.json()
        if (!cancel) {
          setLeague(leagueFromToken)
          setTeamRows(Array.isArray(teams) ? teams : [])
          setPlayerGroups(Array.isArray(pGroups) ? pGroups : [])
        }
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    load()
    return () => { cancel = true }
  }, [])

  // split teams into two columns
  const [leftGroups, rightGroups] = useMemo(() => {
    const left = [], right = []
    playerGroups.forEach((g, i) => (i % 2 === 0 ? left : right).push(g))
    return [left, right]
  }, [playerGroups])

  return (
    <div className="card standings-wrap printable" style={{ display:'grid', gap:16 }}>
      {/* Logo */}
      <header style={{ textAlign:'center', display:'grid', gap:10 }}>
        {league?.logo ? (
          <img src={league.logo} alt="League logo" style={{ height:110, objectFit:'contain', margin:'0 auto' }} />
        ) : null}
      </header>

      {/* Team standings */}
      <section className="card page-break-avoid">
        <h3 style={{ marginTop:0 }}>Team Standings</h3>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Pos</th>
                <th style={th}>Team</th>
                <th style={thNum}>Gms</th>
                <th style={thNum}>Pts</th>
                <th style={thNum}>PinsS</th>
                <th style={thNum}>PinsH</th>
                <th style={thNum}>HGS</th>
                <th style={thNum}>HGH</th>
                <th style={thNum}>HSS</th>
                <th style={thNum}>HSH</th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.pos}</td>
                  <td style={td}>{r.name}</td>
                  <td style={tdNum}>{r.gms ?? r.games ?? 0}</td>
                  <td style={{ ...tdNum, fontWeight:700 }}>{r.won}</td>
                  <td style={tdNum}>{r.pinss}</td>
                  <td style={tdNum}>{r.pinsh}</td>
                  <td style={tdNum}>{r.hgs}</td>
                  <td style={tdNum}>{r.hgh}</td>
                  <td style={tdNum}>{r.hss}</td>
                  <td style={tdNum}>{r.hsh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Player standings — two columns */}
      <section className="page-break-avoid">
        <h3 style={{ marginTop:0 }}>Player Standings</h3>

        {/* ⬇️ Use the CSS class so the minmax(0,1fr) + min-width fixes apply */}
        <div className="standings-columns">
          {/* Left column */}
          <div className="standings-col">
            {leftGroups.map(group => (
              <div key={group.team.id} className="card page-break-avoid" style={{ overflow:'hidden' }}>
                <h4 style={{ margin:'4px 0 10px' }}>{group.team.name}</h4>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Player</th>
                        <th style={thNum}>Hcp</th>
                        <th style={thNum}>Ave</th>
                        <th style={thNum}>Gms</th>
                        <th style={thNum}>Pts</th>
                        <th style={thNum}>PinsS</th>
                        <th style={thNum}>PinsH</th>
                        <th style={thNum}>HGS</th>
                        <th style={thNum}>HGH</th>
                        <th style={thNum}>HSS</th>
                        <th style={thNum}>HSH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(group.players || []).map(p => (
                        <tr key={p.player_id}>
                          <td style={td}>{p.name}</td>
                          <td style={tdNum}>{p.hcp}</td>
                          <td style={tdNum}>{p.ave}</td>
                          <td style={tdNum}>{p.gms}</td>
                          <td style={{ ...tdNum, fontWeight:700 }}>{p.pts}</td>
                          <td style={tdNum}>{p.pinss}</td>
                          <td style={tdNum}>{p.pinsh}</td>
                          <td style={tdNum}>{p.hgs}</td>
                          <td style={tdNum}>{p.hgh}</td>
                          <td style={tdNum}>{p.hss}</td>
                          <td style={tdNum}>{p.hsh}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Right column */}
          <div className="standings-col">
            {rightGroups.map(group => (
              <div key={group.team.id} className="card page-break-avoid" style={{ overflow:'hidden' }}>
                <h4 style={{ margin:'4px 0 10px' }}>{group.team.name}</h4>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Player</th>
                        <th style={thNum}>Hcp</th>
                        <th style={thNum}>Ave</th>
                        <th style={thNum}>Gms</th>
                        <th style={thNum}>Pts</th>
                        <th style={thNum}>PinsS</th>
                        <th style={thNum}>PinsH</th>
                        <th style={thNum}>HGS</th>
                        <th style={thNum}>HGH</th>
                        <th style={thNum}>HSS</th>
                        <th style={thNum}>HSH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(group.players || []).map(p => (
                        <tr key={p.player_id}>
                          <td style={td}>{p.name}</td>
                          <td style={tdNum}>{p.hcp}</td>
                          <td style={tdNum}>{p.ave}</td>
                          <td style={tdNum}>{p.gms}</td>
                          <td style={{ ...tdNum, fontWeight:700 }}>{p.pts}</td>
                          <td style={tdNum}>{p.pinss}</td>
                          <td style={tdNum}>{p.pinsh}</td>
                          <td style={tdNum}>{p.hgs}</td>
                          <td style={tdNum}>{p.hgh}</td>
                          <td style={tdNum}>{p.hss}</td>
                          <td style={tdNum}>{p.hsh}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Export (kept inside the card; add a touch of bottom padding) */}
      <div className="no-print" style={{ display:'flex', justifyContent:'flex-end', padding:'6px 0 2px' }}>
        <button className="button" onClick={() => window.print()}>Export PDF</button>
      </div>

      {loading && <div className="muted">Loading…</div>}
    </div>
  )
}
