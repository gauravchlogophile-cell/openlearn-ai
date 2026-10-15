#!/usr/bin/env node
/**
 * Contrast for Sky's colours, in every theme the site offers.
 *
 * Sky is a bright character, and bright characters are where contrast usually
 * goes wrong: a pale-green bubble that reads in light mode becomes a smear in
 * dark mode, and a green that passes on white fails on the tint behind it. The
 * site has four looks (light, dark, and each with high contrast on), so this
 * parses tokens.css, rebuilds each look the way the cascade does, and measures
 * every pair Sky actually draws.
 *
 * Thresholds are WCAG 2.2: 4.5:1 for text, 3:1 for the outlines and shapes that
 * identify a control. A pair that fails here fails for a real reader.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/* selector -> { token: value }. Keeps the LAST occurrence of a selector with the
   same text, which for a media-query copy of a block is the same set. */
function blocks(text) {
  const out = {};
  const re = /([^{}@]+?)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    const decls = Object.fromEntries([...m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]));
    if (Object.keys(decls).length) out[sel] = { ...(out[sel] ?? {}), ...decls };
  }
  return out;
}
const B = blocks(css);
const get = (sel) => B[sel] ?? {};

const looks = {
  light: { ...get(':root') },
  dark: { ...get(':root'), ...get('[data-theme="dark"]') },
  'light, high contrast': { ...get(':root'), ...get(':root[data-contrast="high"]') },
  'dark, high contrast': { ...get(':root'), ...get('[data-theme="dark"]'), ...get(':root[data-contrast="high"]'), ...get(':root[data-theme="dark"][data-contrast="high"]') },
};

const lum = (hex) => {
  const n = hex.replace('#', '');
  const v = (n.length === 3 ? n.split('').map((c) => c + c).join('') : n).match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* [foreground, background, minimum, what Sky draws with it] */
const PAIRS = [
  ['--c-ink', '--c-surface', 4.5, 'body text in the panel'],
  ['--c-ink', '--c-sky-tint', 4.5, "Sky's speech bubble and header"],
  ['--c-ink-soft', '--c-surface', 4.5, 'secondary text in the panel'],
  ['--c-ink-soft', '--c-sky-tint', 4.5, 'secondary text on the tint'],
  ['--c-sky-ink', '--c-sky', 4.5, 'the main button'],
  ['--c-sky', '--c-surface', 3, "the launcher's outline and the toggles"],
  ['--c-sky', '--c-bg', 3, "the launcher's outline on the page"],
  ['--c-sky-line', '--c-surface', 1.2, 'the panel border is decoration; the controls inside carry their own'],
  ['--c-primary', '--c-surface', 4.5, 'links inside the panel'],
];

let failed = 0, passed = 0;
for (const [look, t] of Object.entries(looks)) {
  for (const [fg, bg, min, what] of PAIRS) {
    if (!t[fg] || !t[bg]) { failed++; console.error(`FAIL ${look}: ${fg} or ${bg} is not defined`); continue; }
    const r = ratio(t[fg], t[bg]);
    if (r >= min) passed++;
    else { failed++; console.error(`FAIL ${look}: ${what}: ${fg} ${t[fg]} on ${bg} ${t[bg]} is ${r.toFixed(2)}:1, needs ${min}:1`); }
  }
}

/* Sky's own stylesheet must not use the faint ink for text: it measures under
   4.5:1 on the paper in light mode, which is fine for a metadata label somewhere
   else and not for a sentence Sky says. */
const sky = readFileSync(join(ROOT, 'src/styles/sky.css'), 'utf8');
const comp = readFileSync(join(ROOT, 'src/components/SkyBuddy.tsx'), 'utf8');
const faintText = [...sky.matchAll(/color:\s*var\(--c-ink-faint\)/g)].length + [...comp.matchAll(/color:\s*'var\(--c-ink-faint\)'/g)].length;
if (faintText === 0) passed++; else { failed++; console.error(`FAIL Sky uses --c-ink-faint for text ${faintText} time(s); use --c-ink-soft`); }

if (failed) { console.error(`${failed} contrast check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`sky-contrast: ${passed} checks passed across ${Object.keys(looks).length} looks`);
