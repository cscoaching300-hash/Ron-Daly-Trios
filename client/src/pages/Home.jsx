// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders, saveLeagueAuth, getSavedLeague, isAuthed } from '../lib/auth.js'

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
    <div style={{display:'grid', gap:16}}>
      {/* HERO */}
      <section
        className="card"
        style={{
          padding:'28px 20px',
          background:
            'linear-gradient(140deg, rgba(75,123,236,0.08), rgba(0,0,0,0) 55%), var(--card)',
          borderColor:'var(--border)'
        }}
      >
        <div style={{display:'flex', alignItems:'center', gap:16, flexWrap:'wrap'}}>
          <div style={{display:'grid', gap:6}}>
            <h1 style={{margin:0, fontSize:28, lineHeight:1.1}}>CSCoaching Leagues</h1>
            <div className="muted" style={{maxWidth:820}}>
              Create or join a league, manage teams & players, and enter scores with
              handicap, freezes, caps, and standings—all in one place.
            </div>
          </div>
        </div>

        {/* Feature chips */}
        <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:12}}>
          {['Handicap & scratch', 'Freeze window', 'Junior caps', 'Singles + team points', 'Auto standings'].map(t => (
            <span key={t} className="button" style={{fontWeight:500, padding:'6px 10px', minHeight:32}}>
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* WELCOME + FORMS */}
      <section className="card" style={{padding:16}}>
        <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
          <h2 style={{margin:0}}>Welcome</h2>
          {/* remember-last-league hint */}
          {saved?.name && (
            <div className="muted" style={{fontSize:13}}>
              Last league: <strong>{saved.name}</strong>
            </div>
          )}
        </div>
        <p className="muted" style={{margin:'6px 0 14px'}}>
          Create a new league or log into an existing one to access standings, teams, players, and score entry.
        </p>

        {error && (
          <div className="card" style={{borderColor:'#e11d48', background:'rgba(225,29,72,0.06)', color:'#b91c1c', marginBottom:12}}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div
          style={{
            display:'grid',
            gridTemplateColumns:'1fr 1fr',
            gap:16
          }}
        >
          {/* CREATE */}
          <section className="card" style={{ padding:16 }}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
              <h3 style={{margin:0}}>Create a League</h3>
            </div>
            <form onSubmit={createLeague} style={{ display:'grid', gap:8 }}>
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
              <div>
                <button className="button primary" type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create & Log In'}
                </button>
              </div>
            </form>
          </section>

          {/* LOGIN */}
          <section className="card" style={{ padding:16 }}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
              <h3 style={{margin:0}}>Log into a League</h3>
            </div>
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
                <input
                  placeholder="Enter PIN"
                  value={loginPin}
                  onChange={e=>setLoginPin(e.target.value)}
                  required
                  type="password"
                />
              </div>
              <div>
                <button className="button" type="submit">Log In</button>
              </div>
            </form>
          </section>
        </div>

        {/* Little footer hint */}
        <div className="muted" style={{marginTop:12, fontSize:12}}>
          Tip: You can switch leagues later from the header—your last league is remembered on this device.
        </div>
      </section>
    </div>
  )
}
