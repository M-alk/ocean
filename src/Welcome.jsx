// First-run guide: what Ocean is, where your notes live, and the study loop.
import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';

const desktop = typeof window !== 'undefined' ? window.oceanDesktop : null;

export default function Welcome({ info, onClose, onOpen }) {
  const [step, setStep] = useState(0);
  const [vault, setVault] = useState(info?.vault || '');
  useEffect(() => {
    desktop?.info().then((d) => setVault(d.vault));
  }, []);

  const steps = [
    {
      hero: true,
      title: 'Welcome to Ocean',
      lead: 'The calm way to study: your lecture slides, your notes and your AI, in one place.',
      body: (
        <ul className="wl-points">
          <li><Icon name="slides" /> Slides beside your notes, following what you read</li>
          <li><Icon name="bolt" /> Any AI can write and edit your notes as plain files</li>
          <li><Icon name="help" /> Quizzes after every section, plus a study streak</li>
        </ul>
      ),
      foot: 'Free and open source. Your notes stay on your computer.',
    },
    {
      title: 'Your notes are files you own',
      lead: 'Every page is a Markdown file in one folder, like Obsidian. Pages inside pages are folders.',
      body: (
        <div className="wl-folder">
          <Icon name="folder" />
          <code title={vault}>{vault || 'Your notes folder'}</code>
          {desktop && (
            <div className="wl-folder-actions">
              <button onClick={() => desktop.chooseFolder()}>Choose another folder…</button>
              <button onClick={() => desktop.revealFolder()}>Show in Finder</button>
            </div>
          )}
        </div>
      ),
      foot: desktop ? 'Already use Obsidian? Choose that folder; Ocean opens it as it is.' : 'Run Ocean with VAULT=/path/to/folder to use another folder.',
    },
    {
      title: 'Bring your lectures in',
      lead: 'Drop a lecture PDF or PowerPoint onto any page.',
      body: (
        <ol className="wl-steps">
          <li>Each slide becomes an image, and its text is saved for your AI to read.</li>
          <li><b>Slides</b> shows them beside your notes; double-click a slide for full size.</li>
          <li>Coming from Notion? Export as HTML, then run <code>npm run import:notion -- export.zip</code>.</li>
        </ol>
      ),
    },
    {
      title: 'Let your AI do the writing',
      lead: 'Ocean has no built-in AI on purpose: use the one you like, and it edits your files directly.',
      body: (
        <ol className="wl-steps">
          <li>On a page, open <b>•••</b> → <b>Use with AI</b> and copy a prompt.</li>
          <li>Paste it into Claude, ChatGPT, Codex or Cursor.</li>
          <li>Watch the page fill in live. The rules your AI follows are in <code>CLAUDE.md</code>.</li>
        </ol>
      ),
    },
    {
      title: 'Study, then check yourself',
      lead: 'The habits that make notes stick.',
      body: (
        <ul className="wl-points">
          <li><Icon name="help" /> Quizzes after each section: fold them away, or hide them all</li>
          <li><Icon name="graph" /> <b>Home</b> shows your study heatmap and streak; <b>Graph</b> shows how pages connect</li>
          <li><Icon name="search" /> <kbd>⌘K</kbd> searches everything; type <kbd>/</kbd> for blocks</li>
        </ul>
      ),
    },
  ];
  const s = steps[step];
  const last = step === steps.length - 1;
  const finish = () => {
    desktop?.markWelcomed();
    onClose();
    onOpen?.('Welcome to Ocean.md');
  };

  return (
    <div className="wl-backdrop">
      <div className="wl-card" role="dialog" aria-label="Welcome to Ocean">
        <button className="wl-skip" onClick={() => { desktop?.markWelcomed(); onClose(); }}>Skip</button>
        {s.hero && <img className="wl-logo" src="/ocean.png" alt="" />}
        <h1>{s.title}</h1>
        <p className="wl-lead">{s.lead}</p>
        <div className="wl-body">{s.body}</div>
        {s.foot && <p className="wl-foot">{s.foot}</p>}
        <div className="wl-nav">
          <div className="wl-dots">{steps.map((_, i) => <button key={i} className={i === step ? 'on' : ''} onClick={() => setStep(i)} aria-label={`Step ${i + 1}`} />)}</div>
          {step > 0 && <button className="wl-back" onClick={() => setStep(step - 1)}>Back</button>}
          <button className="primary" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? 'Start studying' : step === 0 ? 'Get started' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
