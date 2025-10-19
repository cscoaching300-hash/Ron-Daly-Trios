// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders, saveLeagueAuth, getSavedLeague, isAuthed } from '../lib/auth.js'

const CSS = `
.home-theme {
  background:
    radial-gradient(1200px 600px at 12% -10%, rgba(225,29,46,0.12), transparent 55%),
    radial-gradient(900px 500px at 120% 10%, rgba(225,29,46,0.07), transparent 60%),
    #0b0e14;
  color: #E6E8EF;
}
.home-theme .card {
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)) , #101621;
  border: 1px solid #1c2332;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 12px 30px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.04) inset;
}
.home-theme input,.home-theme select {
  background: #0e141e; color:#E6E8EF; border:1px solid #1c2332; border-radius:10px; padding:8px 10px; height:36px;
}
.home-theme input:focus,.home-theme select:focus {
  outline:none; border-color:#E11D2E; box-shadow:0 0 0 3px rgba(225,29,46,0.35);
}
.home-theme .hp-wrap { max-width:1100px; margin:28px auto; padding:0 14px; display:grid; gap:18px; }
.home-theme .hp-hero {
  display:grid; grid-template-columns:1.25fr 1fr; gap:22px; padding:28px 24px; border-radius:18px;
  background:
    radial-gradient(900px 420px at -10% -30%, rgba(225,29,46,0.12), transparent 60%),
    radial-gradient(700px 350px at 120% 10%, rgba(225,29,46,0.10), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)),
    #101621;
  box-shadow:0 16px 40px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.04) inset;
}
.home-theme .hp-hero-left { display:grid; align-content:center; gap:10px; }
.home-theme .hp-title { margin:0 0 2px 0; font-size:clamp(28px,3.4vw,44px); letter-spacing:.3px; font-weight:800; }
.home-theme .hp-tagline { margin:0; color:#9aa3b2; max-width:720px; }
.home-theme .hp-cta { display:flex; gap:10px; margin-top:12px; }
.home-theme .brand-btn {
  border:1px solid #E11D2E; background:#E11D2E; color:#fff; padding:10px 14px; border-radius:12px; font-weight:700;
  cursor:pointer; min-height:40px; display:inline-flex; align-items:center; justify-content:center; text-decoration:none;
  transition:transform .06s ease, box-shadow .15s ease, background .2s ease;
  box-shadow:0 14px 36px rgba(225,29,46,0.28);
}
.home-theme .brand-btn:hover { background:#b31624; }
.home-theme .brand-btn:active { transform:translateY(1px); }
.home-theme .brand-btn--ghost { background:transparent; color:#E11D2E; border-color:#E11D2E; box-shadow:none; }
.home-theme .brand-btn--ghost:hover { background:rgba(225,29,46,0.06); }
.home-theme .hp-chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.home-theme .chip { border:1px solid #1c2332; background:#0e141e; border-radius:999px; padding:6px 10px; font-size:13px; color:#c7cdd9; }
.home-theme .hp-hero-right { display:grid; place-items:center; }
.home-theme .hp-logo { max-width:min(440px, 100%); width:100%; border-radius:14px; box-shadow:0 20px 50px rgba(0,0,0,0.45); }
.home-theme .hp-card { padding:18px; }
.home-theme .hp-section-title { margin:0 0 6px 0; font-size:22px; }
.home-theme .hp-note { margin:0 0 12px 0; color:#9aa3b2; }
.home-theme .hp-error {
  border:1px solid rgba(225,29,46,0.3); background:rgba(225,29,46,0.06); color:#ffb3bb; border-radius:12px; padding:10px 12px; margin-bottom:12px;
}
.home-theme .hp-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width: 980px) {
  .home-theme .hp-hero { grid-template-columns:1fr; }
  .home-theme .hp-grid { grid-template-columns:1fr; }
}
.home-theme .card--subtle { background:linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0)) , #0f1520; }
.home-theme .hp-form-title { margin:2px 0 2px; font-size:18px; }
.home-theme .hp-form-hint { margin:0 0 10px; color:#9aa3b2; font-size:13px; }
.home-theme .hp-form-body { display:grid; gap:8px; }
.home-theme .hp-actions { display:flex; justify-content:flex-end; }
.home-theme .hp-footnote { color:#9aa3b2; margin-top:12px; font-size:12px; }
`

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

  // Add premium CSS & body class only on this page
  useEffect(() => {
    document.body.classList.add('home-theme')
    let style = document.getElementById('home-premium-css')
    if (!style) {
      style = document.createElement('style')
      style.id = 'home-premium-css'
      style.textContent = CSS
      document.head.appendChild(style)
    }
    return () => {
      document.body.classList.remove('home-theme')
      // keep style tag so navigation back doesn't reflash
    }
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
          <img className="hp-logo" src="/csc.png" alt="CSCoaching logo" />
        </div>
      </section>

      <section className="card hp-card">
        <h2 className="hp-section-title">Welcome</h2>
        <p className="hp-note">Create a new league or log into an existing one to access standings, teams, players, and score entry.</p>

        {error && (
          <div className="hp-error" role="alert">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="hp-grid">
          <section id="create" className="card hp-form card--subtle">
            <h3 className="hp-form-title">Create a League</h3>
            <p className="hp-form-hint">Spin up a new league with your Admin PIN.</p>
            <form onSubmit={createLeague} className="hp-form-body">
              <div style={row}>
                <div style={label}>League Name</div>
                <input placeholder="e.g. Ron Daly Trios" value={name} onChange={e=>setName(e.target.value)} required />
              </div>
              <div style={row}>
                <div style={label}>Admin PIN</div>
                <input placeholder="Choose a secure PIN" value={pin} onChange={e=>setPin(e.target.value)} required type="password" />
              </div>
              <div className="hp-actions">
                <button className="brand-btn" type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create & Log In'}
                </button>
              </div>
            </form>
          </section>

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
                <input placeholder="Enter PIN" value={loginPin} onChange={e=>setLoginPin(e.target.value)} required type="password" />
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
