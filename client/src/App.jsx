// client/src/App.jsx
import React from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { clearLeagueAuth, getSavedLeague, isAuthed } from './lib/auth.js'

export default function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const authed = isAuthed()
  const league = getSavedLeague()

  const doLogout = () => {
    clearLeagueAuth()
    navigate('/', { replace: true })
  }

  return (
    <div style={{ fontFamily:'system-ui, sans-serif', maxWidth:1200, margin:'0 auto', padding:16 }}>
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <h1 style={{ margin:0 }}>
          🏆 Bowling League{authed && league?.name ? ` — ${league.name}` : ''}
        </h1>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <Nav authed={authed} />
          <ThemeToggle />
          {authed && (
            <button className="btn" onClick={doLogout} title="Log out of current league">
              Log out
            </button>
          )}
        </div>
      </header>

      <main style={{ marginTop:16 }}>
        <Outlet />
      </main>

      <footer style={{ marginTop:32, fontSize:12, opacity:0.7 }}>
        {pathname !== '/standings' && authed && <Link to="/standings">View full standings →</Link>}
      </footer>
    </div>
  )
}

