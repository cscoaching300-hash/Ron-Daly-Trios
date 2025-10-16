// client/src/pages/Players.jsx
import React, { useEffect, useMemo, useState } from 'react'
import {
  getPlayersWithTeams,
  getPlayers,
  getTeams,
  addPlayer,
  updatePlayer,
  deletePlayer,
} from '../api'

const cell = { padding: 6, borderBottom: '1px solid var(--border)' }
const th = { ...cell, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'left' }
const td = { ...cell, whiteSpace: 'nowrap', textAlign: 'left' }
const num = v => (Number.isFinite(+v) ? +v : 0)

function PlayerForm({ teams, initial, onCancel, onSave, saving }) {
  const [name, setName] = useState(initial?.name || '')
  const [average, setAverage] = useState(
    initial?.average != null
      ? String(initial.average)
      : initial?.ave != null
      ? String(initial.ave) // fall back to computed ave if no stored average
      : ''
  )
  const [hcp, setHcp] = useState(
    initial?.hcpStored != null ? String(initial.hcpStored) : initial?.hcp != null ? String(initial.hcp) : ''
  )
  const [gender, setGender] = useState(initial?.gender || '')
  const [teamId, setTeamId] = useState(
    initial?.team_id != null ? String(initial.team_id || '') : ''
  )

  const cleanNumber = (s) => (s === '' || s == null ? '' : String(s).replace(/[^\d.]/g, ''))

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label>
          <div className="muted" style={{ marginBottom: 4 }}>Name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
        </label>
        <label>
          <div className="muted" style={{ marginBottom: 4 }}>Team</div>
          <select value={teamId} onChange={e => setTeamId(e.target.value)}>
            <option value="">— Sub / Free Agent —</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label>
          <div className="muted" style={{ marginBottom: 4 }}>Starting Average</div>
          <input
            inputMode="decimal"
            value={average}
            onChange={e => setAverage(cleanNumber(e.target.value))}
            placeholder="e.g. 165"
          />
        </label>
        <label>
          <div className="muted" style={{ marginBottom: 4 }}>Manual Handicap (optional)</div>
          <input
            inputMode="decimal"
            value={hcp}
            onChange={e => setHcp(cleanNumber(e.target.value))}
            placeholder="Leave blank to compute"
          />
        </label>
        <label>
          <div className="muted" style={{ marginBottom: 4 }}>Gender</div>
          <select value={gender} onChange={e => setGender(e.target.value)}>
            <option value="">—</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          className="button primary"
          disabled={!name || saving}
          onClick={() =>
            onSave({
              name: name.trim(),
              average: average === '' ? 0 : +average,
              hcp: hcp === '' ? null : +hcp,
              gender: gender || null,
              teamId: teamId ? +teamId : null,
            })
          }
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  )
}

export default function Players() {
  const [rows, setRows] = useState([])
  const [rawPlayers, setRawPlayers] = useState([]) // /api/players (for stored average/hcp, etc.)
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  // Load all lists
  const load = async () => {
    try {
      setLoading(true)
      setErr(null)
      const [pw, pl, tm] = await Promise.all([
        getPlayersWithTeams(),
        getPlayers(),
        getTeams(),
      ])
      setRows(Array.isArray(pw) ? pw : [])
      setRawPlayers(Array.isArray(pl) ? pl : [])
      setTeams(Array.isArray(tm) ? tm : [])
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Build a byId map from raw players for edit defaults
  const rawById = useMemo(() => {
    const m = new Map()
    for (const p of rawPlayers) m.set(+p.id, p)
    return m
  }, [rawPlayers])

  // Group by team name for display
  const groups = useMemo(() => {
    const map = new Map()
    for (const p of rows) {
      const key = p.team_name || '— Sub / Free Agent —'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    for (const k of map.keys()) {
      map.get(k).sort((a,b)=> (b.pts||0)-(a.pts||0) || (b.pinsh||0)-(a.pinsh||0) || a.name.localeCompare(b.name))
    }
    return [...map.entries()]
  }, [rows])

  // CRUD handlers
  const handleAdd = async (payload) => {
    try {
      setSaving(true)
      await addPlayer(payload) // { name, average, hcp, gender, teamId }
      setAdding(false)
      await load()
    } catch (e) {
      alert('Add failed: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id, payload) => {
    try {
      setSaving(true)
      await updatePlayer(id, payload)
      setEditingId(null)
      await load()
    } catch (e) {
      alert('Update failed: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this player? This cannot be undone.')) return
    try {
      setSaving(true)
      await deletePlayer(id)
      setDeletingId(null)
      await load()
    } catch (e) {
      alert('Delete failed: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card">Loading players…</div>
  if (err) return <div className="card" style={{ color: 'var(--danger)' }}>Error: {err}</div>

  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Players</h2>
        {!adding ? (
          <button className="button primary" onClick={() => { setEditingId(null); setAdding(true) }}>
            + Add Player
          </button>
        ) : null}
      </div>

      {adding && (
        <PlayerForm
          teams={teams}
          onCancel={() => setAdding(false)}
          onSave={handleAdd}
          saving={saving}
        />
      )}

      {groups.length === 0 && <div className="muted">No players yet.</div>}

      <div style={{ display: 'grid', gap: 16 }}>
        {groups.map(([teamName, players]) => (
          <section key={teamName} className="card" style={{ padding: 12 }}>
            <h3 style={{ margin: '4px 0 8px' }}>{teamName}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Player</th>
                    <th style={th}>Team</th>
                    <th style={th}>Hcp</th>
                    <th style={th}>Gms</th>
                    <th style={th}>Pts</th>
                    <th style={th}>Ave.</th>
                    <th style={th}>PinsS</th>
                    <th style={th}>PinsH</th>
                    <th style={th}>Hgs</th>
                    <th style={th}>Hgh</th>
                    <th style={th}>Hss</th>
                    <th style={th}>Hsh</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(p => {
                    const isEditing = editingId === p.id
                    const stored = rawById.get(+p.id) || null
                    return (
                      <tr key={p.id}>
                        <td style={td} colSpan={isEditing ? 12 : 0}>
                          {isEditing ? (
                            <PlayerForm
                              teams={teams}
                              initial={{
                                id: p.id,
                                name: p.name,
                                team_id: p.team_id ?? null,
                                gender: stored?.gender ?? p.gender ?? '',
                                average:
                                  stored?.average != null
                                    ? stored.average
                                    : p.ave != null
                                    ? p.ave
                                    : '',
                                hcpStored: stored?.hcp ?? null,
                                hcp: p.hcp ?? null,
                                ave: p.ave ?? null,
                              }}
                              onCancel={() => setEditingId(null)}
                              onSave={(payload) => handleUpdate(p.id, payload)}
                              saving={saving}
                            />
                          ) : (
                            <>
                              <span>{p.name}</span>
                            </>
                          )}
                        </td>

                        {!isEditing && (
                          <>
                            <td style={td}>{p.team_name}</td>
                            <td style={td}>{p.hcp ?? 0}</td>
                            <td style={td}>{p.gms ?? 0}</td>
                            <td style={td}>{p.pts ?? 0}</td>
                            <td style={td}>{p.ave ?? 0}</td>
                            <td style={td}>{p.pinss ?? 0}</td>
                            <td style={td}>{p.pinsh ?? 0}</td>
                            <td style={td}>{p.hgs ?? 0}</td>
                            <td style={td}>{p.hgh ?? 0}</td>
                            <td style={td}>{p.hss ?? 0}</td>
                            <td style={td}>{p.hsh ?? 0}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <button className="button" onClick={() => { setAdding(false); setEditingId(p.id) }}>
                                Edit
                              </button>{' '}
                              <button
                                className="button"
                                onClick={() => handleDelete(p.id)}
                                disabled={saving && deletingId === p.id}
                                title="Delete player"
                                style={{ color: 'var(--danger)' }}
                              >
                                Delete
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}


