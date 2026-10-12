import { galleryAsset, validateCatalog, type GalleryEntry } from './gallery-format';
import { validateProject } from './model';

export const GALLERY_BASE = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
async function readJson(url: string, signal: AbortSignal, maxBytes: number): Promise<unknown> {
  const response = await fetch(url, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(response.status === 404 ? '作品文件尚未发布，或该版本已被移除。' : `作品加载失败（${response.status}），请稍后重试。`);
  if (Number(response.headers.get('Content-Length')) > maxBytes) throw new Error('作品文件过大。');
  const content = await response.text();
  if (new TextEncoder().encode(content).length > maxBytes) throw new Error('作品文件过大。');
  try { return JSON.parse(content); } catch { throw new Error('作品文件格式不正确，请检查发布内容。'); }
}
export async function loadGallery(signal: AbortSignal) { return validateCatalog(await readJson(galleryAsset(GALLERY_BASE), signal, 8000000)); }
export async function loadGalleryProject(entry: GalleryEntry, signal: AbortSignal) {
  const project = validateProject(await readJson(galleryAsset(GALLERY_BASE, entry), signal, 500000));
  if (project.name.trim() !== entry.title) throw new Error('作品文件与清单不一致，请重新发布。');
  return project;
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
