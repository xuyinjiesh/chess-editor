import { mkdir, readFile, writeFile, rename, rm, rmdir, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, validateRelease, galleryKey } from '../src/gallery-format.ts';
import { validateProject } from '../src/model.ts';
import { galleryCover } from '../src/gallery-cover.ts';

const EMPTY = { format: 'qijing-gallery', version: 1, entries: [] };
async function readJson(path, limit) {
  const content = await readFile(path);
  if (content.length > limit) throw new Error(`文件过大：${path}`);
  return JSON.parse(content.toString('utf8'));
}
async function readCatalog(root) {
  try { return validateCatalog(await readJson(join(root, 'index.json'), 8000000)); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(EMPTY); throw error; }
}
async function assertWithin(root, target) {
  const actual = await realpath(target);
  if (actual !== root && !actual.startsWith(root + sep)) throw new Error('作品路径不能位于广场目录之外。');
  return actual;
}
export async function addRelease(packageFile, galleryRoot = resolve('public/gallery')) {
  const release = validateRelease(await readJson(resolve(packageFile), 2000000));
  const projectText = JSON.stringify(release.project, null, 2) + '\n';
  if (Buffer.byteLength(projectText) > 500000) throw new Error('作品 JSON 不能超过 500 KB。');
  await mkdir(galleryRoot, { recursive: true });
  const root = await realpath(galleryRoot), catalog = await readCatalog(root), entry = release.entry;
  if (catalog.entries.some(e => galleryKey(e) === galleryKey(entry))) throw new Error('这个版本已经发布，请增加发布版本后重新导出。');
  const updated = validateCatalog({ ...catalog, entries: [...catalog.entries, entry] });
  const indexText = JSON.stringify(updated, null, 2) + '\n';
  if (Buffer.byteLength(indexText) > 8000000) throw new Error('作品清单超过 8 MB，请精简介绍内容。');
  const parent = join(root, entry.id);
  await mkdir(parent, { recursive: true }); await assertWithin(root, parent);
  const folder = join(parent, `v${entry.revision}`);
  // A release directory is immutable. Never overwrite an existing snapshot.
  await mkdir(folder);
  const temporaryIndex = join(root, `index-${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(join(folder, 'project.json'), projectText, { flag: 'wx' });
    // Regenerate the cover; never trust arbitrary SVG supplied in an import.
    await writeFile(join(folder, 'cover.svg'), galleryCover(release.project), { flag: 'wx' });
    await writeFile(temporaryIndex, indexText, { flag: 'wx' });
    await rename(temporaryIndex, join(root, 'index.json'));
  } catch (error) {
    await rm(temporaryIndex, { force: true });
    await rm(join(folder, 'project.json'), { force: true });
    await rm(join(folder, 'cover.svg'), { force: true });
    await rmdir(folder);
    throw error;
  }
  return entry;
}
export async function checkGallery(galleryRoot = resolve('public/gallery')) {
  const root = await realpath(galleryRoot);
  const catalog = validateCatalog(await readJson(join(root, 'index.json'), 8000000));
  for (const entry of catalog.entries) {
    const folder = await assertWithin(root, join(root, entry.id, `v${entry.revision}`));
    const path = await assertWithin(root, join(folder, 'project.json'));
    const project = validateProject(await readJson(path, 500000));
    if (project.name.trim() !== entry.title) throw new Error(`标题与作品不一致：${galleryKey(entry)}`);
    const cover = await assertWithin(root, join(folder, 'cover.svg'));
    if (await readFile(cover, 'utf8') !== galleryCover(project)) throw new Error(`封面与作品不一致：${galleryKey(entry)}，请重新生成发布包。`);
  }
  return catalog.entries.length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'add' && process.argv[3]) {
      const entry = await addRelease(process.argv[3]);
      console.log(`已加入 ${entry.title} v${entry.revision}（${galleryKey(entry)}）。提交 public/gallery 后推送，即可由部署工作流发布。`);
    } else if (process.argv[2] === 'check') console.log(`广场校验通过：${await checkGallery()} 个发布版本。`);
    else throw new Error('用法：npm run gallery:add -- "作品.qijing-release.json"，或 npm run gallery:check');
  } catch (error) { console.error(`广场操作失败：${error.message}`); process.exitCode = 1; }
}
