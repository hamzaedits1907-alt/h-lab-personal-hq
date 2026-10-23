/**
 * Post-build safety checks on the production bundle (npm run verify:build).
 * Fails the build if demo mode, test credentials or privileged keys leaked in.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'dist';
if (!existsSync(join(dir, 'index.html'))) {
  console.error(`verify-build: ${dir}/index.html not found. Run the build first.`);
  process.exit(1);
}

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dir);
const problems: string[] = [];
const isDemoBuild = dir.includes('demo');

for (const f of files.filter((x) => /\.(js|html|css|map)$/.test(x))) {
  const text = readFileSync(f, 'utf8');
  if (f.endsWith('.map')) problems.push(`${f}: source maps must not be published`);
  if (!isDemoBuild) {
    for (const needle of ['demo-password', 'demo@hlab.local', 'hlab-demo-data', 'VITE_DEMO_MODE']) {
      if (text.includes(needle)) problems.push(`${f}: contains demo-mode marker "${needle}"`);
    }
  }
  if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) problems.push(`${f}: contains what looks like a Supabase secret key`);
  if (text.includes('SUPABASE_SERVICE')) problems.push(`${f}: references SUPABASE_SERVICE*`);
  if (/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\./.test(text)) {
    const payload = /eyJ[A-Za-z0-9_-]{20,}\.(eyJ[A-Za-z0-9_-]{20,})\./.exec(text)?.[1] ?? '';
    const role = (() => {
      try {
        return (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { role?: string }).role;
      } catch {
        return undefined;
      }
    })();
    if (role && role !== 'anon') problems.push(`${f}: embeds a JWT with role "${role}"`);
  }
}

const js = files.filter((f) => f.endsWith('.js'));
const sizes = js.map((f) => ({ f: f.replaceAll('\\', '/'), kb: gzipSync(readFileSync(f)).length / 1024 }));
sizes.sort((a, b) => b.kb - a.kb);
console.log('gzipped JS chunks:');
for (const s of sizes) console.log(`  ${s.kb.toFixed(1).padStart(7)} kB  ${s.f}`);

if (problems.length) {
  console.error('\nverify-build FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`\nverify-build OK (${files.length} files checked in ${dir}/)`);
