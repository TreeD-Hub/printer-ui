import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

describe('touch kiosk contract', () => {
  test('locks browser scaling and viewport zoom for the printer screen', () => {
    const indexHtml = readFileSync('index.html', 'utf8');
    const appCss = readFileSync('src/App.css', 'utf8');

    expect(indexHtml).toContain(
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    );
    expect(appCss).toContain('width: min(var(--screen-width), 100vw);');
    expect(appCss).toContain('height: min(var(--screen-height), 100vh);');
    expect(appCss).toContain('overscroll-behavior: none;');
  });

  test('hides mouse cursor and disables mouse-only hover styling in kiosk mode', () => {
    const appCss = readFileSync('src/App.css', 'utf8');

    expect(appCss).toContain('cursor: none !important;');
    expect(appCss).not.toContain(':hover');
  });
});
