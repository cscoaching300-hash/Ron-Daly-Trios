
import React from 'react'
import { Link } from 'react-router-dom'
export default function Dashboard() {
  return (
    <section>
      <p>Welcome! Use this app to manage your bowling league: create weeks, enter scores, and share live standings.</p>
      <ul>
        <li>👉 <Link to='/admin'>Add players / teams</Link></li>
        <li>👉 <Link to='/enter'>Enter scores</Link></li>
        <li>👉 <Link to='/standings'>View standings</Link></li>
      </ul>
    </section>
  )
}
