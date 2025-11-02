// client/src/pages/EnterScores.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getTeams, getMatchSheet, saveMatchSheet } from '../api'
import { useLocation, useSearchParams } from 'react-router-dom'
import { getAuthHeaders } from '../lib/auth.js'

const cell = { padding: 6, borderBottom: '1px solid var(--border)' }
const th = { ...cell, fontWeight: 700 }
const td = cell
const num = v => (isFinite(+v) ? +v : 0)

const BLIND_OPTIONS = [
  { v: 'none', label: '—' },
  { v: 'g1', label: 'G1' },
  { v: 'g2', label: 'G2' },
  { v: 'g3', label: 'G3' },
  { v: 'g1g2', label: 'G1+G2' },
  { v: 'g1g3', label: 'G1+G3' },
  { v: 'g2g3', label: 'G2+G3' },
  { v: 'all', label: 'All (3)' },
]
const maskHas = (mask, g) => {
  if (!mask || mask === 'none') return false
  if (mask === 'all') return true
  // g is '1' | '2' | '3'
  return mask.includes(g)
}

/* Blind-aware singles outcome */
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

/**
 * One side of the sheet (home/away)
 */
function TeamTable({
  title,
  teamOptions,
  subOptions,
  values,           // raw state from parent
  setValues,
  gamesPerWeek,
  opponentRowsProcessed, // <-- now really processed from parent
  opponentRowsRaw,
  indivWin,
  indivDraw,
  teamWin,
  teamDraw,
  useHandicap
}) {
  // ensure 3 rows
  useEffect(() => {
    if (!values.length) {
      setValues([
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0, blindMask:'none', indivPts:'' },
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0, blindMask:'none', indivPts:'' },
        { playerId: '', g1:'', g2:'', g3:'', hcp: 0, blindMask:'none', indivPts:'' }
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

  // build table rows with blind logic
  const rows = values.map(v => {
    const picked = v.playerId ? byId.get(String(v.playerId)) : null
    const baseAvg = picked ? num(picked.average) : 0
    const baseHcp = picked ? num(picked.hcp) : num(v.hcp)
    const blindScore = Math.floor(baseAvg * 0.9)

    const g1s = maskHas(v.blindMask, '1') ? blindScore : num(v.g1)
    const g2s = maskHas(v.blindMask, '2') ? blindScore : num(v.g2)
    const g3s = maskHas(v.blindMask, '3') ? blindScore : num(v.g3)

    const effHcp = v.blindMask === 'all' ? Math.floor(baseHcp * 0.9) : baseHcp

    return {
      ...v,
      g1s, g2s, g3s,
      hcp: effHcp,
      g1h: g1s + effHcp,
      g2h: g2s + effHcp,
      g3h: g3s + effHcp,
      series: g1s + g2s + g3s,
      seriesH: g1s + g2s + g3s + effHcp * gamesPerWeek,
      blindG1: maskHas(v.blindMask, '1'),
      blindG2: maskHas(v.blindMask, '2'),
      blindG3: maskHas(v.blindMask, '3'),
    }
  })

  // auto singles vs opponent
  const autoSinglesPts = rows.map((r, i) => {
    const opp = opponentRowsProcessed?.[i]
    if (!opp) return 0
    const [g1A] = blindAwareOutcome(r.g1h, opp.g1h, !!r.blindG1, !!opp.blindG1, indivWin, indivDraw)
    const [g2A] = blindAwareOutcome(r.g2h, opp.g2h, !!r.blindG2, !!opp.blindG2, indivWin, indivDraw)
    const [g3A] = blindAwareOutcome(r.g3h, opp.g3h, !!r.blindG3, !!opp.blindG3, indivWin, indivDraw)
    return g1A + g2A + g3A
  })

  // totals
  const totals = rows.reduce((a, r) => ({
    g1: a.g1 + r.g1s, g2: a.g2 + r.g2s, g3: a.g3 + r.g3s,
    g1h: a.g1h + r.g1h, g2h: a.g2h + r.g2h, g3h: a.g3h + r.g3h,
    series: a.series + r.series, seriesH: a.seriesH + r.seriesH
  }), { g1:0,g2:0,g3:0,g1h:0,g2h:0,g3h:0, series:0, seriesH:0 })

  // opponent totals for team points
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

  // team singles total, using overrides
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

                  {/* Blind dropdown */}
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
                          const next = { ...x, blindMask: mask }

                          if (maskHas(mask,'1')) next.g1 = String(blindScore)
                          if (maskHas(mask,'2')) next.g2 = String(blindScore)
                          if (maskHas(mask,'3')) next.g3 = String(blindScore)

                          if (mask === 'all') next.hcp = Math.floor(baseHcp * 0.9)
                          else next.hcp = baseHcp

                          // if we change blind, drop override
                          next.indivPts = ''
                          return next
                        }))
                      }}
                    >
                      {BLIND_OPTIONS.map(o => (
                        <option key={o.v} value={o.v}>{o.label}</option>
                      ))}
                    </select>
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
                        disabled={maskHas(values[idx]?.blindMask, k[1])}
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

            <tr>
              <td style={{...td, fontWeight:700}}>Team Totals</td>
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

  // helper to make processed rows for opponent
  const buildProcessed = (rows) => rows.map(r => {
    const h = num(r.hcp)
    const g1 = num(r.g1)
    const g2 = num(r.g2)
    const g3 = num(r.g3)
    const mask = r.blindMask || 'none'
    return {
      ...r,
      g1h: g1 + h,
      g2h: g2 + h,
      g3h: g3 + h,
      blindG1: maskHas(mask,'1'),
      blindG2: maskHas(mask,'2'),
      blindG3: maskHas(mask,'3'),
    }
  })

  const homeProcessed = buildProcessed(homeVals)
  const awayProcessed = buildProcessed(awayVals)

  // summary totals
  const totalsFor = (rows) => rows.reduce((acc, v) => {
    const h = num(v.hcp)
    const g1 = num(v.g1)
    const g2 = num(v.g2)
    const g3 = num(v.g3)
    acc.scratch.g1 += g1
    acc.scratch.g2 += g2
    acc.scratch.g3 += g3
    acc.hcp.g1 += g1 + h
    acc.hcp.g2 += g2 + h
    acc.hcp.g3 += g3 + h
    return acc
  }, {
    scratch:{g1:0,g2:0,g3:0},
    hcp:{g1:0,g2:0,g3:0}
  })

  const homeT = totalsFor(homeVals)
  const awayT = totalsFor(awayVals)

  const useG = (totals, which) => useHandicap ? totals.hcp[which] : totals.scratch[which]
  const perGame = ['g1','g2','g3'].reduce((acc, gk) => {
    const [hPts, aPts] = blindAwareOutcome(useG(homeT, gk), useG(awayT, gk), false, false, teamWin, teamDraw)
    acc.home += hPts; acc.away += aPts; return acc
  }, { home:0, away:0 })

  const homeSeries = homeVals.reduce((s,r)=> s + num(r.g1)+num(r.g2)+num(r.g3), 0)
  const awaySeries = awayVals.reduce((s,r)=> s + num(r.g1)+num(r.g2)+num(r.g3), 0)
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

  // summary singles — respect overrides
  const singlesTotals = useMemo(() => {
    const maxRows = Math.max(homeVals.length, awayVals.length)
    let homePts = 0, awayPts = 0

    for (let i = 0; i < maxRows; i++) {
      const a = homeVals[i]
      const b = awayVals[i]
      if (!a && !b) continue

      if (a?.indivPts !== undefined && a.indivPts !== '') homePts += num(a.indivPts)
      if (b?.indivPts !== undefined && b.indivPts !== '') awayPts += num(b.indivPts)

      if (a && b && (a.indivPts === '' || a.indivPts === undefined) && (b.indivPts === '' || b.indivPts === undefined)) {
        const aH = num(a.hcp), bH = num(b.hcp)
        const aG1 = num(a.g1) + aH, aG2 = num(a.g2) + aH, aG3 = num(a.g3) + aH
        const bG1 = num(b.g1) + bH, bG2 = num(b.g2) + bH, bG3 = num(b.g3) + bH
        const [a1,b1] = blindAwareOutcome(aG1, bG1, false, false, indivWin, indivDraw)
        const [a2,b2] = blindAwareOutcome(aG2, bG2, false, false, indivWin, indivDraw)
        const [a3,b3] = blindAwareOutcome(aG3, bG3, false, false, indivWin, indivDraw)
        homePts += a1 + a2 + a3
        awayPts += b1 + b2 + b3
      }
    }

    return { homePts, awayPts }
  }, [homeVals, awayVals, indivWin, indivDraw])

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

      {/* tables */}
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
            {(sheet?.homeTeam?.name || 'Team A')} {homeVals.reduce((s,r)=> s + num(r.g1)+num(r.g2)+num(r.g3), 0)} — {awayVals.reduce((s,r)=> s + num(r.g1)+num(r.g2)+num(r.g3), 0)} {(sheet?.awayTeam?.name || 'Team B')}
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



