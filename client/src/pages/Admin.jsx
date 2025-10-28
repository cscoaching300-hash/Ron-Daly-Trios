// client/src/pages/Admin.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { getAuthHeaders } from '../lib/auth.js' // only this is required

const row = { display:'grid', gridTemplateColumns:'180px 1fr', gap:12, alignItems:'center', margin:'8px 0' }
const label = { fontWeight:600, textAlign:'right' }
const small = { fontSize:12, opacity:0.7 }

function readSavedAuth() {
  try { return JSON.parse(localStorage.getItem('leagueAuth') || 'null') } catch { return null }
}
function saveLeagueAuth(obj) {
  localStorage.setItem('leagueAuth', JSON.stringify(obj || null))
}

export default function Admin() {
  // --- auth bits ---
  const saved = readSavedAuth()
  const [league, setLeague] = useState(null)
  const [form, setForm] = useState({
    name:'',
    teamsCount:0,
    weeks:0,
    gamesPerWeek:3,
    mode:'handicap',
    handicapBase:200,
    handicapPercent:90,
    teamPointsWin:2,
    teamPointsDraw:1,
    indivPointsWin:1,
    indivPointsDraw:0,
    // NEW: UI sets min *weeks*; server uses min *games*
    hcpMinWeeks: 0,
    // Caps
    handicapCapAdult: 0,
    handicapCapJunior: 0,
    // Officers
    officials: {
      chair: '',
      viceChair: '',
      treasurer: '',
      secretary: ''
    }
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [pin, setPin] = useState('')      // for login

  // token present?
  const loggedIn = useMemo(() => !!(getAuthHeaders()['x-auth-token']), [])

  // --- load current league (for settings form) ---
  useEffect(() => {
    let cancel = false
    async function run() {
      try {
        setLoading(true)
        setError(null)
        const resp = await fetch('/api/leagues', { headers:getAuthHeaders() })
        const leagues = await resp.json()
        const current =
          leagues.find(l => saved && l.id === saved.id) ||
          leagues[0] || null
        if (!cancel) {
          setLeague(current)
          if (current) {
            const gamesPerWeek = current.gamesPerWeek ?? 3
            const hcpMinGames = Number(current.hcpMinGames ?? 0)
            // Derive weeks from games (ceil to be safe)
            const hcpMinWeeks = Math.ceil(hcpMinGames / (gamesPerWeek || 1))

            setForm({
              name: current.name || '',
              teamsCount: current.teamsCount ?? 0,
              weeks: current.weeks ?? 0,
              gamesPerWeek,
              mode: current.mode === 'scratch' ? 'scratch' : 'handicap',
              handicapBase: current.handicapBase ?? 200,
              handicapPercent: current.handicapPercent ?? 90,
              teamPointsWin: current.teamPointsWin ?? 0,
              teamPointsDraw: current.teamPointsDraw ?? 0,
              indivPointsWin: current.indivPointsWin ?? 0,
              indivPointsDraw: current.indivPointsDraw ?? 0,
              hcpMinWeeks,
              handicapCapAdult: current.handicapCapAdult ?? 0,
              handicapCapJunior: current.handicapCapJunior ?? 0,
              officials: {
                chair: current.officials?.chair || '',
                viceChair: current.officials?.viceChair || '',
                treasurer: current.officials?.treasurer || '',
                secretary: current.officials?.secretary || ''
              }
            })
          }
        }
      } catch (e) {
        if (!cancel) setError(String(e?.message || e))
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    run()
    return () => { cancel = true }
  }, [loggedIn, saved?.id])

  // ---- auth: login by league id/pin ----
  const [loginLeagueId, setLoginLeagueId] = useState(saved?.id || '')
  const doLogin = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const r = await fetch('/api/login', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ leagueId: Number(loginLeagueId), pin })
      })
      const data = await r.json()
      if (!r.ok || data?.error) throw new Error(data?.error || 'Login failed')
      saveLeagueAuth({ id:Number(loginLeagueId), name:data.league?.name || 'League', token:data.token })
      window.location.reload()
    } catch (e) {
      setError(String(e?.message || e))
    }
  }

  // ---- update handlers ----
  const on = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const onNum = (k) => (e) => setForm(f => ({ ...f, [k]: Number(e.target.value) || 0 }))
  const onMode = (e) => setForm(f => ({ ...f, mode: e.target.value === 'scratch' ? 'scratch' : 'handicap' }))
  const onOfficial = (k) => (e) =>
    setForm(f => ({ ...f, officials: { ...(f.officials || {}), [k]: e.target.value } }))

  const save = async (e) => {
    e?.preventDefault?.()
    if (!league) return
    setSaving(true)
    setError(null)
    try {
      const gamesPerWeek = Number(form.gamesPerWeek) || 0
      const hcpMinWeeks = Number(form.hcpMinWeeks) || 0
      const hcpMinGames = Math.max(0, hcpMinWeeks * gamesPerWeek)

      const body = {
        name: form.name,
        gamesPerWeek,
        mode: form.mode === 'scratch' ? 'scratch' : 'handicap',
        handicapBase: Number(form.handicapBase) || 0,
        handicapPercent: Number(form.handicapPercent) || 0,
        teamPointsWin: Number(form.teamPointsWin) || 0,
        teamPointsDraw: Number(form.teamPointsDraw) || 0,
        indivPointsWin: Number(form.indivPointsWin) || 0,
        indivPointsDraw: Number(form.indivPointsDraw) || 0,
        // NEW: send min games (derived from weeks)
        hcpMinGames,
        // Caps
        handicapCapAdult: Number(form.handicapCapAdult) || 0,
        handicapCapJunior: Number(form.handicapCapJunior) || 0,
        // Officers
        officials: {
          chair: String(form.officials?.chair || ''),
          viceChair: String(form.officials?.viceChair || ''),
          treasurer: String(form.officials?.treasurer || ''),
          secretary: String(form.officials?.secretary || '')
        }
      }

      const r = await fetch(`/api/leagues/${league.id}`, {
        method:'PUT',
        headers: { 'Content-Type':'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body)
      })
      const data = await r.json()
      if (!r.ok || data?.error) throw new Error(data?.error || 'Save failed')
      setLeague(data.league)

      // Update form state with normalized values (and re-derive weeks)
      const normGPW = data.league?.gamesPerWeek ?? gamesPerWeek
      const normMinGames = data.league?.hcpMinGames ?? hcpMinGames
      setForm(f => ({
        ...f,
        gamesPerWeek: normGPW,
        hcpMinWeeks: Math.ceil((normMinGames || 0) / (normGPW || 1))
      }))
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  // ---- upload logo ----
  const onLogo = async (e) => {
    if (!league) return
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('logo', file)
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/leagues/${league.id}/logo`, { method:'POST', headers:getAuthHeaders(), body:fd })
      const data = await r.json()
      if (!r.ok || data?.error) throw new Error(data?.error || 'Upload failed')
      setLeague(l => ({ ...l, logo:data.logo }))
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h2 style={{marginTop:0}}>Admin</h2>

      {!loggedIn && (
        <section className="card" style={{ padding:12, marginBottom:16 }}>
          <h3 style={{margin:'4px 0 12px'}}>Log in to a league</h3>
          <form onSubmit={doLogin} style={{ display:'grid', gap:12 }}>
            <div style={row}>
              <div style={label}>League ID</div>
              <input inputMode="numeric" value={loginLeagueId} onChange={e=>setLoginLeagueId(e.target.value)} required />
            </div>
            <div style={row}>
              <div style={label}>Admin PIN</div>
              <input type="password" value={pin} onChange={e=>setPin(e.target.value)} required />
            </div>
            <div>
              <button className="btn" type="submit">Log in</button>
            </div>
          </form>
        </section>
      )}

      {error && <div style={{ color:'var(--danger)', marginBottom:12 }}>Error: {error}</div>}
      {loading && <div className="muted">Loading…</div>}

      {league && (
        <section className="card" style={{ padding:12 }}>
          <h3 style={{margin:'4px 0 12px'}}>League Settings</h3>

          <form onSubmit={save} style={{ display:'grid', gap:8 }}>
            <div style={row}>
              <div style={label}>Name</div>
              <input value={form.name} onChange={on('name')} />
            </div>

            <div style={row}>
              <div style={label}>Games per Week</div>
              <input inputMode="numeric" value={form.gamesPerWeek} onChange={onNum('gamesPerWeek')} />
            </div>

            <div style={row}>
              <div style={label}>Mode</div>
              <select value={form.mode} onChange={onMode}>
                <option value="handicap">Handicap</option>
                <option value="scratch">Scratch</option>
              </select>
            </div>

            {form.mode === 'handicap' && (
              <>
                <div style={row}>
                  <div style={label}>Handicap Base</div>
                  <input inputMode="numeric" value={form.handicapBase} onChange={onNum('handicapBase')} />
                </div>

                <div style={row}>
                  <div style={label}>Handicap %</div>
                  <input inputMode="numeric" value={form.handicapPercent} onChange={onNum('handicapPercent')} />
                </div>

                {/* NEW: Per-player threshold (weeks) */}
                <div style={row}>
                  <div style={label}>Min Weeks Before Calc HCP</div>
                  <div>
                    <input
                      inputMode="numeric"
                      value={form.hcpMinWeeks}
                      onChange={onNum('hcpMinWeeks')}
                    />
                    <div style={small}>
                      Players use their manual/start handicap until they have played at least this many weeks.
                      The server converts this to games = weeks × games per week.
                    </div>
                  </div>
                </div>

                {/* Handicap Caps */}
                <div style={row}>
                  <div style={label}>Adult Handicap Cap</div>
                  <div>
                    <input
                      inputMode="numeric"
                      value={form.handicapCapAdult}
                      onChange={onNum('handicapCapAdult')}
                    />
                    <div style={small}>0 = no cap. Applies to non-juniors.</div>
                  </div>
                </div>

                <div style={row}>
                  <div style={label}>Junior Handicap Cap</div>
                  <div>
                    <input
                      inputMode="numeric"
                      value={form.handicapCapJunior}
                      onChange={onNum('handicapCapJunior')}
                    />
                    <div style={small}>0 = no cap. Applies only to players marked as juniors.</div>
                  </div>
                </div>
              </>
            )}

            {/* ⬇️ NEW: Points section (always visible) */}
            <hr style={{ border:'0', borderTop:'1px solid var(--border)', margin:'12px 0' }} />
            <h4 style={{ margin:'0 0 8px' }}>Points</h4>

            <div style={row}>
              <div style={label}>Team Points — Win</div>
              <input inputMode="numeric" value={form.teamPointsWin} onChange={onNum('teamPointsWin')} />
            </div>

            <div style={row}>
              <div style={label}>Team Points — Draw</div>
              <input inputMode="numeric" value={form.teamPointsDraw} onChange={onNum('teamPointsDraw')} />
            </div>

            <div style={row}>
              <div style={label}>Individual Points — Win</div>
              <input inputMode="numeric" value={form.indivPointsWin} onChange={onNum('indivPointsWin')} />
            </div>

            <div style={row}>
              <div style={label}>Individual Points — Draw</div>
              <input inputMode="numeric" value={form.indivPointsDraw} onChange={onNum('indivPointsDraw')} />
            </div>

            {/* Logo upload */}
            <div style={row}>
              <div style={label}>Logo</div>
              <div>
                {league.logo && <img alt="logo" src={league.logo} style={{ height:40, marginRight:8, verticalAlign:'middle' }} />}
                <input type="file" accept="image/*" onChange={onLogo} />
                <div style={small}>Upload replaces the current logo.</div>
              </div>
            </div>

            {/* Officers */}
            <hr style={{ border:'0', borderTop:'1px solid var(--border)', margin:'12px 0' }} />
            <h4 style={{ margin:'0 0 8px' }}>League Officers (shown on Standings header)</h4>

            <div style={row}>
              <div style={label}>Chairperson</div>
              <input value={form.officials.chair} onChange={onOfficial('chair')} placeholder="Full name" />
            </div>
            <div style={row}>
              <div style={label}>Vice Chairperson</div>
              <input value={form.officials.viceChair} onChange={onOfficial('viceChair')} placeholder="Full name" />
            </div>
            <div style={row}>
              <div style={label}>Treasurer</div>
              <input value={form.officials.treasurer} onChange={onOfficial('treasurer')} placeholder="Full name" />
            </div>
            <div style={row}>
              <div style={label}>Secretary</div>
              <input value={form.officials.secretary} onChange={onOfficial('secretary')} placeholder="Full name" />
            </div>

            <div style={{ marginTop:8 }}>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}

