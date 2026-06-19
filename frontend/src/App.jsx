import React, { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function App() {
  const [status, setStatus] = useState('checking…');
  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => setStatus(d.ok ? 'API OK' : 'API responded but not ok'))
      .catch(() => setStatus('API unreachable'));
  }, []);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>FilingLens</h1>
      <p>Skeleton boot — backend status: <strong>{status}</strong></p>
    </div>
  );
}
