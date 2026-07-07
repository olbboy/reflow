import { useState } from 'react';
import { Basic } from './examples/Basic';
import { CustomNodes } from './examples/CustomNodes';
import { AutoLayout } from './examples/AutoLayout';
import { Routing } from './examples/Routing';
import { AgentOps } from './examples/AgentOps';
import { Collaboration } from './examples/Collaboration';

import basicSrc from './examples/Basic.tsx?raw';
import customSrc from './examples/CustomNodes.tsx?raw';
import layoutSrc from './examples/AutoLayout.tsx?raw';
import routingSrc from './examples/Routing.tsx?raw';
import agentSrc from './examples/AgentOps.tsx?raw';
import collabSrc from './examples/Collaboration.tsx?raw';

interface Example {
  id: string;
  title: string;
  blurb: string;
  Comp: () => React.JSX.Element;
  src: string;
}

const EXAMPLES: Example[] = [
  { id: 'basic', title: 'Basic flow', blurb: 'Nodes, edges, background, controls and a minimap — the whole app in ~20 lines.', Comp: Basic, src: basicSrc },
  { id: 'custom', title: 'Custom nodes', blurb: 'A node that edits its own data with useReflow(). No reducers, no change handlers.', Comp: CustomNodes, src: customSrc },
  { id: 'layout', title: 'Auto-layout', blurb: 'Five built-in layouts (layered / tree / force / radial / grid), zero dependencies.', Comp: AutoLayout, src: layoutSrc },
  { id: 'routing', title: 'Smart routing', blurb: 'Orthogonal edges route AROUND nodes and re-route live as you drag obstacles.', Comp: Routing, src: routingSrc },
  { id: 'agent', title: 'AI agent ops', blurb: 'Build a graph from a stream of validated JSON operations — the AI-native API.', Comp: AgentOps, src: agentSrc },
  { id: 'collab', title: 'Collaboration', blurb: 'Two live peers sharing edits and cursors through the transport-agnostic Collab API.', Comp: Collaboration, src: collabSrc },
];

export function App() {
  const [active, setActive] = useState(EXAMPLES[0].id);
  const [dark, setDark] = useState(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );
  const [showCode, setShowCode] = useState(true);
  const ex = EXAMPLES.find((e) => e.id === active)!;
  const Comp = ex.Comp;

  return (
    <div className={`site${dark ? ' site-dark' : ''}`} data-theme={dark ? 'dark' : 'light'}>
      <aside className="site-nav">
        <div className="site-brand">
          <span className="site-logo">◆</span> ReFlow
        </div>
        <div className="site-nav-sub">interactive examples</div>
        <nav>
          {EXAMPLES.map((e) => (
            <button key={e.id} className={e.id === active ? 'active' : ''} onClick={() => setActive(e.id)}>
              {e.title}
            </button>
          ))}
        </nav>
        <div className="site-nav-foot">
          <button onClick={() => setDark((d) => !d)}>{dark ? '☀️ light' : '🌙 dark'}</button>
          <a href="https://github.com/olbboy/reflow" target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </aside>
      <main className="site-main">
        <header className="site-head">
          <div>
            <h1>{ex.title}</h1>
            <p>{ex.blurb}</p>
          </div>
          <button className="site-code-toggle" onClick={() => setShowCode((s) => !s)}>
            {showCode ? 'Hide code' : 'Show code'}
          </button>
        </header>
        <div className={`site-body${showCode ? ' with-code' : ''}`}>
          <div className="site-canvas" key={ex.id}>
            <Comp />
          </div>
          {showCode ? (
            <pre className="site-code">
              <code>{ex.src.trim()}</code>
            </pre>
          ) : null}
        </div>
      </main>
    </div>
  );
}
