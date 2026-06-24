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

  test('hides mouse cursor only outside mock mode and disables mouse-only hover styling', () => {
    const indexHtml = readFileSync('index.html', 'utf8');
    const indexCss = readFileSync('src/index.css', 'utf8');
    const appCss = readFileSync('src/App.css', 'utf8');

    expect(indexHtml).toContain('data-runtime-mode="%MODE%"');
    expect(indexCss).toContain("html:not([data-runtime-mode='mock'])");
    expect(indexCss).toContain('cursor: none !important;');
    expect(appCss).not.toContain(':hover');
  });
});
