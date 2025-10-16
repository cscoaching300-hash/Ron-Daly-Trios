// client/src/components/Nav.jsx
import React from 'react'
import { NavLink } from 'react-router-dom'
import { isAuthed } from '../lib/auth.js'

export default function Nav({ authed = isAuthed() }) {
  const link = (to, label) => (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        padding:'6px 10px',
        borderRadius:8,
        textDecoration:'none',
        color:'var(--text)',
        background:isActive ? 'var(--bg-soft)' : 'transparent',
        border:'1px solid var(--border)'
      })}
    >
      {label}
    </NavLink>
  )

  return (
    <nav style={{ display:'flex', gap:8 }}>
      {!authed ? (
        <>
          {link('/', 'Home')}
        </>
      ) : (
        <>
          {link('/standings', 'Standings')}
          {link('/players', 'Players')}
          {link('/teams', 'Teams')}
          {link('/enter', 'Enter Scores')}
          {link('/admin', 'Admin')}
// inside the authed nav block:
{link('/archive', 'Archive')}

        </>
      )}
    </nav>
  )
}
