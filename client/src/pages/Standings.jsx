// client/src/pages/Standings.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getAuthHeaders } from '../lib/auth.js'

const baseCell = { padding: 8, borderBottom: '1px solid var(--border)' }
const th = { ...baseCell, fontWeight: 700 }
const td = baseCell
const thNum = { ...th, textAlign: 'right' }
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

export default function Standings() {
  const [league, setLeague] = useState(null)
  const [teamRows, setTeamRows] = useState([])
  const [playerGroups, setPlayerGroups] = useState([])
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

  const [leftGroups, rightGroups] = useMemo(() => {
    const left = [], right = []
    playerGroups.forEach((g, i) => (i % 2 === 0 ? left : right).push(g))
    return [left, right]
  }, [playerGroups])

  return (
    <>
      <style>{`
        .standings-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 8px;
        }
        .standings-col { min-width: 0; }

        @media print {
          body * { visibility: hidden !important; }
          #print-root, #print-root * { visibility: visible !important; }

          #print-root {
            position: absolute; inset: 0;
            width: 100% !important; margin: 0 !important; padding: 0 !important;
          }
          @page { size: A4; margin: 6mm; }
          /* small nudge so nothing clips on the right edge */
          #print-root { zoom: 0.84; }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }

          #print-root .card { box-shadow: none !important; border: 1px solid #ddd !important; }
          #print-root header { margin-bottom: 4mm !important; }
          #print-root h3 { margin: 4px 0 6px !important; font-size: 14px !important; }
          #print-root h4 { margin: 3px 0 6px !important; font-size: 12px !important; }

          #print-root table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: auto !important;
            page-break-inside: avoid !important;
          }
          #print-root th, #print-root td {
            padding: 2px 3px !important;              /* tighter cells */
            font-size: 10px !important;
            border-bottom: 1px solid #eee !important;
            white-space: nowrap !important;           /* prevent per-letter wrapping */
            overflow: visible !important;
            text-overflow: clip !important;
          }

          /* Player column: narrower but still wraps on words (not letters) */
          #print-root th.col-name, #print-root td.col-name {
            white-space: normal !important;
            word-break: keep-all !important;
            min-width: 90px !important;               /* was 110 */
            max-width: 140px !important;              /* was 180 */
          }

          /* Numeric columns: allow a tad tighter min width */
          #print-root th[data-num="1"], #print-root td[data-num="1"] {
            min-width: 30px !important;               /* was 34 */
            text-align: right !important;
            font-variant-numeric: tabular-nums;
          }

          .page-break-avoid { page-break-inside: avoid !important; }
        }
      `}</style>

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
                  <th className="col-name">Pos</th>
                  <th className="col-name">Team</th>
                  <th data-num="1">Gms</th>
                  <th data-num="1">Pts</th>
                  <th data-num="1">PinsS</th>
                  <th data-num="1">PinsH</th>
                  <th data-num="1">HGS</th>
                  <th data-num="1">HGH</th>
                  <th data-num="1">HSS</th>
                  <th data-num="1">HSH</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map(r => (
                  <tr key={r.id}>
                    <td className="col-name">{r.pos}</td>
                    <td className="col-name">{r.name}</td>
                    <td data-num="1">{r.gms ?? r.games ?? 0}</td>
                    <td data-num="1" style={{ fontWeight:700 }}>{r.won}</td>
                    <td data-num="1">{r.pinss}</td>
                    <td data-num="1">{r.pinsh}</td>
                    <td data-num="1">{r.hgs}</td>
                    <td data-num="1">{r.hgh}</td>
                    <td data-num="1">{r.hss}</td>
                    <td data-num="1">{r.hsh}</td>
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
            {/* Left */}
            <div className="standings-col">
              {leftGroups.map(group => (
                <div key={group.team.id} className="card page-break-avoid" style={{ overflow:'hidden' }}>
                  <h4 style={{ margin:'2px 0 6px' }}>{group.team.name}</h4>
                  <div style={{ overflowX:'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th className="col-name">Player</th>
                          <th data-num="1">Hcp</th>
                          <th data-num="1">Ave</th>
                          <th data-num="1">Gms</th>
                          <th data-num="1">Pts</th>
                          <th data-num="1">PinsS</th>
                          <th data-num="1">PinsH</th>
                          <th data-num="1">HGS</th>
                          <th data-num="1">HGH</th>
                          <th data-num="1">HSS</th>
                          <th data-num="1">HSH</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(group.players || []).map(p => (
                          <tr key={p.player_id}>
                            <td className="col-name">{p.name}</td>
                            <td data-num="1">{p.hcp}</td>
                            <td data-num="1">{p.ave}</td>
                            <td data-num="1">{p.gms}</td>
                            <td data-num="1" style={{ fontWeight:700 }}>{p.pts}</td>
                            <td data-num="1">{p.pinss}</td>
                            <td data-num="1">{p.pinsh}</td>
                            <td data-num="1">{p.hgs}</td>
                            <td data-num="1">{p.hgh}</td>
                            <td data-num="1">{p.hss}</td>
                            <td data-num="1">{p.hsh}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* Right */}
            <div className="standings-col">
              {rightGroups.map(group => (
                <div key={group.team.id} className="card page-break-avoid" style={{ overflow:'hidden' }}>
                  <h4 style={{ margin:'2px 0 6px' }}>{group.team.name}</h4>
                  <div style={{ overflowX:'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th className="col-name">Player</th>
                          <th data-num="1">Hcp</th>
                          <th data-num="1">Ave</th>
                          <th data-num="1">Gms</th>
                          <th data-num="1">Pts</th>
                          <th data-num="1">PinsS</th>
                          <th data-num="1">PinsH</th>
                          <th data-num="1">HGS</th>
                          <th data-num="1">HGH</th>
                          <th data-num="1">HSS</th>
                          <th data-num="1">HSH</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(group.players || []).map(p => (
                          <tr key={p.player_id}>
                            <td className="col-name">{p.name}</td>
                            <td data-num="1">{p.hcp}</td>
                            <td data-num="1">{p.ave}</td>
                            <td data-num="1">{p.gms}</td>
                            <td data-num="1" style={{ fontWeight:700 }}>{p.pts}</td>
                            <td data-num="1">{p.pinss}</td>
                            <td data-num="1">{p.pinsh}</td>
                            <td data-num="1">{p.hgs}</td>
                            <td data-num="1">{p.hgh}</td>
                            <td data-num="1">{p.hss}</td>
                            <td data-num="1">{p.hsh}</td>
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

        <div className="no-print" style={{ display:'flex', justifyContent:'flex-end', padding:'6px 0 2px' }}>
          <button className="button" onClick={() => window.print()}>Export PDF</button>
        </div>

        {loading && <div className="muted">Loading…</div>}
      </div>
    </>
  )
}

