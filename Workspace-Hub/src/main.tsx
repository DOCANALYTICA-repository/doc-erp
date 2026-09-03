import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
// Design token cleanup (Phase 1C): these two were installed dependencies
// that were never actually imported, leaving `bg-surface`/`text-primary`
// style Tailwind utilities unavailable and the neutral theme inactive —
// the app rendered on astryx.css's raw defaults only.
import "@astryxdesign/core/tailwind-theme.css";
import "@astryxdesign/theme-neutral/theme.css";
// DOC Portal brand theme (Grey + Sky Blue + White, light-only) — extends
// theme-neutral with ~10 token overrides. Built via `npx astryx theme build
// ./src/theme/docPortalTheme.ts`; re-run that command after editing the
// source file. Imported after theme-neutral so its @scope([data-astryx-theme
// ="doc-portal"]) rules win (index.html sets data-astryx-theme="doc-portal").
import "./theme/doc-portal.css";
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
