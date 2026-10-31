// Назначение: включить updater того же commit в live UI archive.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = process.argv[2];
if (!output) throw new Error('usage: node scripts/add-ui-updater.mjs output-directory');
const source = join(dirname(fileURLToPath(import.meta.url)), 'treed_ui_updater.py');
const entrypoint = '.treed-update/updater.py';
const manifestPath = join(output, 'treed-shell-ui-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.name !== 'treed-shell-ui' || manifest.mode !== 'live') {
  throw new Error('Updater requires the live TreeD UI manifest');
}
mkdirSync(join(output, '.treed-update'), { recursive: true });
copyFileSync(source, join(output, entrypoint));
manifest.updater = {
  protocol: 1,
  entrypoint,
  sha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
