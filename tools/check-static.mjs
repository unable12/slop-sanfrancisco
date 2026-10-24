// Verify the artifact, not the working tree. Run after tools/build-static.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../dist');
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const assets = new Set(['index.html', 'css/style.css', 'LICENSE', 'NOTICE.md', '.nojekyll']);
// Social crawlers read the initial HTML without running the app. Their absolute
// image URL must resolve to an actual file in the Pages project artifact.
const meta = new Map([...html.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"\s*\/?>/g)].map(m => [m[1], m[2]]));
for (const key of ['og:title', 'og:type', 'og:url', 'og:description', 'og:image', 'og:image:alt']) {
  assert(meta.get(key), `missing social metadata: ${key}`);
}
assert.equal(meta.get('twitter:card'), 'summary_large_image');
assert.equal(meta.get('twitter:image'), meta.get('og:image'));
const site = new URL(meta.get('og:url'));
const socialImage = new URL(meta.get('og:image'));
assert.equal(socialImage.protocol, 'https:');
assert.equal(socialImage.origin, site.origin);
assert(socialImage.pathname.startsWith(site.pathname), 'social image must live below the Pages project URL');
const socialAsset = socialImage.pathname.slice(site.pathname.length);
assets.add(socialAsset);
const socialBytes = await fs.readFile(path.join(root, socialAsset));
assert(socialBytes.length < 5_000_000, 'social image must stay below 5 MB');
assert.equal(socialBytes.subarray(0, 3).toString('hex'), 'ffd8ff', 'social image must be a JPEG');
const window = {};
const document = {
  createElement: () => ({}),
  head: { appendChild: link => assets.add(link.href.split('?')[0]) }
};
vm.runInNewContext(html.match(/<script>([^]*?)<\/script>/)[1], { window, document });
assert(assets.size > 40, 'boot script must enumerate the runtime modules');

const geoWindow = { NYC: {} };
vm.runInNewContext(await fs.readFile(path.join(root, 'js/sf-geodata.js'), 'utf8'), { window: geoWindow });
for (const entry of Object.values(geoWindow.NYC.GEO.data)) {
  if (entry?.url) assets.add(entry.url);
}
assets.add('data/region/manifest.json');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/region/manifest.json'), 'utf8'));
function collect(value) {
  if (typeof value === 'string' && /\.bin$/.test(value)) assets.add(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(manifest);

for (const asset of assets) {
  assert(!asset.startsWith('/') && !asset.includes('..'), `asset must work below the project URL: ${asset}`);
  const file = path.resolve(root, asset);
  assert(file.startsWith(root + path.sep), `asset escapes dist: ${asset}`);
  const stat = await fs.stat(file);
  assert(stat.isFile() && (stat.size > 0 || asset === '.nojekyll'), `missing/empty asset: ${asset}`);
  if (asset.endsWith('.bin')) {
    const handle = await fs.open(file);
    try {
      const header = Buffer.alloc(8);
      await handle.read(header, 0, 8, 0);
      assert.equal(header.toString('ascii', 0, 4), 'SFB1', `binary magic: ${asset}`);
      assert(header.readUInt32LE(4) + 8 <= stat.size, `truncated header: ${asset}`);
    } finally { await handle.close(); }
  }
}
for (const excluded of ['.git', '.env', 'data/raw', 'tools', 'shots', 'docs', 'node_modules']) {
  assert.equal(await fs.access(path.join(root, excluded)).then(() => true, () => false), false, `excluded from site: ${excluded}`);
}
for (const notice of ['LICENSE', 'NOTICE.md']) {
  assert.equal(await fs.readFile(path.join(root, notice), 'utf8'), await fs.readFile(path.join(root, '..', notice), 'utf8'));
}
console.log(`Verified ${assets.size} packaged assets, relative project paths, binary headers and license notices.`);
