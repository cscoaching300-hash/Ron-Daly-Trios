import React, { useState } from 'react'
import { createLeague, uploadLeagueLogo } from '../api'
import { useNavigate } from 'react-router-dom'

export default function SetupLeague() {
 const [form, setForm] = useState({
  name: '',
  teamsCount: 8,
  weeks: 10,
  handicapBase: 200,
  handicapPercent: 90,
  // NEW
  teamPointsWin: 2,
  teamPointsDraw: 1,
  indivPointsWin: 1,
  indivPointsDraw: 0,
  mode: 'handicap',
  pin: ''
})

  const [logo, setLogo] = useState(null)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name || !form.pin) return alert('Name and admin PIN are required.')
    setSaving(true)
    const res = await createLeague(form)
    if (!res?.id) { setSaving(false); return alert(res?.error || 'Failed to create league') }
    const leagueId = res.id

    // store auth
    localStorage.setItem('league_auth', JSON.stringify({ leagueId, token: btoa(`${leagueId}:${form.pin}`) }))

    if (logo) {
      await uploadLeagueLogo(leagueId, logo)
    }
    setSaving(false)
    navigate('/admin')
  }

  return (
    <section className="card" style={{display:'grid', gap:12}}>
      <h2>Set up your league</h2>

      <label>League name
        <input value={form.name} onChange={e=>update('name', e.target.value)} />
      </label>

      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
        <label>Teams <input type="number" value={form.teamsCount} onChange={e=>update('teamsCount', +e.target.value)} /></label>
        <label>Weeks <input type="number" value={form.weeks} onChange={e=>update('weeks', +e.target.value)} /></label>
        <label>Mode
          <select value={form.mode} onChange={e=>update('mode', e.target.value)}>
            <option value="handicap">Handicap</option>
            <option value="scratch">Scratch</option>
          </select>
        </label>
      </div>

      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
        <label>Handicap base <input type="number" value={form.handicapBase} onChange={e=>update('handicapBase', +e.target.value)} /></label>
        <label>Handicap % <input type="number" value={form.handicapPercent} onChange={e=>update('handicapPercent', +e.target.value)} /></label>
        <label>Points win <input type="number" value={form.pointsWin} onChange={e=>update('pointsWin', +e.target.value)} /></label>
        <label>Points draw <input type="number" value={form.pointsDraw} onChange={e=>update('pointsDraw', +e.target.value)} /></label>
{/* Team points */}
<div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
  <label>Team points (win)
    <input type="number" value={form.teamPointsWin} onChange={e=>update('teamPointsWin', +e.target.value)} />
  </label>
  <label>Team points (draw)
    <input type="number" value={form.teamPointsDraw} onChange={e=>update('teamPointsDraw', +e.target.value)} />
  </label>
</div>

{/* Individual points */}
<div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
  <label>Individual points (win)
    <input type="number" value={form.indivPointsWin} onChange={e=>update('indivPointsWin', +e.target.value)} />
  </label>
  <label>Individual points (draw)
    <input type="number" value={form.indivPointsDraw} onChange={e=>update('indivPointsDraw', +e.target.value)} />
  </label>
</div>

      </div>

      <label>Admin PIN (for login)
        <input type="password" value={form.pin} onChange={e=>update('pin', e.target.value)} />
      </label>

      <label>Logo (optional)
        <input type="file" accept="image/*" onChange={e=>setLogo(e.target.files?.[0] || null)} />
      </label>

      <div style={{display:'flex', gap:8}}>
        <button className="button primary" disabled={saving} onClick={submit}>Create League</button>
        <a className="button" href="/login">Already have a league? Log in</a>
      </div>
    </section>
  )
}
