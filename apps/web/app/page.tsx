import { ActionLink, Shell } from "@/components/ui";

export default function Home() {
  return <Shell>
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">Ideas worth sharing</p><h1>Your idea.<br /><span className="accent">Ready to play.</span></h1><p className="lede">A clear story, thoughtful motion, and a voice that brings it together.</p>        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <ActionLink href="/sign-in">Sign in to studio <span aria-hidden="true">→</span></ActionLink>
          <ActionLink href="/foundation" variant="secondary">Explore UI specimens <span aria-hidden="true">↗</span></ActionLink>
        </div>
        <p className="development-note">Authentication and database connections are now active. Project workspace storage is scheduled in Feature F05.</p></div>
      <div className="story-stage" aria-label="Illustration of an idea becoming a story, motion graphics, and a video">
        <div className="stage-caption"><span>A story in the making</span><span className="accent">01 — 04</span></div>
        <div className="story-frame"><span className="frame-kicker">Start with a question</span><h2>What if<br />you could<br /><em>show it?</em></h2><div className="diagram" aria-hidden="true"><span /><i /><span /><i /><span /></div><p>Make the complex feel simple.</p></div>
        <ol className="workflow" aria-label="Planned creation workflow">{["Idea", "Storyboard", "Video", "Publish"].map((step, i) => <li key={step}><span>0{i + 1}</span>{step}</li>)}</ol>
      </div>
    </section>
  </Shell>;
}
