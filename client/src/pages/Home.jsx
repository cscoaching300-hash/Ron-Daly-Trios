// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders, saveLeagueAuth, getSavedLeague, isAuthed } from '../lib/auth.js'
import './home-premium.css' // ← scoped styles just for this page

const row = { display:'grid', gridTemplateColumns:'140px 1fr', gap:12, alignItems:'center', margin:'8px 0' }
const label = { fontWeight:600, textAlign:'right' }

export default function Home() {
  const navigate = useNavigate()
  const authed = isAuthed()
  const saved = getSavedLeague()

  const [leagues, setLeagues] = useState([])
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [loginLeagueId, setLoginLeagueId] = useState(saved?.id || '')
  const [loginPin, setLoginPin] = useState('')

  // Apply the premium theme ONLY on this route
  useEffect(() => {
    document.body.classList.add('home-theme')
    return () => document.body.classList.remove('home-theme')
  }, [])

  useEffect(() => {
    fetch('/api/leagues', { headers:getAuthHeaders() })
      .then(r => r.json())
      .then(setLeagues)
      .catch(()=>{})
  }, [])

  useEffect(() => {
    if (authed) navigate('/standings', { replace:true })
  }, [authed, navigate])

  const createLeague = async (e) => {
    e.preventDefault()
    setError(null); setCreating(true)
    try {
      if (!name || !pin) throw new Error('Name and Admin PIN required')
      const r = await fetch('/api/leagues', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          name, pin,
          mode:'handicap',
          handicapBase:200,
          handicapPercent:90,
          gamesPerWeek:3,
          teamPointsWin:2,
          teamPointsDraw:1,
          indivPointsWin:1,
          indivPointsDraw:0,
          hcpLockFromWeek:1,
          hcpLockWeeks:0,
        })
      })
      const data = await r.json()
      if (!r.ok || data?.error) throw new Error(data?.error || 'Create failed')

      // immediately log in
      const lr = await fetch('/api/login', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ leagueId: Number(data.id), pin })
      })
      const ldata = await lr.json()
      if (!lr.ok || ldata?.error) throw new Error(ldata?.error || 'Login failed after create')
      saveLeagueAuth({ id:Number(data.id), name, token: ldata.token })
      navigate('/standings', { replace:true })
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setCreating(false)
    }
  }

  const login = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const r = await fetch('/api/login', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ leagueId: Number(loginLeagueId), pin: loginPin })
      })
      const data = await r.json()
      if (!r.ok || data?.error) throw new Error(data?.error || 'Login failed')
      saveLeagueAuth({ id:Number(loginLeagueId), name:data.league?.name || 'League', token:data.token })
      navigate('/standings', { replace:true })
    } catch (e) {
      setError(String(e?.message || e))
    }
  }

  return (
    <div className="hp-wrap">
      {/* HERO */}
      <section className="hp-hero card">
        <div className="hp-hero-left">
          <h1 className="hp-title">CSCoaching Leagues</h1>
          <p className="hp-tagline"><strong>Train. Strike. Repeat.</strong> Create or join a league, manage teams &amp; players, and enter scores with freezes, caps, and standings — all in one place.</p>
          <div className="hp-cta">
            <a href="#create" className="brand-btn">Create a League</a>
            <a href="#login" className="brand-btn brand-btn--ghost">Log In</a>
          </div>
          <div className="hp-chips">
            {['Freeze window','Junior caps','Singles + team points','Auto standings'].map(t => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
        </div>
        <div className="hp-hero-right">
          {/* Put your logo at: /public/csc.png  */}
          <img className="hp-logo" src="/csc.png" alt="CSCoaching logo" />
        </div>
      </section>

      {/* WELCOME + FORMS */}
      <section className="card hp-card">
        <h2 className="hp-section-title">Welcome</h2>
        <p className="hp-note">Create a new league or log into an existing one to access standings, teams, players, and score entry.</p>

        {error && (
          <div className="hp-error" role="alert">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="hp-grid">
          {/* CREATE */}
          <section id="create" className="card hp-form card--subtle">
            <h3 className="hp-form-title">Create a League</h3>
            <p className="hp-form-hint">Spin up a new league with your Admin PIN.</p>
            <form onSubmit={createLeague} className="hp-form-body">
              <div style={row}>
                <div style={label}>League Name</div>
                <input
                  placeholder="e.g. Ron Daly Trios"
                  value={name}
                  onChange={e=>setName(e.target.value)}
                  required
                />
              </div>
              <div style={row}>
                <div style={label}>Admin PIN</div>
                <input
                  placeholder="Choose a secure PIN"
                  value={pin}
                  onChange={e=>setPin(e.target.value)}
                  required
                  type="password"
                />
              </div>
              <div className="hp-actions">
                <button className="brand-btn" type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create & Log In'}
                </button>
              </div>
            </form>
          </section>

          {/* LOGIN */}
          <section id="login" className="card hp-form card--subtle">
            <h3 className="hp-form-title">Log into a League</h3>
            <p className="hp-form-hint">Use your league and Admin PIN.</p>
            <form onSubmit={login} className="hp-form-body">
              <div style={row}>
                <div style={label}>League</div>
                <select value={loginLeagueId} onChange={e=>setLoginLeagueId(e.target.value)} required>
                  <option value="" disabled>Select a league…</option>
                  {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div style={row}>
                <div style={label}>Admin PIN</div>
                <input
                  placeholder="Enter PIN"
                  value={loginPin}
                  onChange={e=>setLoginPin(e.target.value)}
                  required
                  type="password"
                />
              </div>
              <div className="hp-actions">
                <button className="brand-btn brand-btn--ghost" type="submit">Log In</button>
              </div>
            </form>
          </section>
        </div>

        <div className="hp-footnote">
          Tip: You can switch leagues later from the header — your last league is remembered on this device.
        </div>
      </section>
    </div>
  )
}
