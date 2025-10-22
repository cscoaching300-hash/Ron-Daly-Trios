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
    <>
      {/* PRINT + layout styles */}
      <style>{`
        .standings-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 8px;
        }
        .standings-col { min-width: 0; }

        @media print {
          /* Hide everything but the print root */
          body * { visibility: hidden !important; }
          #print-root, #print-root * { visibility: visible !important; }

          #print-root {
            position: absolute;
            inset: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          @page { size: A4; margin: 6mm; }

          /* Fit exactly one page in portrait (Chrome/Edge) */
          #print-root { zoom: 0.86; } /* tweak 0.80–0.90 if needed */

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print { display: none !important; }

          /* Compact the cards/tables */
          #print-root .card {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
          }

          #print-root header { margin-bottom: 4mm !important; }

          #print-root h3 { margin: 4px 0 6px !important; font-size: 14px !important; }
          #print-root h4 { margin: 3px 0 6px !important; font-size: 12px !important; }

          /* Let the browser size columns naturally so headers/numbers aren't truncated */
          #print-root table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: auto !important;      /* <-- important: no fixed layout */
            page-break-inside: avoid !important;
          }

          #print-root th,
          #print-root td {
            padding: 3px 4px !important;
            font-size: 9.6px !important;        /* tighter text for portrait */
            border-bottom: 1px solid #eee !important;
            white-space: normal !important;      /* allow wrapping as needed */
            overflow: visible !important;
            text-overflow: clip !important;
          }

          /* Keep numeric columns from wrapping weirdly */
          #print-root td[data-num="1"],
          #print-root th[data-num="1"] {
            white-space: nowrap !important;
          }

          /* Avoid splitting team blocks across pages */
          #print-root .page-break-avoid { page-break-inside: avoid !important; }
        }
      `}</style>

      {/* >>> only this renders to PDF <<< */}
      <div id="print-root" className="card standings-wrap printable" style={{ display:'grid', gap:12 }}>
        {/* Logo */}
        <header style={{ textAlign:'center', display:'grid', gap:6 }}>
          {league?.logo ? (
            <img src={league.logo} alt="League logo" style={{ height:72, objectFit:'contain', margin:'0 auto' }} />
          ) : null}
        </header>

        {/* Team standings */}
        <section className="card page-break-avoid">
          <h3 style={{ marginTop:0 }}>Team Standings</h3>
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Team</th>
                  <th data-num="1" style={{ textAlign:'right' }}>Gms</th>
                  <th data-num="1" style={{ textAlign:'right' }}>Pts</th>
                  <th data-num="1" style={{ textAlign:'right' }}>PinsS</th>
                  <th data-num="1" style={{ textAlign:'right' }}>PinsH</th>
                  <th data-num="1" style={{ textAlign:'right' }}>HGS</th>
                  <th data-num="1" style={{ textAlign:'right' }}>HGH</th>
                  <th data-num="1" style={{ textAlign:'right' }}>HSS</th>
                  <th data-num="1" style={{ textAlign:'right' }}>HSH</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map(r => (
                  <tr key={r.id}>
                    <td>{r.pos}</td>
                    <td>{r.name}</td>
                    <td data-num="1" style={{ textAlign:'right' }}>{r.gms ?? r.games ?? 0}</td>
                    <td data-num="1" style={{ textAlign:'right', fontWeight:700 }}>{r.won}</td>
                    <td data-num="1" style={{ textAlign:'right' }}>{r.pinss}</td>
                    <td data-num="1" style={{ textAlign:'right' }}>{r.pinsh}</td>
                    <td data-num="1" style={{ textAlign:'right' }}>{r.hgs}</td>
                    <td data-num="1" style={{ textAlign:'right' }}>{r.hgh}</td>
                    <td data-num="1" style={{ textAlign:'right' }}>{r.hss}</td>
                    <td data-num="1" style={{ textAlign:'right' }}>{r.hsh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Player standings — two columns */}
        <section className="page-break-avoid">
          <h3 style={{ marginTop:0 }}>Player Standings</h3>

          <div className="standings-columns">
            {/* Left column */}
            <div className="standings-col">
              {leftGroups.map(group => (
                <div key={group.team.id} className="card page-break-avoid" style={{ overflow:'hidden' }}>
                  <h4 style={{ margin:'2px 0 6px' }}>{group.team.name}</h4>
                  <div style={{ overflowX:'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th data-num="1" style={{ textAlign:'right' }}>Hcp</th>
                          <th data-num="1" style={{ textAlign:'right' }}>Ave</th>
                          <th data-num="1" style={{ textAlign:'right' }}>Gms</th>
                          <th data-num="1" style={{ textAlign:'right' }}>Pts</th>
                          <th data-num="1" style={{ textAlign:'right' }}>PinsS</th>
                          <th data-num="1" style={{ textAlign:'right' }}>PinsH</th>
                          <th data-num="1" style={{ textAlign:'right' }}>HGS</th>
                          <th data-num="1" style={{ textAlign:'right' }}>HGH</th>
                          <th data-num="1" style={{ textAlign:'right' }}>HSS</th>
                          <th data-num="1" style={{ textAlign:'right' }}>HSH</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(group.players || []).map(p => (
                          <tr key={p.player_id}>
                            <td>{p.name}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hcp}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.ave}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.gms}</td>
                            <td data-num="1" style={{ textAlign:'right', fontWeight:700 }}>{p.pts}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.pinss}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.pinsh}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hgs}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hgh}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hss}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hsh}</td>
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
                  <h4 style={{ margin:'2px 0 6px' }}>{group.team.name}</h4>
                  <div style={{ overflowX:'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th data-num="1" style={{ textAlign:'right' }}>Hcp</th>
                          <th data-num="1" style={{ textAlign:'right' }}>Ave</th>
                          <th data-num="1" style={{ textAlign:'right' }}>Gms</th>
                          <th data-num="1" style={{ textAlign:'right' }}>Pts</th>
                          <th data-num="1" style={{ textAlign:'right' }}>PinsS</th>
                          <th data-num="1" style={{ textAlign:'right' }}>PinsH</th>
                          <th data-num="1" style={{ textAlign:'right' }}>HGS</th>
                          <th data-num="1" style={{ textAlign:'right' }}>HGH</th>
                          <th data-num="1" style={{ textAlign:'right' }}>HSS</th>
                          <th data-num="1" style={{ textAlign:'right' }}>HSH</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(group.players || []).map(p => (
                          <tr key={p.player_id}>
                            <td>{p.name}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hcp}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.ave}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.gms}</td>
                            <td data-num="1" style={{ textAlign:'right', fontWeight:700 }}>{p.pts}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.pinss}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.pinsh}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hgs}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hgh}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hss}</td>
                            <td data-num="1" style={{ textAlign:'right' }}>{p.hsh}</td>
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

        {/* Export (won't print) */}
        <div className="no-print" style={{ display:'flex', justifyContent:'flex-end', padding:'6px 0 2px' }}>
          <button className="button" onClick={() => window.print()}>Export PDF</button>
        </div>

        {loading && <div className="muted">Loading…</div>}
      </div>
    </>
  )
}

