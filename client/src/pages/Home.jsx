// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders, saveLeagueAuth, getSavedLeague, isAuthed } from '../lib/auth.js'

const row = { display:'grid', gridTemplateColumns:'160px 1fr', gap:12, alignItems:'center', margin:'8px 0' }
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
    <div className="card">
      <h2 style={{marginTop:0}}>Welcome</h2>
      <p className="muted" style={{marginTop:-6}}>
        Create a new league or log into an existing one to access standings, teams, players, and score entry.
      </p>

      {error && <div style={{color:'var(--danger)', marginBottom:12}}>Error: {error}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <section className="card" style={{ padding:12 }}>
          <h3 style={{margin:'4px 0 12px'}}>Create a League</h3>
          <form onSubmit={createLeague} style={{ display:'grid', gap:8 }}>
            <div style={row}>
              <div style={label}>League Name</div>
              <input value={name} onChange={e=>setName(e.target.value)} required />
            </div>
            <div style={row}>
              <div style={label}>Admin PIN</div>
              <input value={pin} onChange={e=>setPin(e.target.value)} required type="password" />
            </div>
            <div>
              <button className="btn" type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create & Log In'}
              </button>
            </div>
          </form>
        </section>

        <section className="card" style={{ padding:12 }}>
          <h3 style={{margin:'4px 0 12px'}}>Log into a League</h3>
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
              <input value={loginPin} onChange={e=>setLoginPin(e.target.value)} required type="password" />
            </div>
            <div>
              <button className="btn" type="submit">Log In</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
