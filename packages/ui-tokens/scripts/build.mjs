import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync(new URL('../src/tokens.json', import.meta.url), 'utf8'));

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// D22: every *Text token must meet WCAG AA on all three surfaces.
const failures = [];
for (const mode of ['light', 'dark']) {
  const palette = tokens.color[mode];
  for (const key of Object.keys(palette).filter((k) => k.endsWith('Text'))) {
    for (const ground of ['surface', 'background', 'surfaceMuted']) {
      const ratio = contrast(palette[key], palette[ground]);
      if (ratio < 4.5) failures.push(`${mode}.${key} on ${ground}: ${ratio.toFixed(2)}`);
    }
  }
}
if (failures.length) {
  console.error(`Contrast below 4.5:1\n${failures.join('\n')}`);
  process.exit(1);
}

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const vars = (palette) =>
  Object.entries(palette)
    .map(([k, v]) => `  --color-${kebab(k)}: ${v};`)
    .join('\n');

const css = `/* Generated from tokens.json. Do not edit. */
@theme {
${vars(tokens.color.light)}
  --font-sans: ${tokens.font.sans};
  --font-brand: ${tokens.font.brand};
  --radius-sm: ${tokens.radius.sm}px;
  --radius-md: ${tokens.radius.md}px;
  --radius-lg: ${tokens.radius.lg}px;
  --radius-xl: ${tokens.radius.xl}px;
  --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08);
  --shadow-overlay: 0 10px 30px rgba(15, 23, 42, 0.18);
}

.dark {
${vars(tokens.color.dark)}
}
`;

if (!process.argv.includes('--check')) {
  mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../dist/tokens.css', import.meta.url), css);
}
console.log('tokens ok');
