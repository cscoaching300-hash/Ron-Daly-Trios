// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders, saveLeagueAuth, getSavedLeague, isAuthed } from '../lib/auth.js'

const row = { display:'grid', gridTemplateColumns:'140px 1fr', gap:12, alignItems:'center', margin:'8px 0' }
const label = { fontWeight:600, textAlign:'right' }

/** Brand helpers (inline so you don't need more CSS to get the look) */
const brand = {
  red: '#e11d2e',
  redDark: '#b31624',
  ring: 'rgba(225,29,46,0.25)',
}

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
    <div style={{ display:'grid', gap:16 }}>
      {/* HERO */}
      <section
        className="card"
        style={{
          padding:'22px 20px',
          borderRadius:16,
          border:'1px solid var(--border)',
          background:
            'radial-gradient(900px 400px at -10% -30%, rgba(225,29,46,0.08), transparent 60%),' +
            'radial-gradient(700px 350px at 120% 10%, rgba(225,29,46,0.06), transparent 60%),' +
            'var(--card)',
        }}
      >
        <div style={{
          display:'grid',
          gridTemplateColumns:'1.2fr 0.8fr',
          gap:16,
          alignItems:'center'
        }}>
          {/* Left: title + copy */}
          <div>
            <h1 style={{margin:'2px 0 6px', fontSize:34, lineHeight:1.1}}>
              <span style={{ fontWeight:800 }}>CSCoaching Leagues</span>
            </h1>

            <p style={{margin:'0 0 10px', fontSize:16}}>
              <strong>Train. Strike. Repeat.</strong> Create or join a league, manage teams & players,
              and enter scores with freezes, caps, and standings — all in one place.
            </p>
          </div>

          {/* Right: logo */}
          <div style={{ display:'grid', placeItems:'center' }}>
            {/* Place your logo at client/public/csc-logo.png */}
            <img
              src="/csc-logo.png"
              alt="CSCoaching logo"
              style={{
                width:'100%',
                maxWidth:340,
                filter:'drop-shadow(0 10px 24px rgba(0,0,0,0.20))',
                userSelect:'none',
              }}
            />
          </div>
        </div>
      </section>

      {/* MAIN: welcome and forms */}
      <section className="card" style={{ padding:16, borderRadius:16 }}>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <h2 style={{margin:0}}>Welcome</h2>
          {saved?.name && (
            <div className="muted" style={{ fontSize:13 }}>
              Last league: <strong>{saved.name}</strong>
            </div>
          )}
        </div>

        <p className="muted" style={{margin:'6px 0 14px'}}>
          Create a new league or log into an existing one to access standings, teams, players, and score entry.
        </p>

        {error && (
          <div
            style={{
              border:`1px solid ${brand.red}`,
              background:'rgba(225,29,46,0.06)',
              color: brand.redDark,
              borderRadius:12,
              padding:'10px 12px',
              marginBottom:12
            }}
          >
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
          <section className="card" style={{ padding:16, borderRadius:14 }}>
            <h3 style={{margin:'0 0 8px'}}>Create a League</h3>
            <p className="muted" style={{margin:'0 0 10px', fontSize:13}}>
              Spin up a new league with your Admin PIN.
            </p>
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
                <button
                  className="button"
                  type="submit"
                  disabled={creating}
                  style={{
                    border:`1px solid ${brand.red}`,
                    background: brand.red,
                    color:'#fff',
                    minWidth:140,
                    boxShadow:'0 6px 20px rgba(225,29,46,0.22)',
                    borderRadius:12,
                  }}
                  onFocus={(e)=> e.currentTarget.style.boxShadow = `0 0 0 3px ${brand.ring}`}
                  onBlur={(e)=> e.currentTarget.style.boxShadow = '0 6px 20px rgba(225,29,46,0.22)'}
                >
                  {creating ? 'Creating…' : 'Create & Log In'}
                </button>
              </div>
            </form>
          </section>

          {/* LOGIN */}
          <section className="card" style={{ padding:16, borderRadius:14 }}>
            <h3 style={{margin:'0 0 8px'}}>Log into a League</h3>
            <p className="muted" style={{margin:'0 0 10px', fontSize:13}}>
              Use your league and Admin PIN.
            </p>
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
                <button
                  className="button"
                  type="submit"
                  style={{
                    border:`1px solid ${brand.red}`,
                    background:'transparent',
                    color:brand.red,
                    minWidth:100,
                    borderRadius:12
                  }}
                  onMouseOver={(e)=> e.currentTarget.style.background = 'rgba(225,29,46,0.06)'}
                  onMouseOut={(e)=> e.currentTarget.style.background = 'transparent'}
                >
                  Log In
                </button>
              </div>
            </form>
          </section>
        </div>

        <div className="muted" style={{marginTop:12, fontSize:12}}>
          Tip: You can switch leagues later from the header—your last league is remembered on this device.
        </div>
      </section>
    </div>
  )
}
