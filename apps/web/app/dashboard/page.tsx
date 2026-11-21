import React from 'react';
import Link from 'next/link';
import { ProjectLibrary } from '../../components/projects';

export const metadata = {
  title: 'Dashboard · NamasteVideo.ai',
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <div style={{ padding: '40px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <span className="eyebrow">Private Workspace</span>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: '8px 0' }}>
            Creator Studio
          </h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            English educational motion-graphics explainers.
          </p>
        </div>

        <div>
          <form action="/api/session/sign-out" method="POST">
            <button type="submit" className="button button--secondary">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="panel" style={{ border: '1px solid var(--border)', borderRadius: 'var(--panel-radius)', padding: '32px', marginBottom: '32px' }}>
        <ProjectLibrary />
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <Link href="/foundation" className="button button--secondary" style={{ fontSize: '13px' }}>
          View Cinema UI Specimens
        </Link>
      </div>
    </div>
  );
}
