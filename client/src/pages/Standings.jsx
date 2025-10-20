// client/src/pages/Standings.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getAuthHeaders, getSavedLeague } from '../lib/auth.js'

const td = { padding: 6, borderBottom: '1px solid var(--border)' }
const th = { ...td, fontWeight: 700 }
const num = v => (Number.isFinite(+v) ? +v : 0)

export default function Standings() {
  const saved = getSavedLeague()
  const [league, setLeague] = useState(null)
  const [teams, setTeams] = useState([])           // /api/standings
  const [playersByTeam, setPlayersByTeam] = useState([]) // /api/standings/players
  const [loading, setLoading] = useState(true)

  // Fetch league for logo & officers
  useEffect(() => {
    fetch('/api/leagues', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(list => {
        const current = list.find(l => l.id === saved?.id)
        setLeague(current || null)
      })
      .catch(()=>{})
  }, [saved?.id])

  // Fetch standings
  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([
      fetch(`/api/standings`, { headers: getAuthHeaders() }).then(r=>r.json()),
      fetch(`/api/standings/players`, { headers: getAuthHeaders() }).then(r=>r.json()),
    ])
    .then(([teamRows, playerGroups]) => {
      if (!mounted) return
      setTeams(Array.isArray(teamRows) ? teamRows : [])
      setPlayersByTeam(Array.isArray(playerGroups) ? playerGroups : [])
    })
    .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [])

  const officerList = useMemo(() => {
    const o = league?.officials || {}
    return [
      ['Chairperson',  o.chair],
      ['Vice Chair',   o.viceChair],
      ['Treasurer',    o.treasurer],
      ['Secretary',    o.secretary],
    ].filter(([,v]) => (v||'').trim().length > 0)
  }, [league])

  const printNow = () => window.print()

  return (
    <div className="card printable" style={{ display:'grid', gap:16 }}>
      {/* Header */}
      <header style={{ textAlign:'center', padding:'8px 0 2px' }}>
        {league?.logo ? (
          <img
            src={league.logo}
            alt="League logo"
            style={{ height: 100, objectFit:'contain', display:'block', margin:'0 auto 8px' }}
          />
        ) : null}
        <h2 style={{ margin:'0 0 4px' }}>{league?.name || 'Standings'}</h2>

        {officerList.length > 0 && (
          <div
            style={{
              display:'grid',
              gridTemplateColumns:'repeat(4, minmax(0,1fr))',
              gap:8,
              justifyItems:'center'
            }}
            className="officers"
          >
            {officerList.map(([role, name]) => (
              <div key={role} style={{ fontSize:14 }}>
                <div className="muted" style={{ fontWeight:600 }}>{role}</div>
                <div>{name}</div>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Action bar */}
      <div className="no-print" style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="button" onClick={printNow}>Export PDF</button>
      </div>

      {/* Two-column content */}
      <section className="two-col">
        {/* Left: Team standings */}
        <div className="column card">
          <h3 style={{ marginTop:0 }}>Team Standings</h3>
          {loading ? (
            <div className="muted">Loading…</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Pos</th>
                  <th style={th}>Team</th>
                  <th style={th}>Pts</th>
                  <th style={th}>PinsH</th>
                  <th style={th}>PinsS</th>
                  <th style={th}>HGH</th>
                  <th style={th}>HGS</th>
                  <th style={th}>HSH</th>
                  <th style={th}>HSS</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id}>
                    <td style={td}>{t.pos}</td>
                    <td style={td}>{t.name}</td>
                    <td style={{...td, fontWeight:700}}>{t.won}</td>
                    <td style={td}>{num(t.pinsh)}</td>
                    <td style={td}>{num(t.pinss)}</td>
                    <td style={td}>{num(t.hgh)}</td>
                    <td style={td}>{num(t.hgs)}</td>
                    <td style={td}>{num(t.hsh)}</td>
                    <td style={td}>{num(t.hss)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: Player standings by team */}
        <div className="column card">
          <h3 style={{ marginTop:0 }}>Player Standings</h3>

          {loading ? (
            <div className="muted">Loading…</div>
          ) : (
            <div style={{ display:'grid', gap:12 }}>
              {playersByTeam.map(group => (
                <div key={group.team?.id || Math.random()} className="card" style={{ padding:8 }}>
                  <div style={{ fontWeight:700, marginBottom:4 }}>
                    {group.team?.name || 'Team'}
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Player</th>
                        <th style={th}>Hcp</th>
                        <th style={th}>Ave</th>
                        <th style={th}>Gms</th>
                        <th style={th}>Pts</th>
                        <th style={th}>PinsH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(group.players || []).map(p => (
                        <tr key={p.player_id}>
                          <td style={td}>{p.name}</td>
                          <td style={td}>{num(p.hcp)}</td>
                          <td style={td}>{num(p.ave)}</td>
                          <td style={td}>{num(p.gms)}</td>
                          <td style={{...td, fontWeight:700}}>{num(p.pts)}</td>
                          <td style={td}>{num(p.pinsh)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

