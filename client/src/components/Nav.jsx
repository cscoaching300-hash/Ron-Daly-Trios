// client/src/components/Nav.jsx
import React from 'react'
import { NavLink } from 'react-router-dom'
import { isAuthed } from '../lib/auth.js'

export default function Nav({ authed = isAuthed() }) {
  const item = (to, label) => (
    <NavLink
      to={to}
      className={({ isActive }) => `button${isActive ? ' active' : ''}`}
    >
      {label}
    </NavLink>
  )

  return (
    <nav className="nav" aria-label="Primary">
      {!authed ? (
        <>
          {item('/', 'Home')}
        </>
      ) : (
        <>
          {item('/standings', 'Standings')}
          {item('/players', 'Players')}
          {item('/teams', 'Teams')}
          {item('/enter', <>Enter<br/>Scores</>)} {/* allow 2-line label */}
          {item('/admin', 'Admin')}
          {item('/archive', 'Archive')}
        </>
      )}
    </nav>
  )
}
