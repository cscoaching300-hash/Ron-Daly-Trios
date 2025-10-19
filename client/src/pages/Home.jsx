// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders, saveLeagueAuth, getSavedLeague, isAuthed } from '../lib/auth.js'

// Scoped premium home theme
import '../home-theme.css'

const row   = { display:'grid', gridTemplateColumns:'140px 1fr', gap:12, alignItems:'center', margin:'8px 0' }
const label = { fontWeight:600, textAlign:'right' }

export default function Home() {
  const navigate = useNavigate()
  const authed   = isAuthed()
  const saved    = getSavedLeague()

  const [leagues, setLeagues]   = useState([])
  const [errMsg, setErrMsg]     = useState(null)        // ← renamed from `error`
  const [creating, setCreating] = useState(false)
  const [name, setName]         = useState('')
  const [pin, setPin]           = useState('')
  const [loginLeagueId, setLoginLeagueId] = useState(saved?.id || '')
  const [loginPin, setLoginPin] = useState('')

  useEffect(() => {
    fetch('/api/leagues', { headers:getAuthHeaders() })
      .then(r => r.json())
      .then(setLeagues)
      .catch(() => {}) // ignore
  }, [])

  useEffect(() => {
    if (authed) navigate('/standings', { replace:true })
  }, [authed, navigate])

  const createLeague = async (e) => {
    e.preventDefault()
    setErrMsg(null); setCreating(true)
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
      setErrMsg(String(e?.message || e))
    } finally {
      setCreating(false)
    }
  }

  const login = async (e) => {
    e.preventDefault()
    setErrMsg(null)
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
      setErrMsg(String(e?.message || e))
    }
  }

  return (
    <div className="home-root">
      <div className="home-theme">
        <div className="container">
          {/* HERO */}
          <section className="home-hero">
            <div>
              <h1 style={{margin:0, fontSize:34, lineHeight:1.2}}>CSCoaching Leagues</h1>
              <p className="muted" style={{margin:'8px 0 0', maxWidth:820}}>
                <strong>Train. Strike. Repeat.</strong> Create or join a league, manage teams &amp; players, and
                enter scores with freezes, caps, and standings — all in one place.
              </p>
            </div>
            <div style={{display:'grid', placeItems:'center'}}>
              {/* Place this file at client/public/csc-logo.png */}
              <img src="/csc-logo.png" alt="CSCoaching logo" className="home-hero__logo" />
            </div>
          </section>

          {/* WELCOME + FORMS */}
          <section className="card" style={{marginTop:16}}>
            <h2 style={{margin:0}}>Welcome</h2>
            <p className="muted" style={{margin:'6px 0 14px'}}>
              Create a new league or log into an existing one to access standings, teams, players, and score entry.
            </p>

            {!!errMsg && (
              <div className="card" style={{borderColor:'rgba(225,29,46,0.3)', background:'rgba(225,29,46,0.06)', color:'#ffbdbd', marginBottom:12}}>
                <strong>Error:</strong> {errMsg}
              </div>
            )}

            <div className="home-grid">
              {/* CREATE */}
              <section className="card">
                <h3 style={{margin:'0 0 8px'}}>Create a League</h3>
                <form onSubmit={createLeague} style={{ display:'grid', gap:8 }}>
                  <div style={row}>
                    <div style={label}>League Name</div>
                    <input placeholder="e.g. Ron Daly Trios" value={name} onChange={e=>setName(e.target.value)} required />
                  </div>
                  <div style={row}>
                    <div style={label}>Admin PIN</div>
                    <input placeholder="Choose a secure PIN" value={pin} onChange={e=>setPin(e.target.value)} required type="password" />
                  </div>
                  <div>
                    <button className="button primary" type="submit" disabled={creating}>
                      {creating ? 'Creating…' : 'Create & Log In'}
                    </button>
                  </div>
                </form>
              </section>

              {/* LOGIN */}
              <section className="card">
                <h3 style={{margin:'0 0 8px'}}>Log into a League</h3>
                <form onSubmit={login} style={{ display:'grid', gap:8 }}>
                  <div style={row}>
                    <div style={label}>League</div>
                    <select value={loginLeagueId} onChange={e=>setLoginLeagueId(e.target.value)} required>
                      <option value="" disabled>Select a league…</option>
                      {leagues.map(l => <option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}
                    </select>
                  </div>
                  <div style={row}>
                    <div style={label}>Admin PIN</div>
                    <input placeholder="Enter PIN" value={loginPin} onChange={e=>setLoginPin(e.target.value)} required type="password" />
                  </div>
                  <div>
                    <button className="button" type="submit">Log In</button>
                  </div>
                </form>
              </section>
            </div>

            <div className="muted" style={{marginTop:12, fontSize:12}}>
              Tip: You can switch leagues later from the header—your last league is remembered on this device.
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
