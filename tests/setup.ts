import '@testing-library/jest-dom/vitest';

// jsdom does not implement matchMedia; shim for any shadcn primitive that
// probes it (e.g., Sidebar, Dialog, DropdownMenu — all of which the Phase 3
// Admin UI surface installs).
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
