// client/src/pages/EnterScores.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getTeams, getMatchSheet, saveMatchSheet } from '../api'
import { useLocation, useSearchParams } from 'react-router-dom'
import { getAuthHeaders } from '../lib/auth.js'

const cell = { padding: 6, borderBottom: '1px solid var(--border)' }
const th = { ...cell, fontWeight: 700 }
const td = cell
const num = v => (isFinite(+v) ? +v : 0)

/* every option tells us exactly which games are blind */
const BLIND_OPTIONS = [
  { v: 'none', label: '—' },
  { v: '1', label: 'G1' },
  { v: '2', label: 'G2' },
  { v: '3', label: 'G3' },
  { v: '12', label: 'G1+G2' },
  { v: '13', label: 'G1+G3' },
  { v: '23', label: 'G2+G3' },
  { v: 'all', label: 'All (3)' },
]

const maskHas = (mask, g) => {
  if (!mask || mask === 'none') return false
  if (mask === 'all') return true
  const gg = typeof g === 'number' ? String(g) : g
  return mask.includes(gg)
}

/* BLIND VS BLIND LOGIC */
function blindAwareOutcome(aVal, bVal, aBlind, bBlind, winPts, drawPts) {
  if (aBlind && bBlind) return [0, 0]
  if (aBlind && !bBlind) return bVal > aVal ? [0, winPts] : [0, 0]
  if (!aBlind && bBlind) return aVal > bVal ? [winPts, 0] : [0, 0]
  if (aVal === bVal) return [drawPts, drawPts]
  return aVal > bVal ? [winPts, 0] : [0, winPts]
}

function PlayerSelect({ value, onChange, teamOptions, subOptions, disabledIds }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">— choose —</option>
      <optgroup label="Team">
        {(teamOptions || []).map(p => (
          <option key={`t-${p.id}`} value={p.id} disabled={disabledIds.has(p.id)}>
            {p.name}{p.junior ? ' (Jr)' : ''} {p.hcp ? `(${p.hcp})` : ''}
          </option>
        ))}
      </optgroup>
      <optgroup label="Substitutes">
        {(subOptions || []).map(p => (
          <option key={`s-${p.id}`} value={p.id} disabled={disabledIds.has(p.id)}>
            {p.name}{p.junior ? ' (Jr)' : ''} {p.hcp ? `(${p.hcp})` : ''}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

/* ONE SIDE OF SHEET */
function TeamTable({
  title,
  teamOptions,
  subOptions,
  values,
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
  /* guarantee 3 rows on first mount */
  useEffect(() => {
    if (!values.length) {
      setValues([
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0, blindMask:'none', indivPts:'' },
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0, blindMask:'none', indivPts:'' },
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0, blindMask:'none', indivPts:'' },
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

  /* build processed rows with per-game blind logic */
  const rows = values.map(v => {
    const picked   = v.playerId ? byId.get(String(v.playerId)) : null
    const baseAvg  = picked ? num(picked.average) : 0
    const baseHcp  = picked ? num(picked.hcp) : num(v.hcp)

    const blindScore = Math.floor(baseAvg * 0.9)
    const blindHcp   = Math.floor(baseHcp * 0.9)

    const g1s = maskHas(v.blindMask, 1) ? blindScore : num(v.g1)
    const g2s = maskHas(v.blindMask, 2) ? blindScore : num(v.g2)
    const g3s = maskHas(v.blindMask, 3) ? blindScore : num(v.g3)

    const h1  = maskHas(v.blindMask, 1) ? blindHcp : baseHcp
    const h2  = maskHas(v.blindMask, 2) ? blindHcp : baseHcp
    const h3  = maskHas(v.blindMask, 3) ? blindHcp : baseHcp

    return {
      ...v,
      baseHcp,
      g1s, g2s, g3s,
      h1, h2, h3,
      g1h: g1s + h1,
      g2h: g2s + h2,
      g3h: g3s + h3,
      series: g1s + g2s + g3s,
      /* each game carries its own handicap now */
      seriesH: g1s + h1 + g2s + h2 + g3s + h3,
      blindG1: maskHas(v.blindMask, 1),
      blindG2: maskHas(v.blindMask, 2),
      blindG3: maskHas(v.blindMask, 3),
    }
  })

  /* auto singles vs opposite team */
  const autoSinglesPts = rows.map((r, i) => {
    const opp = opponentRowsProcessed?.[i]
    if (!opp) return 0
    const [g1A] = blindAwareOutcome(r.g1h, opp.g1h, !!r.blindG1, !!opp.blindG1, indivWin, indivDraw)
    const [g2A] = blindAwareOutcome(r.g2h, opp.g2h, !!r.blindG2, !!opp.blindG2, indivWin, indivDraw)
    const [g3A] = blindAwareOutcome(r.g3h, opp.g3h, !!r.blindG3, !!opp.blindG3, indivWin, indivDraw)
    return g1A + g2A + g3A
  })

  /* team totals */
  const totals = rows.reduce((a, r) => ({
    g1: a.g1 + r.g1s,
    g2: a.g2 + r.g2s,
    g3: a.g3 + r.g3s,
    g1h: a.g1h + r.g1h,
    g2h: a.g2h + r.g2h,
    g3h: a.g3h + r.g3h,
    series: a.series + r.series,
    seriesH: a.seriesH + r.seriesH
  }), { g1:0,g2:0,g3:0,g1h:0,g2h:0,g3h:0, series:0, seriesH:0 })

  /* opponent totals for team points */
  const oppScratchTotals = (opponentRowsRaw || []).reduce((a, r) => ({
    g1: a.g1 + num(r.g1), g2: a.g2 + num(r.g2), g3: a.g3 + num(r.g3)
  }), { g1:0, g2:0, g3:0 })

  const oppHcpTotals = (opponentRowsProcessed || []).reduce((a, r) => ({
    g1h: a.g1h + num(r.g1h), g2h: a.g2h + num(r.g2h), g3h: a.g3h + num(r.g3h)
  }), { g1h:0, g2h:0, g3h:0 })

  const g1Us   = useHandicap ? totals.g1h : totals.g1
  const g2Us   = useHandicap ? totals.g2h : totals.g2
  const g3Us   = useHandicap ? totals.g3h : totals.g3
  const g1Them = useHandicap ? oppHcpTotals.g1h : oppScratchTotals.g1
  const g2Them = useHandicap ? oppHcpTotals.g2h : oppScratchTotals.g2
  const g3Them = useHandicap ? oppHcpTotals.g3h : oppScratchTotals.g3

  const [g1Pts] = blindAwareOutcome(g1Us, g1Them, false, false, teamWin, teamDraw)
  const [g2Pts] = blindAwareOutcome(g2Us, g2Them, false, false, teamWin, teamDraw)
  const [g3Pts] = blindAwareOutcome(g3Us, g3Them, false, false, teamWin, teamDraw)

  const seriesUs   = useHandicap ? totals.seriesH : totals.series
  const seriesThem = useHandicap
    ? (oppHcpTotals.g1h + oppHcpTotals.g2h + oppHcpTotals.g3h)
    : (oppScratchTotals.g1 + oppScratchTotals.g2 + oppScratchTotals.g3)

  const [seriesPts] = blindAwareOutcome(seriesUs, seriesThem, false, false, teamWin, teamDraw)
  const teamPtsTotal = g1Pts + g2Pts + g3Pts + seriesPts

  /* team singles total, using overrides */
  const singlesTotal = rows.reduce((sum, r, idx) => {
    const override = values[idx]?.indivPts
    const eff = override !== undefined && override !== '' ? num(override) : (autoSinglesPts[idx] || 0)
    return sum + eff
  }, 0)

  const addRow = () => setValues(v => [...v, { playerId:'', g1:'', g2:'', g3:'', hcp:0, blindMask:'none', indivPts:'' }])
  const removeRow = (idx) => setValues(v => v.filter((_,i)=>i!==idx))

  return (
    <section className="card" style={{flex: 1, minWidth: 720}}>
      <h3 style={{marginTop:0, textAlign:'center'}}>{title}</h3>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={th}>Player</th>
              <th style={th}>Jr</th>
              <th style={th}>Blind</th>
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
            {rows.map((r, idx) => {
              const picked = r.playerId ? byId.get(String(r.playerId)) : null
              const isJunior = !!picked?.junior
              const override = values[idx]?.indivPts
              const effectivePts = override !== undefined && override !== '' ? override : (autoSinglesPts[idx] || 0)

              /* display HCP:
                 - if ANY game is blind, show the 90% number
                 - else show the base
              */
              const displayHcp = (r.blindG1 || r.blindG2 || r.blindG3)
                ? Math.floor(r.baseHcp * 0.9)
                : r.baseHcp

              return (
                <tr key={idx}>
                  <td style={td}>
                    <PlayerSelect
                      value={r.playerId}
                      onChange={(id) => {
                        setValues(list => list.map((x,i)=>{
                          if (i !== idx) return x
                          const picked = id ? byId.get(String(id)) : null
                          const baseHcp = picked ? (num(picked.hcp) || 0) : 0
                          return { ...x, playerId:id, hcp: baseHcp, blindMask:'none', indivPts:'' }
                        }))
                      }}
                      teamOptions={teamOptions || []}
                      subOptions={subOptions || []}
                      disabledIds={new Set([...usedIds].filter(id => String(id)!==String(r.playerId)))}
                    />
                  </td>

                  <td style={td}>{isJunior ? 'Yes' : ''}</td>

                  {/* blind dropdown */}
                  <td style={td}>
                    <select
                      value={values[idx]?.blindMask || 'none'}
                      onChange={e => {
                        const mask = e.target.value
                        setValues(list => list.map((x,i)=>{
                          if (i !== idx) return x
                          const picked = x.playerId ? byId.get(String(x.playerId)) : null
                          const baseAvg = picked ? num(picked.average) : 0
                          const baseHcp = picked ? num(picked.hcp) : num(x.hcp)
                          const blindScore = Math.floor(baseAvg * 0.9)
                          const next = { ...x, blindMask: mask, indivPts:'' }

                          if (maskHas(mask, 1)) next.g1 = String(blindScore)
                          if (maskHas(mask, 2)) next.g2 = String(blindScore)
                          if (maskHas(mask, 3)) next.g3 = String(blindScore)

                          // still store base hcp in state; we only show reduced in the cell
                          next.hcp = baseHcp
                          return next
                        }))
                      }}
                    >
                      {BLIND_OPTIONS.map(o => (
                        <option key={o.v} value={o.v}>{o.label}</option>
                      ))}
                    </select>
                  </td>

                  <td style={td}>{displayHcp || 0}</td>

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
                        disabled={maskHas(values[idx]?.blindMask, Number(k[1]))}
                      />
                    </td>
                  ))}

                  <td style={td}>{r.g1h}</td>
                  <td style={td}>{r.g2h}</td>
                  <td style={td}>{r.g3h}</td>
                  <td style={td}>{r.series}</td>

                  {/* editable singles pts */}
                  <td style={td}>
                    <input
                      type="number"
                      min="0"
                      style={{width:56, textAlign:'center'}}
                      value={effectivePts}
                      onChange={e => {
                        const val = e.target.value
                        setValues(list => list.map((x,i)=> i===idx ? { ...x, indivPts: val } : x))
                      }}
                    />
                  </td>

                  <td style={td}>
                    <button className="button" onClick={()=>removeRow(idx)}>✖</button>
                  </td>
                </tr>
              )
            })}

            {/* team totals row */}
            <tr>
              <td style={{...td, fontWeight:700}}>Team Totals</td>
              <td style={td}>—</td>
              <td style={td}>—</td>
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

            {/* team points row */}
            <tr>
              <td style={{...td, fontWeight:700}}>Team Points</td>
              <td style={td}>—</td>
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

  useEffect(() => { getTeams().then(setTeams) }, [])

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
            hcp: Number.isFinite(+r.hcp) ? +r.hcp : 0,
            blindMask: r.blind ? 'all' : 'none',
            indivPts: ''
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
        {playerId:'',g1:'',g2:'',g3:'',hcp:0, blindMask:'none', indivPts:''},
        {playerId:'',g1:'',g2:'',g3:'',hcp:0, blindMask:'none', indivPts:''},
        {playerId:'',g1:'',g2:'',g3:'',hcp:0, blindMask:'none', indivPts:''},
      ])
    }
    if (!awayVals.length) {
      setAwayVals([
        {playerId:'',g1:'',g2:'',g3:'',hcp:0, blindMask:'none', indivPts:''},
        {playerId:'',g1:'',g2:'',g3:'',hcp:0, blindMask:'none', indivPts:''},
        {playerId:'',g1:'',g2:'',g3:'',hcp:0, blindMask:'none', indivPts:''},
      ])
    }
  }

  const gamesPerWeek = +sheet?.league?.gamesPerWeek || 3
  const indivWin = +sheet?.league?.indivPointsWin || 0
  const indivDraw = +sheet?.league?.indivPointsDraw || 0
  const teamWin  = +sheet?.league?.teamPointsWin || 0
  const teamDraw = +sheet?.league?.teamPointsDraw || 0
  const useHandicap = (sheet?.league?.mode === 'handicap')

  /* process for summary exactly like table did */
  const processedForSummary = (rows) => rows.map(r => {
    const baseH = num(r.hcp)
    const blindH = Math.floor(baseH * 0.9)
    const mask = r.blindMask || 'none'

    const g1s = maskHas(mask, 1) ? Math.floor(num(r.g1) * 0.9) : num(r.g1)
    const g2s = maskHas(mask, 2) ? Math.floor(num(r.g2) * 0.9) : num(r.g2)
    const g3s = maskHas(mask, 3) ? Math.floor(num(r.g3) * 0.9) : num(r.g3)

    const h1 = maskHas(mask, 1) ? blindH : baseH
    const h2 = maskHas(mask, 2) ? blindH : baseH
    const h3 = maskHas(mask, 3) ? blindH : baseH

    return {
      ...r,
      g1s, g2s, g3s,
      h1, h2, h3,
      g1h: g1s + h1,
      g2h: g2s + h2,
      g3h: g3s + h3,
      blindG1: maskHas(mask, 1),
      blindG2: maskHas(mask, 2),
      blindG3: maskHas(mask, 3),
    }
  })

  const homeProcessed = processedForSummary(homeVals)
  const awayProcessed = processedForSummary(awayVals)

  const totalsFor = (processed) => processed.reduce((acc, v) => {
    acc.scratch.g1 += v.g1s
    acc.scratch.g2 += v.g2s
    acc.scratch.g3 += v.g3s
    acc.hcp.g1 += v.g1h
    acc.hcp.g2 += v.g2h
    acc.hcp.g3 += v.g3h
    return acc
  }, {
    scratch:{g1:0,g2:0,g3:0},
    hcp:{g1:0,g2:0,g3:0}
  })

  const homeT = totalsFor(homeProcessed)
  const awayT = totalsFor(awayProcessed)

  const useG = (totals, which) => useHandicap ? totals.hcp[which] : totals.scratch[which]
  const perGame = ['g1','g2','g3'].reduce((acc, gk) => {
    const [hPts, aPts] = blindAwareOutcome(useG(homeT, gk), useG(awayT, gk), false, false, teamWin, teamDraw)
    acc.home += hPts; acc.away += aPts; return acc
  }, { home:0, away:0 })

  const homeSeries = homeProcessed.reduce((s,r)=> s + r.g1s + r.g2s + r.g3s, 0)
  const awaySeries = awayProcessed.reduce((s,r)=> s + r.g1s + r.g2s + r.g3s, 0)
  const homeSeriesH = useG(homeT, 'g1') + useG(homeT, 'g2') + useG(homeT, 'g3')
  const awaySeriesH = useG(awayT, 'g1') + useG(awayT, 'g2') + useG(awayT, 'g3')

  const [seriesHomePts, seriesAwayPts] = blindAwareOutcome(
    useHandicap ? homeSeriesH : homeSeries,
    useHandicap ? awaySeriesH : awaySeries,
    false, false, teamWin, teamDraw
  )

  const teamPoints = {
    home: perGame.home + seriesHomePts,
    away: perGame.away + seriesAwayPts
  }

  /* summary singles with overrides */
  const singlesTotals = useMemo(() => {
    const maxRows = Math.max(homeProcessed.length, awayProcessed.length)
    let homePts = 0, awayPts = 0
    for (let i = 0; i < maxRows; i++) {
      const rawA = homeVals[i]
      const rawB = awayVals[i]
      const a = homeProcessed[i]
      const b = awayProcessed[i]

      if (rawA?.indivPts !== undefined && rawA.indivPts !== '') homePts += num(rawA.indivPts)
      if (rawB?.indivPts !== undefined && rawB.indivPts !== '') awayPts += num(rawB.indivPts)

      if (a && b && (rawA?.indivPts === '' || rawA?.indivPts === undefined) && (rawB?.indivPts === '' || rawB?.indivPts === undefined)) {
        const [a1,b1] = blindAwareOutcome(a.g1h, b.g1h, !!a.blindG1, !!b.blindG1, indivWin, indivDraw)
        const [a2,b2] = blindAwareOutcome(a.g2h, b.g2h, !!a.blindG2, !!b.blindG2, indivWin, indivDraw)
        const [a3,b3] = blindAwareOutcome(a.g3h, b.g3h, !!a.blindG3, !!b.blindG3, indivWin, indivDraw)
        homePts += a1 + a2 + a3
        awayPts += b1 + b2 + b3
      }
    }
    return { homePts, awayPts }
  }, [homeVals, awayVals, homeProcessed, awayProcessed, indivWin, indivDraw])

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
        g1: num(r.g1), g2: num(r.g2), g3: num(r.g3), hcp: num(r.hcp),
        /* server still only knows "any blind" */
        blind: !!(r.blindMask && r.blindMask !== 'none')
      }))
    const payload = {
      weekNumber: +weekNumber,
      homeTeamId: +homeId,
      awayTeamId: +awayId,
      homeGames: clean(homeVals),
      awayGames: clean(awayVals),
      totalPointsHome: totalPoints.home,
      totalPointsAway: totalPoints.away
    }
    const res = await saveMatchSheet(payload)
    if (res?.ok) alert('Saved!')
    else alert(res?.error || 'Save failed')
  }

  return (
    <div style={{
      display:'grid',
      gap:12,
      maxWidth: 1520,
      width:'100%',
      margin:'0 auto',
      padding:'0 12px'
    }}>
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

      {/* two tables */}
      <div style={{
        display:'flex',
        gap:12,
        alignItems:'stretch',
        justifyContent:'center',
        flexWrap:'wrap'
      }}>
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
            {(sheet?.homeTeam?.name || 'Team A')} {homeProcessed.reduce((s,r)=> s + r.g1s + r.g2s + r.g3s, 0)} — {awayProcessed.reduce((s,r)=> s + r.g1s + r.g2s + r.g3s, 0)} {(sheet?.awayTeam?.name || 'Team B')}
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
            Edit the Pts field next to each bowler to override.
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

