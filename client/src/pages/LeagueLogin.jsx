import React, { useEffect, useState } from 'react'
import { listLeagues, loginLeague } from '../api'
import { useNavigate } from 'react-router-dom'

export default function LeagueLogin() {
  const [leagues, setLeagues] = useState([])
  const [leagueId, setLeagueId] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    listLeagues().then(list => {
      setLeagues(list || []); setLoading(false)
      if (list?.[0]) setLeagueId(String(list[0].id))
    })
  }, [])

  const submit = async () => {
    const res = await loginLeague(leagueId, pin)
    if (!res?.token) return alert(res?.error || 'Login failed')
    localStorage.setItem('league_auth', JSON.stringify({ leagueId: +leagueId, token: res.token }))
    navigate('/admin')
  }

  if (loading) return <section className="card"><p>Loading leagues…</p></section>

  return (
    <section className="card" style={{display:'grid', gap:12}}>
      <h2>League Login</h2>
      <label>League
        <select value={leagueId} onChange={e=>setLeagueId(e.target.value)}>
          {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label>Admin PIN
        <input type="password" value={pin} onChange={e=>setPin(e.target.value)} />
      </label>
      <div style={{display:'flex', gap:8}}>
        <button className="button primary" onClick={submit}>Log in</button>
        <a className="button" href="/setup">Create a league</a>
      </div>
    </section>
  )
}
