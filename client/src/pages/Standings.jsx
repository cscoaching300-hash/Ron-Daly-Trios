// client/src/pages/Standings.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getAuthHeaders } from '../lib/auth.js'

// ---- Capture PNG of the printable area (robust settings) ----
async function captureStandingsPNG(node) {
  let html2canvas
  try {
    ({ default: html2canvas } = await import('html2canvas'))
  } catch {
    return null
  }

  const canvas = await html2canvas(node, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    foreignObjectRendering: true,
    onclone: (doc) => {
      // Force simple palette to avoid Color-4 `color()` parser issues, etc.
      const style = doc.createElement('style')
      style.textContent = `
        :root {
          color-scheme: light !important;
          --bg: #ffffff !important;
          --card: #ffffff !important;
          --border: #e0e0e0 !important;
          --text: #111111 !important;
          --muted: #666666 !important;
          --primary: #1a73e8 !important;
        }
        * { filter: none !important; backdrop-filter: none !important; }
        .no-print, nav, .appbar, .site-header { display:none !important; }
      `
      doc.head.appendChild(style)
    }
  })

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

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

  // split into two columns
  const [leftGroups, rightGroups] = useMemo(() => {
    const left = [], right = []
    playerGroups.forEach((g, i) => (i % 2 === 0 ? left : right).push(g))
    return [left, right]
  }, [playerGroups])

  const shareToFacebook = async () => {
    try {
      const root = document.getElementById('print-root')
      if (!root) return
      const blob = await captureStandingsPNG(root)
      if (!blob) return

      const file = new File([blob], 'standings.png', { type: 'image/png' })

      // Preferred: native share with the actual image
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          text: `${league?.name || 'League'} – Standings`,
          files: [file]
        })
        return
      }

      // Fallback 1: FB share dialog for the page
      const shareUrl = `${window.location.origin}/standings`
      const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
      window.open(fb, '_blank', 'noopener,noreferrer,width=740,height=560')

      // Fallback 2: also download the image so it can be attached manually
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'standings.png'
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(a.href)
      a.remove()
    } catch (e) {
      alert('Share failed. You can still use Export PDF or the downloaded PNG.')
      console.error(e)
    }
  }

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
          #print-root { zoom: 0.82; }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }

          #print-root .card { box-shadow: none !important; border: 1px solid #ddd !important; }
          #print-root header { margin-bottom: 4mm !important; }
          #print-root h3 { margin: 4px 0 6px !important; font-size: 13.5px !important; }
          #print-root h4 { margin: 3px 0 6px !important; font-size: 12px !important; }

          #print-root table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: auto !important;
            page-break-inside: avoid !important;
          }
          #print-root th, #print-root td {
            padding: 2px 3px !important;
            font-size: 9.5px !important;
            border-bottom: 1px solid #eee !important;
            white-space: nowrap !important;
            overflow: visible !important;
            text-overflow: clip !important;
          }

          /* Player column: allow wrapping + keep narrow */
          #print-root th.col-name, #print-root td.col-name {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
            min-width: 80px !important;
            max-width: 115px !important;
          }

          /* Numeric columns tight */
          #print-root th[data-num="1"], #print-root td[data-num="1"] {
            min-width: 28px !important;
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

        {/* Controls */}
        <div className="no-print" style={{ display:'flex', gap:8, justifyContent:'flex-end', padding:'6px 0 2px' }}>
          <button className="button" onClick={() => window.print()}>Export PDF</button>
          <button className="button primary" onClick={shareToFacebook}>Share to Facebook</button>
        </div>

        {loading && <div className="muted">Loading…</div>}
      </div>
    </>
  )
}
