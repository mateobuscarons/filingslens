import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setErrorMsg('No token in link.'); setStatus('error'); return; }
    apiFetch(`/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (data) => {
        await login(data.token, data.user);
        navigate('/', { replace: true });
      })
      .catch((err) => {
        setErrorMsg(err?.message || 'Link is invalid or already used. Try registering again.');
        setStatus('error');
      });
  }, []);

  return (
    <section className="screen">
      <div className="login-grid">
        <div>
          <p className="eyebrow">{status === 'verifying' ? 'Just a moment' : 'Something went wrong'}</p>
          <h2>{status === 'verifying' ? 'Verifying your email…' : 'Verification failed.'}</h2>
        </div>
        <div className="login-card">
          <div className="brand">FilingLens</div>
          {status === 'verifying' && (
            <p style={{ marginTop: 24, fontSize: 14, color: 'var(--muted)' }}>Verifying your link…</p>
          )}
          {status === 'error' && (
            <>
              <p style={{ marginTop: 24, fontSize: 14, color: 'var(--red)' }}>{errorMsg}</p>
              <button className="button" style={{ marginTop: 20 }} onClick={() => navigate('/')}>
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
