import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClientProvider} from '@tanstack/react-query';
// NO CSS IS IMPORTED HERE except index.css at the bottom, and that is
// deliberate on two counts.
//
// 1. Tailwind v4 only processes the CSS module graph rooted at the file
//    carrying `@import "tailwindcss"`. Importing `tailwind-theme.css` from JS
//    (as this file used to) handed its `@theme inline` directive to the
//    browser as plain CSS, where it means nothing, so not one token utility
//    was ever generated.
// 2. Cascade layer order is decided by first appearance in the bundle.
//    reset.css and astryx.css were imported here, above index.css, which put
//    `astryx-base` BEFORE Tailwind's `base` — so preflight's
//    `*{margin:0;padding:0;border:0}` flattened every Astryx component's box
//    model app-wide. index.css now declares the layer order explicitly and
//    @imports both. See the comment at the top of src/index.css.
//
// theme-neutral is deliberately not imported either: its rules are all scoped
// @scope([data-astryx-theme="neutral"]) while index.html sets
// data-astryx-theme="doc-portal", so not one of them ever matched. It
// contributed ~17.9 kB of dead CSS plus one `color-scheme: light dark`
// declaration that fought the light-mode fix in index.css.
import App from './App.tsx';
import {queryClient} from './lib/queryClient';
import {ToastViewport} from '@astryxdesign/core/Toast';
import {ErrorBoundary} from './components/ui/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="The application">
      <QueryClientProvider client={queryClient}>
        {/*
          * Toasts are this app's ONLY user-feedback mechanism — 65 showToast()
          * calls across 19 files, covering every write, every validation
          * failure and every server error.
          *
          * Until now no viewport was mounted anywhere. `useToast()` silently
          * self-mounted a fallback container and logged a warning, which meant
          * the position, z-index and stacking of that entire channel were
          * undesigned and depended on undocumented library behaviour.
          *
          * Mount exactly ONE. A second viewport double-renders every toast.
          */}
        <ToastViewport position="bottomEnd" maxVisible={3}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastViewport>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
