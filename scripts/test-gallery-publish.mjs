import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, unlink, rmdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { addRelease, checkGallery } from './gallery.mjs';
import { TEMPLATES } from '../src/templates.ts';

// Remove only files explicitly created in this fresh test directory.
async function clean(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await clean(path); else await unlink(path);
  }
  await rmdir(dir);
}
test('publishing preserves revisions, validates files and never executes imported code', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'qijing-gallery-test-'));
  t.after(async () => {
    const actual = await realpath(dir), parent = await realpath(tmpdir());
    assert.equal(dirname(actual), parent); assert.ok(basename(actual).startsWith('qijing-gallery-test-'));
    await clean(actual);
  });
  const root = join(dir, 'gallery'), file = join(dir, 'release.json'), project = structuredClone(TEMPLATES[4]);
  project.rules.code = 'throw new Error("never execute at import")';
  const release = { format: 'qijing-gallery-release', version: 1, entry: { id: 'own-work', revision: 1, title: project.name, summary: '', author: '作者', tags: [], instructions: '相邻移动。', publishedAt: '2026-10-12' }, project, coverSvg: '<svg onload="bad()"/>' };
  await writeFile(file, JSON.stringify(release));
  await addRelease(file, root);
  assert.equal(await checkGallery(root), 1);
  const original = await readFile(join(root, 'own-work/v1/project.json'), 'utf8');
  const cover = await readFile(join(root, 'own-work/v1/cover.svg'), 'utf8');
  assert.ok(!cover.includes('onload'));
  assert.equal(JSON.parse(original).rules.code, project.rules.code);
  await assert.rejects(addRelease(file, root), /已经发布/);
  release.entry.revision = 2;
  release.project.description = '第二版';
  await writeFile(file, JSON.stringify(release)); await addRelease(file, root);
  assert.equal(await checkGallery(root), 2);
  assert.equal(await readFile(join(root, 'own-work/v1/project.json'), 'utf8'), original);
  assert.equal(JSON.parse(await readFile(join(root, 'index.json'), 'utf8')).entries.length, 2);
  release.entry.id = '../escape'; await writeFile(file, JSON.stringify(release));
  await assert.rejects(addRelease(file, root), /作品标识/);
  assert.equal(await checkGallery(root), 2);
  await writeFile(join(root, 'own-work/v2/cover.svg'), '<svg/>');
  await assert.rejects(checkGallery(root), /封面与作品不一致/);
  await writeFile(join(root, 'own-work/v2/cover.svg'), cover);
  await unlink(join(root, 'own-work/v2/project.json'));
  await assert.rejects(checkGallery(root), /ENOENT/);
});
