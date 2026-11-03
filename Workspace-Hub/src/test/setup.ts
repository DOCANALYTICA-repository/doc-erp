import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements no `window.matchMedia`, and two things in this app depend
 * on it at mount:
 *
 *  - Astryx `AppShell` calls `useMediaQuery` to decide between the sidebar and
 *    the mobile drawer, so every authenticated route throws without this.
 *  - The landing page's `shouldAnimateEntrances()` checks
 *    `prefers-reduced-motion`.
 *
 * Default to "query does not match", i.e. a desktop viewport with motion
 * allowed. Tests that care about the other branch override this per-case (see
 * `src/modules/landing/animation.test.ts`) rather than changing the default —
 * the default should be the configuration most users actually have.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

/**
 * `ResizeObserver` is how Astryx `OverflowList` measures the 15-tab strip to
 * decide what to collapse into the overflow menu. jsdom ships no
 * implementation, and the resulting ReferenceError is thrown during render, so
 * it takes out every tabbed route via the error boundary.
 *
 * A no-op observer is the right stub, not a measuring one: jsdom reports every
 * element as 0×0 anyway, so there is no layout to observe. Tests here assert
 * that a screen mounts, not how many tabs fit.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

/**
 * The faculty calendar renders through a canvas. jsdom has no 2D context and
 * logs a loud "Not implemented" for every call, which buries real failures in
 * the test output. Stub enough of the context for the component to mount
 * quietly — nothing here asserts on pixels.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement['getContext'];
}

/**
 * jsdom implements `<dialog>` as an element but not its methods: `showModal`,
 * `show` and `close` are simply absent, so anything built on Astryx `Dialog`
 * throws "dialog.showModal is not a function" the moment it opens.
 *
 * That covers three components here — `Drawer`, `NotificationTray` and
 * `ConfirmDialog` — so without this they could not be tested at all.
 *
 * The stub keeps `open` in step with the calls, because that is the property
 * tests assert on ("is the drawer showing?"). It does NOT emulate the top
 * layer, focus trapping or `::backdrop`; those were verified in a real browser
 * instead, which is the only place they mean anything.
 */
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.show) {
    HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }
}
