// client/src/components/RequireAuth.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthed } from '../lib/auth.js';

export default function RequireAuth({ children }) {
  const loc = useLocation();
  if (!isAuthed()) {
    return <Navigate to="/" replace state={{ from: loc }} />;
  }
  return children;
}
