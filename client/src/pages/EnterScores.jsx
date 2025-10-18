// client/src/pages/EnterScores.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getTeams, getMatchSheet, saveMatchSheet } from '../api'
import { useLocation, useSearchParams } from 'react-router-dom'
import { getAuthHeaders } from '../lib/auth.js'

const cell = { padding: 6, borderBottom: '1px solid var(--border)' }
const th = { ...cell, fontWeight: 700 }
const td = cell
const num = v => (isFinite(+v) ? +v : 0)

function PlayerSelect({ value, onChange, teamOptions, subOptions, disabledIds }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">— choose —</option>
      <optgroup label="Team">
        {(teamOptions || []).map(p => (
          <option key={`t-${p.id}`} value={p.id} disabled={disabledIds.has(p.id)}>
            {p.name} {p.hcp ? `(${p.hcp})` : ''}
          </option>
        ))}
      </optgroup>
      <optgroup label="Substitutes">
        {(subOptions || []).map(p => (
          <option key={`s-${p.id}`} value={p.id} disabled={disabledIds.has(p.id)}>
            {p.name} {p.hcp ? `(${p.hcp})` : ''}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

function pointsOutcome(a, b, winPts, drawPts) {
  if (a === b) return [drawPts, drawPts]
  return a > b ? [winPts, 0] : [0, winPts]
}

/** One side of the sheet (home/away) */
function TeamTable({
  title,
  teamOptions,
  subOptions,
  values,           // [{playerId, g1,g2,g3, hcp}]
  setValues,
  gamesPerWeek,
  opponentRowsProcessed,
  opponentRowsRaw,
  indivWin,
  indivDraw,
  teamWin,
  teamDraw,
  useHandicap
}) {
  // ensure at least 3 slots on first mount for this table
  useEffect(() => {
    if (!values.length) {
      setValues([
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0 },
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0 },
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0 }
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byId = useMemo(() => {
    const map = new Map()
    ;[...(teamOptions||[]), ...(subOptions||[])].forEach(p => map.set(String(p.id), p))
    return map
  }, [teamOptions, subOptions])

  const usedIds = useMemo(
    () => new Set(values.map(v => +v.playerId || 0).filter(Boolean)),
    [values]
  )

  // processed rows with computed fields
  const rows = values.map(v => {
    const s1 = num(v.g1), s2 = num(v.g2), s3 = num(v.g3)
    const h  = num(v.hcp)
    return {
      ...v,
      g1h: s1 + h, g2h: s2 + h, g3h: s3 + h,
      series: s1 + s2 + s3,
      seriesH: s1 + s2 + s3 + h * gamesPerWeek
    }
  })

  // singles points per bowler vs opposite index on opponent
  const singlesPts = rows.map((r, i) => {
    const opp = opponentRowsProcessed?.[i]
    if (!opp) return 0
    const [g1hA] = pointsOutcome(r.g1h, opp.g1h, indivWin, indivDraw)
    const [g2hA] = pointsOutcome(r.g2h, opp.g2h, indivWin, indivDraw)
    const [g3hA] = pointsOutcome(r.g3h, opp.g3h, indivWin, indivDraw)
    return g1hA + g2hA + g3hA
  })

  const totals = rows.reduce((a, r) => ({
    g1: a.g1 + num(r.g1), g2: a.g2 + num(r.g2), g3: a.g3 + num(r.g3),
    g1h: a.g1h + r.g1h, g2h: a.g2h + r.g2h, g3h: a.g3h + r.g3h,
    series: a.series + r.series, seriesH: a.seriesH + r.seriesH
  }), { g1:0,g2:0,g3:0,g1h:0,g2h:0,g3h:0, series:0, seriesH:0 })

  const singlesTotal = singlesPts.reduce((s,v)=>s+v,0)

  // Opponent totals (scratch & with handicap)
  const oppScratchTotals = (opponentRowsRaw || []).reduce((a, r) => ({
    g1: a.g1 + num(r.g1), g2: a.g2 + num(r.g2), g3: a.g3 + num(r.g3)
  }), { g1:0, g2:0, g3:0 })

  const oppHcpTotals = (opponentRowsProcessed || []).reduce((a, r) => ({
    g1h: a.g1h + num(r.g1h), g2h: a.g2h + num(r.g2h), g3h: a.g3h + num(r.g3h)
  }), { g1h:0, g2h:0, g3h:0 })

  // Team game points per game + series
  const g1Us   = useHandicap ? totals.g1h : totals.g1
  const g2Us   = useHandicap ? totals.g2h : totals.g2
  const g3Us   = useHandicap ? totals.g3h : totals.g3
  const g1Them = useHandicap ? oppHcpTotals.g1h : oppScratchTotals.g1
  const g2Them = useHandicap ? oppHcpTotals.g2h : oppScratchTotals.g2
  const g3Them = useHandicap ? oppHcpTotals.g3h : oppScratchTotals.g3

  const [g1Pts] = pointsOutcome(g1Us, g1Them, teamWin, teamDraw)
  const [g2Pts] = pointsOutcome(g2Us, g2Them, teamWin, teamDraw)
  const [g3Pts] = pointsOutcome(g3Us, g3Them, teamWin, teamDraw)

  const seriesUs   = useHandicap ? totals.seriesH : totals.series
  const seriesThem = useHandicap
    ? (oppHcpTotals.g1h + oppHcpTotals.g2h + oppHcpTotals.g3h)
    : (oppScratchTotals.g1 + oppScratchTotals.g2 + oppScratchTotals.g3)

  const [seriesPts] = pointsOutcome(seriesUs, seriesThem, teamWin, teamDraw)
  const teamPtsTotal = g1Pts + g2Pts + g3Pts + seriesPts

  const addRow = () => setValues(v => [...v, { playerId:'', g1:'', g2:'', g3:'', hcp:0 }])
  const removeRow = (idx) => setValues(v => v.filter((_,i)=>i!==idx))

  return (
    <section className="card" style={{flex: 1, minWidth: 560}}>
      <h3 style={{marginTop:0, textAlign:'center'}}>{title}</h3>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={th}>Player</th>
              <th style={th}>Hcp</th>
              <th style={th}>G1</th>
              <th style={th}>G2</th>
              <th style={th}>G3</th>
              <th style={th}>G1+H</th>
              <th style={th}>G2+H</th>
              <th style={th}>G3+H</th>
              <th style={th}>Series</th>
              <th style={th}>Pts</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td style={td}>
                  <PlayerSelect
                    value={r.playerId}
                    onChange={(id) => {
                      setValues(list => list.map((x,i)=>{
                        if (i !== idx) return x
                        const picked = byId.get(String(id))
                        return {
                          ...x,
                          playerId: id,
                          hcp: picked ? (num(picked.hcp) || 0) : 0
                        }
                      }))
                    }}
                    teamOptions={teamOptions || []}
                    subOptions={subOptions || []}
                    disabledIds={new Set([...usedIds].filter(id => String(id)!==String(r.playerId)))}
                  />
                </td>
                <td style={td}>{r.hcp}</td>
                {['g1','g2','g3'].map(k=>(
                  <td key={k} style={td}>
                    <input
                      inputMode="numeric"
                      type="text"
                      style={{width:64, textAlign:'center'}}
                      value={r[k]}
                      onChange={e=>{
                        const v = e.target.value.replace(/\D/g,'')
                        setValues(list => list.map((x,i)=> i===idx ? {...x,[k]:v} : x))
                      }}
                    />
                  </td>
                ))}
                <td style={td}>{r.g1h}</td>
                <td style={td}>{r.g2h}</td>
                <td style={td}>{r.g3h}</td>
                <td style={td}>{r.series}</td>
                <td style={{...td, fontWeight: 700}}>{singlesPts[idx] || 0}</td>
                <td style={td}>
                  <button className="button" onClick={()=>removeRow(idx)}>✖</button>
                </td>
              </tr>
            ))}
            {/* Totals row */}
            <tr>
              <td style={{...td, fontWeight:700}}>Team Totals</td>
              <td style={td}>—</td>
              <td style={td}>{totals.g1}</td>
              <td style={td}>{totals.g2}</td>
              <td style={td}>{totals.g3}</td>
              <td style={td}>{totals.g1h}</td>
              <td style={td}>{totals.g2h}</td>
              <td style={td}>{totals.g3h}</td>
              <td style={td}>{totals.series}</td>
              <td style={{...td, fontWeight:700}}>{singlesTotal}</td>
              <td style={td}>—</td>
            </tr>
            {/* Team points row (per game + series) */}
            <tr>
              <td style={{...td, fontWeight:700}}>Team Points</td>
              <td style={td}>—</td>
              <td style={td}>{g1Pts}</td>
              <td style={td}>{g2Pts}</td>
              <td style={td}>{g3Pts}</td>
              <td style={td}>—</td>
              <td style={td}>—</td>
              <td style={td}>—</td>
              <td style={td}>{seriesPts}</td>
              <td style={{...td, fontWeight:700}}>{teamPtsTotal}</td>
              <td style={td}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{marginTop:8}}>
        <button className="button" onClick={addRow}>+ Add Bowler</button>
      </div>
    </section>
  )
}

export default function EnterScores() {
  const [teams, setTeams] = useState([])
  const [weekNumber, setWeekNumber] = useState('1')
  const [homeId, setHomeId] = useState('')
  const [awayId, setAwayId] = useState('')
  const [sheet, setSheet] = useState(null)

  const [homeVals, setHomeVals] = useState([])
  const [awayVals, setAwayVals] = useState([])

  const location = useLocation()
  const [params] = useSearchParams()

  // Load teams once
  useEffect(() => { getTeams().then(setTeams) }, [])

  // Sync state with URL params
  useEffect(() => {
    const pWeek = params.get('week')
    const pHome = params.get('homeTeamId') || params.get('teamA')
    const pAway = params.get('awayTeamId') || params.get('teamB')

    if (pWeek) setWeekNumber(pWeek)
    if (pHome) setHomeId(pHome)
    if (pAway) setAwayId(pAway)

    if (pWeek && pHome && pAway) {
      load(+pWeek, +pHome, +pAway)
      const qs = new URLSearchParams({ weekNumber: pWeek, homeTeamId: pHome, awayTeamId: pAway }).toString()
      fetch(`/api/sheet?${qs}`, { headers: getAuthHeaders() })
        .then(r => (r.ok ? r.json() : null))
        .then(s => {
          if (!s) return
          const shape = r => ({
            playerId: String(r.playerId || ''),
            g1: String(r.g1 || ''),
            g2: String(r.g2 || ''),
            g3: String(r.g3 || ''),
            hcp: Number.isFinite(+r.hcp) ? +r.hcp : 0
          })
          setHomeVals((s.homeGames || []).map(shape))
          setAwayVals((s.awayGames || []).map(shape))
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, params])

  const load = async (wk = +weekNumber, h = +homeId, a = +awayId) => {
    if (!wk || !h || !a) return
    const data = await getMatchSheet(+wk, +h, +a)
    setSheet(data)
    if (!homeVals.length) {
      setHomeVals([
        {playerId:'',g1:'',g2:'',g3:'',hcp:0},
        {playerId:'',g1:'',g2:'',g3:'',hcp:0},
        {playerId:'',g1:'',g2:'',g3:'',hcp:0},
      ])
    }
    if (!awayVals.length) {
      setAwayVals([
        {playerId:'',g1:'',g2:'',g3:'',hcp:0},
        {playerId:'',g1:'',g2:'',g3:'',hcp:0},
        {playerId:'',g1:'',g2:'',g3:'',hcp:0},
      ])
    }
  }

  const gamesPerWeek = +sheet?.league?.gamesPerWeek || 3
  const indivWin = +sheet?.league?.indivPointsWin || 0
  const indivDraw = +sheet?.league?.indivPointsDraw || 0
  const teamWin  = +sheet?.league?.teamPointsWin || 0
  const teamDraw = +sheet?.league?.teamPointsDraw || 0
  const useHandicap = (sheet?.league?.mode === 'handicap')

  // processed rows for H2H comparison
  const process = rows => rows.map(v => {
    const s1 = num(v.g1), s2 = num(v.g2), s3 = num(v.g3)
    const h  = num(v.hcp)
    return { ...v, g1h: s1+h, g2h: s2+h, g3h: s3+h }
  })
  const homeProcessed = useMemo(() => process(homeVals), [homeVals])
  const awayProcessed = useMemo(() => process(awayVals), [awayVals])

  // --- Team points (per game + series) for the summary ---
  const totalsFor = (rows, processed) => ({
    scratch: {
      g1: rows.reduce((s,r)=>s+num(r.g1),0),
      g2: rows.reduce((s,r)=>s+num(r.g2),0),
      g3: rows.reduce((s,r)=>s+num(r.g3),0),
    },
    hcp: {
      g1: processed.reduce((s,r)=>s+num(r.g1h),0),
      g2: processed.reduce((s,r)=>s+num(r.g2h),0),
      g3: processed.reduce((s,r)=>s+num(r.g3h),0),
    }
  })

  const homeT = totalsFor(homeVals, homeProcessed)
  const awayT = totalsFor(awayVals, awayProcessed)

  const useG = (totals, which) => useHandicap ? totals.hcp[which] : totals.scratch[which]
  const perGame = ['g1','g2','g3'].reduce((acc, gk) => {
    const [hPts, aPts] = pointsOutcome(useG(homeT, gk), useG(awayT, gk), teamWin, teamDraw)
    acc.home += hPts; acc.away += aPts; return acc
  }, { home:0, away:0 })

  const homeSeries = homeVals.reduce((s,r)=> s + num(r.g1)+num(r.g2)+num(r.g3), 0)
  const awaySeries = awayVals.reduce((s,r)=> s + num(r.g1)+num(r.g2)+num(r.g3), 0)
  const homeSeriesH = useG(homeT, 'g1') + useG(homeT, 'g2') + useG(homeT, 'g3')
  const awaySeriesH = useG(awayT, 'g1') + useG(awayT, 'g2') + useG(awayT, 'g3')

  const [seriesHomePts, seriesAwayPts] = pointsOutcome(
    useHandicap ? homeSeriesH : homeSeries,
    useHandicap ? awaySeriesH : awaySeries,
    teamWin, teamDraw
  )

  const teamPoints = {
    home: perGame.home + seriesHomePts,
    away: perGame.away + seriesAwayPts
  }

  // singles totals
  const singlesTotals = useMemo(() => {
    const maxRows = Math.max(homeProcessed.length, awayProcessed.length)
    let homePts = 0, awayPts = 0
    for (let i=0; i<maxRows; i++) {
      const a = homeProcessed[i], b = awayProcessed[i]
      if (!a || !b) continue
      const [a1, b1] = pointsOutcome(a.g1h, b.g1h, indivWin, indivDraw)
      const [a2, b2] = pointsOutcome(a.g2h, b.g2h, indivWin, indivDraw)
      const [a3, b3] = pointsOutcome(a.g3h, b.g3h, indivWin, indivDraw)
      homePts += a1 + a2 + a3
      awayPts += b1 + b2 + b3
    }
    return { homePts, awayPts }
  }, [homeProcessed, awayProcessed, indivWin, indivDraw])

  // Total points = team + singles
  const totalPoints = {
    home: (teamPoints.home || 0) + (singlesTotals.homePts || 0),
    away: (teamPoints.away || 0) + (singlesTotals.awayPts || 0),
  }

  const save = async () => {
    if (!sheet) return alert('Pick week and teams, then Load.')
    const clean = rows => rows
      .filter(r => r.playerId)
      .map(r => ({
        playerId: +r.playerId,
        g1: num(r.g1), g2: num(r.g2), g3: num(r.g3), hcp: num(r.hcp)
      }))
    const payload = {
      weekNumber: +weekNumber,
      homeTeamId: +homeId,
      awayTeamId: +awayId,
      homeGames: clean(homeVals),
      awayGames: clean(awayVals),

      // send EXACT totals shown on the page so standings match:
      totalPointsHome: totalPoints.home,
      totalPointsAway: totalPoints.away,
    }
    const res = await saveMatchSheet(payload)
    if (res?.ok) alert('Saved!')
    else alert(res?.error || 'Save failed')
  }

  return (
    <div style={{display:'grid', gap:12}}>
      {/* selectors */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
        <label>Week
          <input value={weekNumber} onChange={e=>setWeekNumber(e.target.value)} />
        </label>
        <label>Team A
          <select value={homeId} onChange={e=>setHomeId(e.target.value)}>
            <option value="">—</option>
            {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>Team B
          <select value={awayId} onChange={e=>setAwayId(e.target.value)}>
            <option value="">—</option>
            {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div style={{display:'flex', gap:8, alignItems:'end', justifyContent:'flex-end'}}>
          <button className="button" onClick={() => load()}>Load sheet</button>
          <button className="button primary" onClick={save}>Save sheet</button>
        </div>
      </div>

      <div style={{display:'flex', gap:12, alignItems:'stretch'}}>
        <TeamTable
          title={sheet?.homeTeam?.name || 'Team A'}
          teamOptions={sheet?.homeRoster || []}
          subOptions={sheet?.homeSubs || []}
          values={homeVals}
          setValues={setHomeVals}
          gamesPerWeek={gamesPerWeek}
          opponentRowsProcessed={awayProcessed}
          opponentRowsRaw={awayVals}
          indivWin={indivWin}
          indivDraw={indivDraw}
          teamWin={teamWin}
          teamDraw={teamDraw}
          useHandicap={useHandicap}
        />
        <TeamTable
          title={sheet?.awayTeam?.name || 'Team B'}
          teamOptions={sheet?.awayRoster || []}
          subOptions={sheet?.awaySubs || []}
          values={awayVals}
          setValues={setAwayVals}
          gamesPerWeek={gamesPerWeek}
          opponentRowsProcessed={homeProcessed}
          opponentRowsRaw={homeVals}
          indivWin={indivWin}
          indivDraw={indivDraw}
          teamWin={teamWin}
          teamDraw={teamDraw}
          useHandicap={useHandicap}
        />
      </div>

      {/* Summary */}
      <section className="card" style={{textAlign:'center'}}>
        <h3 style={{margin:0}}>Week {weekNumber} Summary</h3>
        <div style={{marginTop:8, display:'grid', gap:6}}>
          <div style={{fontSize:18}}>
            <strong>Team Series (scratch):</strong>{' '}
            {(sheet?.homeTeam?.name || 'Team A')} {homeSeries} — {awaySeries} {(sheet?.awayTeam?.name || 'Team B')}
          </div>
          <div style={{fontSize:18}}>
            <strong>Team Points (games + series):</strong>{' '}
            {(sheet?.homeTeam?.name || 'Team A')} {teamPoints.home} — {teamPoints.away} {(sheet?.awayTeam?.name || 'Team B')}
          </div>
          <div className="muted" style={{fontSize:14}}>
            Team points are awarded for each game and the series (handicap rules apply if enabled).
          </div>
          <div style={{fontSize:18, marginTop:8}}>
            <strong>Singles Points:</strong>{' '}
            {(sheet?.homeTeam?.name || 'Team A')} {singlesTotals.homePts} — {singlesTotals.awayPts} {(sheet?.awayTeam?.name || 'Team B')}
          </div>
          <div className="muted" style={{fontSize:12}}>
            Singles are head-to-head per game with handicap (G1+H, G2+H, G3+H). Win={indivWin}, Draw={indivDraw}.
          </div>
          <div style={{fontSize:20, marginTop:10}}>
            <strong>Total Points:</strong>{' '}
            {(sheet?.homeTeam?.name || 'Team A')} {totalPoints.home} — {totalPoints.away} {(sheet?.awayTeam?.name || 'Team B')}
          </div>
        </div>
      </section>
    </div>
  )
}
