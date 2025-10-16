import React, { useEffect, useMemo, useState } from 'react'
import { getAuthHeaders } from '../lib/auth.js'

const cell = { padding: 6, borderBottom: '1px solid var(--border)' }
const th = { ...cell, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'left' }
const td = { ...cell, whiteSpace: 'nowrap', textAlign: 'left' }
const btn = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bgElevated)', cursor: 'pointer' }
const dangerBtn = { ...btn, color: 'var(--danger)', borderColor: 'var(--danger)' }

export default function Teams() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const headers = getAuthHeaders()

  const load = async () => {
    try {
      setLoading(true)
      setErr(null)
      const [tRes, pRes] = await Promise.all([
        fetch('/api/teams', { headers }),
        fetch('/api/players-with-teams', { headers })
      ])
      const [t, p] = await Promise.all([tRes.json(), pRes.json()])
      setTeams(Array.isArray(t) ? t : [])
      setPlayers(Array.isArray(p) ? p : [])
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const rosterByTeamId = useMemo(() => {
    const map = new Map()
    for (const pl of players) {
      const tid = pl.team_id || null
      if (!tid) continue
      if (!map.has(tid)) map.set(tid, [])
      map.get(tid).push(pl)
    }
    return map
  }, [players])

  async function createTeam(e) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name: newName.trim(), playerIds: [] })
      })
      if (!res.ok) throw new Error('Failed to create team')
      setNewName('')
      await load()
    } catch (e) {
      alert(e.message)
    }
  }

  async function deleteTeam(team) {
    if (!window.confirm(`Delete team "${team.name}"? This only deletes the team; players remain.`)) return
    try {
      const roster = rosterByTeamId.get(team.id) || []
      await Promise.all(
        roster.map(pl => fetch(`/api/players/${pl.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ teamId: null })
        }))
      )
      alert('Team deleted placeholder: players were detached. For hard delete, add DELETE /api/teams on the server.')
      await load()
    } catch (e) {
      alert(e.message)
    }
  }

  function startEdit(team) {
    setEditingId(team.id)
    setEditName(team.name)
  }

  async function saveEdit(team) {
    try {
      // Only works if server supports PUT /api/teams/:id
      const put = await fetch(`/api/teams/${team.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: editName.trim() })
      })
      if (!put.ok) throw new Error('Server does not support renaming teams yet.')
      setEditingId(null)
      await load()
    } catch (e) {
      alert(e.message)
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
  }

  return (
    <div className="card">
      <h2 style={{marginTop:0}}>Teams</h2>

      <form onSubmit={createTeam} style={{display:'flex', gap:8, alignItems:'center', marginBottom:16}}>
        <input
          value={newName}
          onChange={e=>setNewName(e.target.value)}
          placeholder="New team name"
          style={{padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8, minWidth:260}}
        />
        <button type="submit" style={btn}>Create team</button>
      </form>

      {loading && <div className="muted">Loading…</div>}
      {err && <div style={{color:'var(--danger)'}}>Error: {err}</div>}

      {!loading && !err && (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse', width:'100%'}}>
            <thead>
              <tr>
                <th style={th}>Team</th>
                <th style={th}>Players</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(team => {
                const roster = rosterByTeamId.get(team.id) || []
                const isEditing = editingId === team.id
                return (
                  <tr key={team.id}>
                    <td style={td}>
                      {isEditing ? (
                        <input
                          value={editName}
                          onChange={e=>setEditName(e.target.value)}
                          style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:8}}
                        />
                      ) : (
                        team.name
                      )}
                    </td>
                    <td style={td}>{roster.length}</td>
                    <td style={{...td, display:'flex', gap:8, flexWrap:'wrap'}}>
                      {!isEditing ? (
                        <>
                          <button style={btn} onClick={()=>startEdit(team)}>Rename</button>
                          <ManageRosterButton team={team} roster={roster} players={players} onChange={load} />
                          <button style={dangerBtn} onClick={()=>deleteTeam(team)}>Delete</button>
                        </>
                      ) : (
                        <>
                          <button style={btn} onClick={()=>saveEdit(team)}>Save</button>
                          <button style={btn} onClick={cancelEdit} type="button">Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ManageRosterButton({ team, roster, players, onChange }) {
  const [open, setOpen] = useState(false)
  const headers = getAuthHeaders()

  const assignedIds = new Set(roster.map(p=>p.id))
  const all = useMemo(()=> (players || []).slice().sort((a,b)=> a.name.localeCompare(b.name)), [players])

  async function save(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const chosen = new Set(form.getAll('players').map(v=>+v))

    const tasks = []
    for (const p of all) {
      const shouldBeOnTeam = chosen.has(p.id)
      const isOnTeam = assignedIds.has(p.id)
      if (shouldBeOnTeam !== isOnTeam) {
        tasks.push(
          fetch(`/api/players/${p.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ teamId: shouldBeOnTeam ? team.id : null })
          })
        )
      }
    }
    await Promise.all(tasks)
    setOpen(false)
    onChange?.()
  }

  if (!open) return <button style={btn} onClick={()=>setOpen(true)}>Manage roster</button>

  return (
    <div className="card" style={{padding:12}}>
      <form onSubmit={save} style={{display:'grid', gap:8}}>
        <div style={{fontWeight:700, marginBottom:4}}>Roster for {team.name}</div>
        <div style={{maxHeight:260, overflow:'auto', padding:8, border:'1px solid var(--border)', borderRadius:8}}>
          {all.map(p => {
            const checked = assignedIds.has(p.id)
            return (
              <label key={p.id} style={{display:'flex', alignItems:'center', gap:8, padding:'4px 0'}}>
                <input type="checkbox" name="players" value={p.id} defaultChecked={checked} />
                <span>{p.name}</span>
                {p.team_id && p.team_id !== team.id ? (
                  <span className="muted" style={{fontSize:12}}>(on {p.team_name})</span>
                ) : null}
              </label>
            )
          })}
        </div>
        <div style={{display:'flex', gap:8}}>
          <button style={btn} type="submit">Save</button>
          <button type="button" style={btn} onClick={()=>setOpen(false)}>Close</button>
        </div>
      </form>
    </div>
  )
}
