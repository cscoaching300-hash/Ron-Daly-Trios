// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders, saveLeagueAuth, getSavedLeague, isAuthed } from '../lib/auth.js'

const row = { display:'grid', gridTemplateColumns:'140px 1fr', gap:12, alignItems:'center' }
const label = { fontWeight:600, textAlign:'right' }

// Brand colors for buttons/glow
const BRAND_RED = '#E11D2E'
const BRAND_RED_DARK = '#B31624'
const BRAND_RING = 'rgba(225,29,46,0.25)'

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
    <div style={{ display:'grid', gap:20 }}>
      {/* HERO */}
      <section
        style={{
          borderRadius:18,
          padding:'28px 26px',
          // softer, brandy background
          background:
            'radial-gradient(900px 420px at -10% -30%, rgba(225,29,46,0.08), transparent 60%), ' +
            'radial-gradient(700px 350px at 120% 10%, rgba(225,29,46,0.06), transparent 60%), ' +
            'var(--card)',
          border:'1px solid var(--border)',
          boxShadow:'0 10px 30px rgba(0,0,0,0.05)'
        }}
      >
        <div
          style={{
            display:'grid',
            gridTemplateColumns:'2fr 1.1fr',
            gap:18,
            alignItems:'center'
          }}
        >
          {/* Left: title/strapline */}
          <div>
            <h1
              style={{
                margin:'0 0 8px',
                fontSize:40,
                lineHeight:1.1,
                letterSpacing:0.2,
                fontWeight:800
              }}
            >
              CSCoaching Leagues
            </h1>
            <p style={{margin:0, fontSize:16, maxWidth:820}}>
              <strong>Train. Strike. Repeat.</strong>{' '}
              Create or join a league, manage teams & players, and enter scores with
              freezes, caps, and standings — all in one place.
            </p>
          </div>

          {/* Right: logo tile with subtle glow */}
          <div
            style={{
              justifySelf:'end',
              width:'min(380px, 100%)',
              borderRadius:16,
              padding:16,
              background:'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))',
              boxShadow:'0 1px 0 rgba(255,255,255,0.3) inset, 0 12px 28px rgba(0,0,0,0.08)',
            }}
          >
            <img
              src="/csc-logo.png"
              alt="CSCoaching logo"
              style={{
                width:'100%',
                display:'block',
                borderRadius:12,
                boxShadow:'0 12px 28px rgba(0,0,0,0.20)'
              }}
            />
          </div>
        </div>
      </section>

      {/* WELCOME + FORMS */}
      <section
        style={{
          borderRadius:18,
          padding:18,
          background:'var(--card)',
          border:'1px solid var(--border)',
          boxShadow:'0 10px 30px rgba(0,0,0,0.04)'
        }}
      >
        <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap' }}>
          <h2 style={{margin:0}}>Welcome</h2>
          {saved?.name && (
            <div className="muted" style={{ fontSize:13 }}>
              Last league: <strong>{saved.name}</strong>
            </div>
          )}
        </div>
        <p className="muted" style={{margin:'6px 0 16px'}}>
          Create a new league or log into an existing one to access standings, teams, players, and score entry.
        </p>

        {error && (
          <div
            style={{
              border:`1px solid ${BRAND_RED}`,
              background:'rgba(225,29,46,0.06)',
              color:BRAND_RED_DARK,
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
            gap:18
          }}
        >
          {/* CREATE */}
          <section
            className="card"
            style={{
              borderRadius:14,
              padding:16,
              border:'1px solid var(--border)',
              boxShadow:'0 4px 16px rgba(0,0,0,0.03)'
            }}
          >
            <h3 style={{margin:'0 0 10px'}}>Create a League</h3>
            <p className="muted" style={{margin:'0 0 12px', fontSize:13}}>
              Spin up a new league with your Admin PIN.
            </p>
            <form onSubmit={createLeague} style={{ display:'grid', gap:12 }}>
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
                    border:`1px solid ${BRAND_RED}`,
                    background:BRAND_RED,
                    color:'#fff',
                    minWidth:150,
                    padding:'10px 16px',
                    borderRadius:12,
                    boxShadow:'0 10px 28px rgba(225,29,46,0.22)',
                  }}
                  onFocus={(e)=> e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND_RING}`}
                  onBlur={(e)=> e.currentTarget.style.boxShadow = '0 10px 28px rgba(225,29,46,0.22)'}
                >
                  {creating ? 'Creating…' : 'Create & Log In'}
                </button>
              </div>
            </form>
          </section>

          {/* LOGIN */}
          <section
            className="card"
            style={{
              borderRadius:14,
              padding:16,
              border:'1px solid var(--border)',
              boxShadow:'0 4px 16px rgba(0,0,0,0.03)'
            }}
          >
            <h3 style={{margin:'0 0 10px'}}>Log into a League</h3>
            <p className="muted" style={{margin:'0 0 12px', fontSize:13}}>
              Use your league and Admin PIN.
            </p>
            <form onSubmit={login} style={{ display:'grid', gap:12 }}>
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
                    border:`1px solid ${BRAND_RED}`,
                    background:'transparent',
                    color:BRAND_RED,
                    minWidth:110,
                    padding:'10px 16px',
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

