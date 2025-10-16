// client/src/main.jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import './global.css'

import Home from './pages/Home.jsx'
import SetupLeague from './pages/SetupLeague.jsx'
import Admin from './pages/Admin.jsx'
import Standings from './pages/Standings.jsx'
import EnterScores from './pages/EnterScores.jsx'
import Players from './pages/Players.jsx'
import Teams from './pages/Teams.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import Archive from './pages/Archive.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          {/* Public landing */}
          <Route index element={<Home />} />

          {/* Protected app pages */}
          <Route
            path="standings"
            element={<RequireAuth><Standings /></RequireAuth>}
          />
          <Route
            path="players"
            element={<RequireAuth><Players /></RequireAuth>}
          />
          <Route
            path="teams"
            element={<RequireAuth><Teams /></RequireAuth>}
          />
          <Route
            path="enter"
            element={<RequireAuth><EnterScores /></RequireAuth>}
          />
          <Route
            path="admin"
            element={<RequireAuth><Admin /></RequireAuth>}
          />
<Route
  path="archive"
  element={<RequireAuth><Archive /></RequireAuth>}
/>

          {/* (Optional) Keep setup page, could be authed or public; your call: */}
          <Route path="setup" element={<SetupLeague />} />

          {/* Fallback */}
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)


