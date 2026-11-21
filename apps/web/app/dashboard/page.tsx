import Link from 'next/link';

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '4px' }}>My Videos</h2>
            <p className="hint" style={{ margin: 0 }}>Your isolated projects and storyboard versions.</p>
          </div>
          <button className="button button--primary" disabled title="Project creation enabled in Feature F05">
            + New video
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', background: 'var(--canvas)' }}>
          <p style={{ color: 'var(--muted)', fontSize: '15px', marginBottom: '16px' }}>
            No videos in your workspace yet.
          </p>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Project creation and library storage will be activated in Feature F05 & F06.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <Link href="/foundation" className="button button--secondary" style={{ fontSize: '13px' }}>
          View Cinema UI Specimens
        </Link>
      </div>
    </div>
  );
}
