import React, { useEffect, useState } from 'react'
import { getCurrentLeague, updateLeague } from '../api'

const card = { padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)' }
const row  = { display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, alignItems: 'center', marginBottom: 10 }
const label = { fontWeight: 600, opacity: 0.85 }
const hint = { fontSize: 12, opacity: 0.65 }

export default function LeagueSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [league, setLeague] = useState(null)
  const [form, setForm] = useState({
    name: '',
    mode: 'handicap',
    handicapBase: 200,
    handicapPercent: 90,
    gamesPerWeek: 3,
    teamPointsWin: 2,
    teamPointsDraw: 1,
    indivPointsWin: 1,
    indivPointsDraw: 0,
    hcpLockWeeks: 0,
    hcpLockFromWeek: 1,
    teamsCount: 0,
    weeks: 0
  })

  useEffect(() => {
    (async () => {
      try {
        const lg = await getCurrentLeague()
        if (lg) {
          setLeague(lg)
          setForm(f => ({
            ...f,
            name: lg.name ?? f.name,
            mode: lg.mode ?? f.mode,
            handicapBase: +lg.handicapBase || 200,
            handicapPercent: +lg.handicapPercent || 90,
            gamesPerWeek: +lg.gamesPerWeek || 3,
            teamPointsWin: +lg.teamPointsWin || 0,
            teamPointsDraw: +lg.teamPointsDraw || 0,
            indivPointsWin: +lg.indivPointsWin || 0,
            indivPointsDraw: +lg.indivPointsDraw || 0,
            hcpLockWeeks: +lg.hcpLockWeeks || 0,
            hcpLockFromWeek: +lg.hcpLockFromWeek || 1,
            teamsCount: +lg.teamsCount || 0,
            weeks: +lg.weeks || 0
          }))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const onChange = key => e => setForm(s => ({ ...s, [key]: e.target.value }))
  const onNum = key => e => setForm(s => ({ ...s, [key]: e.target.value.replace(/[^\d]/g, '') }))

  const save = async () => {
    if (!league?.id) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      mode: form.mode === 'scratch' ? 'scratch' : 'handicap',
      handicapBase: +form.handicapBase || 200,
      handicapPercent: +form.handicapPercent || 0,
      gamesPerWeek: +form.gamesPerWeek || 3,
      teamPointsWin: +form.teamPointsWin || 0,
      teamPointsDraw: +form.teamPointsDraw || 0,
      indivPointsWin: +form.indivPointsWin || 0,
      indivPointsDraw: +form.indivPointsDraw || 0,
      hcpLockWeeks: +form.hcpLockWeeks || 0,
      hcpLockFromWeek: +form.hcpLockFromWeek || 1,
      // keep teamsCount/weeks for display only here (not updated server-side in PUT)
    }
    const res = await updateLeague(league.id, payload)
    setSaving(false)
    if (res?.ok) {
      alert('League settings saved.')
      setLeague(res.league)
    } else {
      alert(res?.error || 'Save failed')
    }
  }

  if (loading) return <div className="card">Loading league…</div>

  if (!league) {
    return (
      <div className="card">
        <h2 style={{marginTop:0}}>League Settings</h2>
        <p>No league selected. Log in first.</p>
      </div>
    )
  }

  return (
    <div className="card" style={card}>
      <h2 style={{marginTop:0}}>League Settings</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <section style={{ ...card, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>General</h3>

          <div style={row}>
            <div style={label}>League name</div>
            <input value={form.name} onChange={onChange('name')} />
          </div>

          <div style={row}>
            <div style={label}>Mode</div>
            <select value={form.mode} onChange={onChange('mode')}>
              <option value="handicap">Handicap</option>
              <option value="scratch">Scratch</option>
            </select>
          </div>

          <div style={row}>
            <div style={label}>Games per week</div>
            <input inputMode="numeric" value={form.gamesPerWeek} onChange={onNum('gamesPerWeek')} />
          </div>

          <div style={row}>
            <div style={label}>Weeks (info)</div>
            <input inputMode="numeric" value={form.weeks} onChange={onNum('weeks')} />
          </div>

          <div style={row}>
            <div style={label}>Teams (info)</div>
            <input inputMode="numeric" value={form.teamsCount} onChange={onNum('teamsCount')} />
          </div>
        </section>

        <section style={{ ...card, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Handicap</h3>
          <p style={hint}>Handicap = (Base − Average) × Percent.</p>

          <div style={row}>
            <div style={label}>Base</div>
            <input inputMode="numeric" value={form.handicapBase} onChange={onNum('handicapBase')} />
          </div>

          <div style={row}>
            <div style={label}>Percent</div>
            <input inputMode="numeric" value={form.handicapPercent} onChange={onNum('handicapPercent')} />
          </div>

          <div style={row}>
            <div style={label}>Freeze (from week)</div>
            <input inputMode="numeric" value={form.hcpLockFromWeek} onChange={onNum('hcpLockFromWeek')} />
          </div>

          <div style={row}>
            <div style={label}>Freeze (weeks)</div>
            <input inputMode="numeric" value={form.hcpLockWeeks} onChange={onNum('hcpLockWeeks')} />
          </div>
        </section>

        <section style={{ ...card, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Team Points</h3>
          <div style={row}>
            <div style={label}>Win</div>
            <input inputMode="numeric" value={form.teamPointsWin} onChange={onNum('teamPointsWin')} />
          </div>
          <div style={row}>
            <div style={label}>Draw</div>
            <input inputMode="numeric" value={form.teamPointsDraw} onChange={onNum('teamPointsDraw')} />
          </div>
        </section>

        <section style={{ ...card, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Individual Points</h3>
          <div style={row}>
            <div style={label}>Win</div>
            <input inputMode="numeric" value={form.indivPointsWin} onChange={onNum('indivPointsWin')} />
          </div>
          <div style={row}>
            <div style={label}>Draw</div>
            <input inputMode="numeric" value={form.indivPointsDraw} onChange={onNum('indivPointsDraw')} />
          </div>
        </section>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="button primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
