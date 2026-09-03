import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClientProvider} from '@tanstack/react-query';
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
// Design token cleanup (Phase 1C): these two were installed dependencies
// that were never actually imported, leaving `bg-surface`/`text-primary`
// style Tailwind utilities unavailable and the neutral theme inactive —
// the app rendered on astryx.css's raw defaults only.
import "@astryxdesign/core/tailwind-theme.css";
// theme-neutral is deliberately NOT imported. Its rules are all scoped
// @scope([data-astryx-theme="neutral"]) while index.html sets
// data-astryx-theme="doc-portal", so not one of them ever matched. It
// contributed ~17.9 kB of dead CSS plus one `color-scheme: light dark`
// declaration that fought the light-mode fix in index.css.
//
// DOC Portal brand theme (Grey + Sky Blue + White, light-only). Built via
// `npx astryx theme build ./src/theme/docPortalTheme.ts`; re-run that command
// after editing the source file.
import "./theme/doc-portal.css";
import App from './App.tsx';
import {queryClient} from './lib/queryClient';
import {ErrorBoundary} from './components/ui/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="The application">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
