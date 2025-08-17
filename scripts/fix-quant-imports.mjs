// scripts/fix-quant-imports.mjs
// Find/replace any directory import of "quant" to explicit ".../quant/index.js".
// Safe: skips if already ends with "/index.js".

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXCLUDE = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out']);

const exts = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);

async function walk(dir) {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    if (EXCLUDE.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p);
    } else if (exts.has(path.extname(e.name))) {
      await fixFile(p);
    }
  }
}

function rewriteImports(src) {
  // Generic import specifier matcher: import ... from '...';
  return src.replace(
    /(\bfrom\s+['"])([^'"]+)(['"];?)/g,
    (m, pre, spec, post) => {
      // If spec already ends with /index.js, leave it.
      if (spec.endsWith('/index.js')) return m;

      // We want to catch any ".../quant" (including "lib/quant", "../quant", "./lib/quant", etc.)
      // but NOT things that don't end exactly in "/quant".
      if (/(^|\/)quant$/.test(spec)) {
        return `${pre}${spec}/index.js${post}`;
      }

      // Also catch any ".../lib/quant"
      if (/(^|\/)lib\/quant$/.test(spec)) {
        return `${pre}${spec}/index.js${post}`;
      }

      return m;
    }
  );
}

async function fixFile(file) {
  const orig = await fs.readFile(file, 'utf8');
  const next = rewriteImports(orig);
  if (next !== orig) {
    await fs.writeFile(file, next, 'utf8');
    console.log('updated:', path.relative(ROOT, file));
  }
}

(async () => {
  await walk(ROOT);
  console.log('Done.');
})();