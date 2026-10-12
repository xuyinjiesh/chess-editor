import { validateProject, type Project } from './model.ts';

export type GalleryEntry = {
  id: string;
  revision: number;
  title: string;
  summary: string;
  author: string;
  tags: string[];
  publishedAt: string;
  instructions: string;
  credits?: string;
  sources?: { label: string; url: string }[];
};
export type GalleryCatalog = { format: 'qijing-gallery'; version: 1; entries: GalleryEntry[] };
export type GalleryRelease = { format: 'qijing-gallery-release'; version: 1; entry: GalleryEntry; project: Project; coverSvg: string };
export const validGalleryId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id);
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function text(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}需要${required ? '填写 ' : ''}不超过 ${max} 字的文本。`);
  return value.trim();
}
export function validateGalleryEntry(input: unknown): GalleryEntry {
  if (!object(input) || !validGalleryId(input.id)) throw new Error('作品标识需为 1–64 位小写字母、数字或中间的短横线。');
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 1 || Number(input.revision) > 1000000) throw new Error('发布版本需为 1–1,000,000 的整数。');
  if (typeof input.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.publishedAt) || !Number.isFinite(Date.parse(input.publishedAt)) || new Date(input.publishedAt).toISOString().slice(0, 10) !== input.publishedAt) throw new Error('发布日期需为有效的 YYYY-MM-DD 日期。');
  if (!Array.isArray(input.tags) || input.tags.length > 6) throw new Error('最多添加 6 个标签。');
  const credits = input.credits === undefined ? undefined : text(input.credits,'来源署名',2000);
  let sources: GalleryEntry['sources'];
  if (input.sources !== undefined) {
    if (!Array.isArray(input.sources) || input.sources.length > 6) throw new Error('最多提供 6 个来源链接。');
    sources = input.sources.map(source => {
      if (!object(source)) throw new Error('来源链接无效。');
      const url = text(source.url,'来源地址',2000), label = text(source.label,'来源名称',80);
      try { if (!['https:','http:'].includes(new URL(url).protocol)) throw new Error(); } catch { throw new Error('来源链接需使用 HTTP 或 HTTPS。'); }
      return {label,url};
    });
  }
  const tags = [...new Set(input.tags.map(t => text(t, '标签', 16)))];
  return { id: input.id, revision: Number(input.revision), title: text(input.title, '作品名称', 60), summary: text(input.summary, '简短介绍', 180, false), author: text(input.author, '作者', 40), tags, publishedAt: input.publishedAt, instructions: text(input.instructions, '玩法说明', 6000), ...(credits !== undefined ? {credits} : {}), ...(sources !== undefined ? {sources} : {}) };
}
export const galleryKey = (entry: Pick<GalleryEntry, 'id' | 'revision'>) => `${entry.id}/v${entry.revision}`;
export function validateCatalog(input: unknown): GalleryCatalog {
  if (!object(input) || input.format !== 'qijing-gallery' || input.version !== 1 || !Array.isArray(input.entries) || input.entries.length > 1000) throw new Error('作品清单格式无效，最多支持 1,000 个发布版本。');
  const entries = input.entries.map(validateGalleryEntry), seen = new Set<string>();
  for (const entry of entries) { const key = galleryKey(entry); if (seen.has(key)) throw new Error(`作品版本重复：${key}`); seen.add(key); }
  return { format: 'qijing-gallery', version: 1, entries };
}
export function validateRelease(input: unknown): Omit<GalleryRelease, 'coverSvg'> {
  if (!object(input) || input.format !== 'qijing-gallery-release' || input.version !== 1) throw new Error('请使用编辑器导出的 .qijing-release.json 发布包。');
  const entry = validateGalleryEntry(input.entry), project = validateProject(input.project);
  if (entry.title !== project.name.trim()) throw new Error('发布标题与作品名称不一致，请重新导出。');
  return { format: 'qijing-gallery-release', version: 1, entry, project };
}
export function latestEntries(entries: GalleryEntry[]): GalleryEntry[] {
  const latest = new Map<string, GalleryEntry>();
  for (const entry of entries) if (!latest.has(entry.id) || latest.get(entry.id)!.revision < entry.revision) latest.set(entry.id, entry);
  return [...latest.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title));
}
export function filterEntries(entries: GalleryEntry[], query: string, tag: string): GalleryEntry[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return latestEntries(entries).filter(e => (!tag || e.tags.includes(tag)) && words.every(word => [e.title, e.summary, e.author, ...e.tags].join(' ').toLocaleLowerCase().includes(word)));
}

export type GalleryRoute = { page: 'editor' } | { page: 'gallery'; id?: string; revision?: number; invalid?: boolean };
export function parseGalleryHash(hash: string): GalleryRoute {
  if (!hash.startsWith('#/gallery')) return { page: 'editor' };
  if (hash === '#/gallery' || hash === '#/gallery/') return { page: 'gallery' };
  const match = /^#\/gallery\/([a-z0-9-]+)(?:\/v([1-9][0-9]{0,6}))?$/.exec(hash);
  if (!match || !validGalleryId(match[1]) || (match[2] && Number(match[2]) > 1000000)) return { page: 'gallery', invalid: true };
  return { page: 'gallery', id: match[1], ...(match[2] ? { revision: Number(match[2]) } : {}) };
}
export const galleryHash = (entry?: Pick<GalleryEntry, 'id' | 'revision'>) => entry ? `#/gallery/${galleryKey(entry)}` : '#/gallery';
export function galleryShareUrl(pageUrl: string, entry: GalleryEntry): string {
  const url = new URL(pageUrl); url.search = ''; url.hash = galleryHash(entry); return url.href;
}
export function galleryAsset(base: string, entry?: Pick<GalleryEntry, 'id' | 'revision'>, asset: 'project.json' | 'cover.svg' = 'project.json'): string {
  return `${base.replace(/\/?$/, '/')}gallery/${entry ? `${galleryKey(entry)}/${asset}` : 'index.json'}`;
}
