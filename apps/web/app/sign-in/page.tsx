'use client';

import { useState, useTransition, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Brand } from '@/components/ui';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams?.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your work email and password.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/session/sign-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: email.trim(), password }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          // Generic credential error per security & API requirements
          setErrorMessage(
            data?.error?.message || 'Invalid email or password. Verify credentials or contact an administrator.'
          );
          return;
        }

        // Successfully signed in; redirect to target
        router.push(redirectTarget);
        router.refresh();
      } catch {
        setErrorMessage('Unable to reach authentication service. Please check your connection.');
      }
    });
  }

  return (
    <div style={{ maxWidth: '440px', margin: '40px auto', padding: '0 16px' }}>
      <div className="panel" style={{ border: '1px solid var(--border)', borderRadius: 'var(--panel-radius)', padding: '36px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <Brand />
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px', borderRadius: '4px', background: 'var(--border)', color: 'var(--muted)', fontWeight: 600 }}>
            Internal V1
          </span>
        </div>

        <h1 style={{ fontSize: '24px', letterSpacing: '-0.03em', marginBottom: '8px', fontWeight: 700 }}>
          Sign in
        </h1>
        <p className="hint" style={{ marginTop: 0, marginBottom: '28px' }}>
          Authorized creator access for educational explainer production.
        </p>

        {errorMessage && (
          <div
            className="notice notice--error"
            role="alert"
            style={{ marginBottom: '20px', padding: '14px 16px', fontSize: '14px', borderRadius: '8px', lineHeight: 1.4 }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="email" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="author@example.com"
              disabled={isPending}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--radius)',
                border: '1px solid #727272',
                background: 'var(--canvas)',
                color: 'var(--text)',
                fontSize: '15px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label htmlFor="password" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--radius)',
                border: '1px solid #727272',
                background: 'var(--canvas)',
                color: 'var(--text)',
                fontSize: '15px',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="button button--primary"
            style={{ width: '100%', justifyContent: 'center', marginBottom: '20px' }}
          >
            {isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '12px' }}>
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            Access is restricted to pre-approved authors. Public registration and social sign-in are disabled.
          </p>

          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              Need help signing in?
            </button>

            {showHelp && (
              <div style={{ marginTop: '10px', padding: '12px', borderRadius: '6px', background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
                <strong>Operator-assisted recovery:</strong> Password reset or account admission is managed by your workspace operator. Contact your project lead to reset your credentials.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>Loading sign-in...</div>}>
      <SignInForm />
    </Suspense>
  );
}
