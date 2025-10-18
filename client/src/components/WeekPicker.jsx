// src/components/WeekPicker.jsx
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function WeekPicker({ options, maxWeeks = 20 }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get('week') ?? '';

  // Backward compatible: if no options passed, generate 1..maxWeeks
  const opts = useMemo(() => {
    if (Array.isArray(options) && options.length) return [
      { label: 'All weeks', value: '' },
      ...options,
    ];
    return [
      { label: 'All weeks', value: '' },
      ...Array.from({ length: maxWeeks }, (_, i) => ({
        label: `Week ${i + 1}`,
        value: String(i + 1),
      })),
    ];
  }, [options, maxWeeks]);

  const onChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(params);
    if (!val) next.delete('week'); else next.set('week', val);
    setParams(next, { replace: true });
  };

  return (
    <select value={selected} onChange={onChange}>
      {opts.map(o => (
        <option key={o.value || 'all'} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
