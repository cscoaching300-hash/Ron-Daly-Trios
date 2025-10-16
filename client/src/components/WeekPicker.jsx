// client/src/components/WeekPicker.jsx
import React from 'react';

export default function WeekPicker({ value, onChange, options = [] }) {
  const handle = (e) => {
    const v = e.target.value;
    onChange(v === '' ? null : v);
  };

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="muted">Week:</span>
      <select value={value || ''} onChange={handle}>
        <option value="">All weeks</option>
        {options.map((w) => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>
    </label>
  );
}
