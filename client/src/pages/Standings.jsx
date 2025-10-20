// client/src/pages/Standings.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getAuthHeaders } from '../lib/auth.js'

const cell = { padding: 8, borderBottom: '1px solid var(--border)' }
const th = { ...cell, fontWeight: 700 }
const td = cell

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
      } finally { if (!cancel) setLoading(false) }
    }
    load()
    return () => { cancel = true }
  }, [])

  // Split player groups into two balanced columns
  const [leftGroups, rightGroups] = useMemo(() => {
    const left = [], right = []
    playerGroups.forEach((g, i) => (i % 2 === 0 ? left : right).push(g))
    return [left, right]
  }, [playerGroups])

  return (
    <div className="card" style={{ display:'grid', gap:16 }}>
      {/* Brand header block: logo centered + officials (if you already added these) */}
      <header style={{ textAlign:'center', display:'grid', gap:10 }}>
        {league?.logo ? (
          <img
            src={league.logo}
            alt="League logo"
            style={{ height: 110, objectFit:'contain', margin:'0 auto' }}
          />
        ) : null}
        {/* If you’re rendering officials, keep that block here */}
        {/* <div className="muted" style={{fontSize:14}}>Chairperson …</div> */}
      </header>

      {/* === TEAM STANDINGS stays full width right under the logo === */}
      <section className="card">
        <h3 style={{ marginTop:0 }}>Team Standings</h3>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Pos</th>
                <th style={th}>Team</th>
                {/* Order mirrors player-style stats */}
                <th style={th}>Pts</th>
                <th style={th}>PinsS</th>
                <th style={th}>PinsH</th>
                <th style={th}>HGS</th>
                <th style={th}>HGH</th>
                <th style={th}>HSS</th>
                <th style={th}>HSH</th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{r.pos}</td>
                  <td style={td}>{r.name}</td>
                  <td style={{...td, fontWeight:700}}>{r.won}</td>
                  <td style={td}>{r.pinss}</td>
                  <td style={td}>{r.pinsh}</td>
                  <td style={td}>{r.hgs}</td>
                  <td style={td}>{r.hgh}</td>
                  <td style={td}>{r.hss}</td>
                  <td style={td}>{r.hsh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === PLAYER STANDINGS in 2 columns under team standings === */}
      <section>
        <h3 style={{ marginTop:0 }}>Player Standings</h3>

        <div className="standings-columns">
          {/* LEFT COLUMN */}
          <div className="standings-col">
            {leftGroups.map(group => (
              <div key={group.team.id} className="card page-break-avoid">
                <h4 style={{ margin:'4px 0 10px' }}>{group.team.name}</h4>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Player</th>
                        <th style={th}>Hcp</th>
                        <th style={th}>Ave</th>
                        <th style={th}>Gms</th>
                        <th style={th}>Pts</th>
                        <th style={th}>PinsS</th>
                        <th style={th}>PinsH</th>
                        <th style={th}>HGS</th>
                        <th style={th}>HGH</th>
                        <th style={th}>HSS</th>
                        <th style={th}>HSH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(group.players || []).map(p => (
                        <tr key={p.player_id}>
                          <td style={td}>{p.name}</td>
                          <td style={td}>{p.hcp}</td>
                          <td style={td}>{p.ave}</td>
                          <td style={td}>{p.gms}</td>
                          <td style={{...td, fontWeight:700}}>{p.pts}</td>
                          <td style={td}>{p.pinss}</td>
                          <td style={td}>{p.pinsh}</td>
                          <td style={td}>{p.hgs}</td>
                          <td style={td}>{p.hgh}</td>
                          <td style={td}>{p.hss}</td>
                          <td style={td}>{p.hsh}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT COLUMN */}
          <div className="standings-col">
            {rightGroups.map(group => (
              <div key={group.team.id} className="card page-break-avoid">
                <h4 style={{ margin:'4px 0 10px' }}>{group.team.name}</h4>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Player</th>
                        <th style={th}>Hcp</th>
                        <th style={th}>Ave</th>
                        <th style={th}>Gms</th>
                        <th style={th}>Pts</th>
                        <th style={th}>PinsS</th>
                        <th style={th}>PinsH</th>
                        <th style={th}>HGS</th>
                        <th style={th}>HGH</th>
                        <th style={th}>HSS</th>
                        <th style={th}>HSH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(group.players || []).map(p => (
                        <tr key={p.player_id}>
                          <td style={td}>{p.name}</td>
                          <td style={td}>{p.hcp}</td>
                          <td style={td}>{p.ave}</td>
                          <td style={td}>{p.gms}</td>
                          <td style={{...td, fontWeight:700}}>{p.pts}</td>
                          <td style={td}>{p.pinss}</td>
                          <td style={td}>{p.pinsh}</td>
                          <td style={td}>{p.hgs}</td>
                          <td style={td}>{p.hgh}</td>
                          <td style={td}>{p.hss}</td>
                          <td style={td}>{p.hsh}</td>
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

      {/* Optional: quick export */}
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="button" onClick={()=>window.print()}>Export PDF</button>
      </div>

      {loading && <div className="muted">Loading…</div>}
    </div>
  )
}
