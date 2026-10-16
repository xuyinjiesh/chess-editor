import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './templates';
import { galleryCover } from './gallery-cover';
import { filterEntries, galleryAsset, galleryHash, galleryShareUrl, latestEntries, parseGalleryHash, validateCatalog, validateGalleryEntry, validateRelease, validGalleryId, type GalleryEntry } from './gallery-format';

const entry: GalleryEntry = { id: 'test-chess', revision: 1, title: TEMPLATES[0].name, summary: '两军对弈', author: '棋友', tags: ['策略'], publishedAt: '2026-10-12', instructions: '轮流走子。' };
const catalog = (entries: GalleryEntry[]) => ({ format: 'qijing-gallery', version: 1, entries });
describe('static gallery snapshots', () => {
  it('validates release content without running custom rules or trusting supplied covers', () => {
    const project = structuredClone(TEMPLATES[4]);
    project.rules.code = 'throw new Error("must never execute during publishing")';
    const result = validateRelease({ format: 'qijing-gallery-release', version: 1, entry: { ...entry, title: project.name }, project, coverSvg: '<svg onload="alert(1)"/>' });
    expect(result.project.rules.code).toBe(project.rules.code);
    expect(result).not.toHaveProperty('coverSvg');
    expect(() => galleryCover(result.project)).not.toThrow();
  });
  it('rejects invalid paths, metadata, duplicate revisions and mismatched designs', () => {
    for (const id of ['../secret', '/root', 'a/b', 'a\\b', 'Test', '', '-abc', 'abc-', 'x'.repeat(65)]) expect(validGalleryId(id)).toBe(false);
    for (const fields of [{ revision: 0 }, { revision: 1.5 }, { publishedAt: '2026-02-30' }, { author: ' ' }, { instructions: '' }, { tags: Array(7).fill('标签') }]) expect(() => validateGalleryEntry({ ...entry, ...fields })).toThrow();
    expect(() => validateCatalog(catalog([entry, entry]))).toThrow('重复');
    expect(() => validateRelease({ format: 'qijing-gallery-release', version: 1, entry, project: TEMPLATES[1] })).toThrow('不一致');
    expect(() => validateRelease({ ...TEMPLATES[0] })).toThrow('发布包');
    expect(validateCatalog(catalog([])).entries).toEqual([]);
  });
  it('keeps old revisions but lists only the latest and searches author, tags and title', () => {
    const entries = [entry, { ...entry, revision: 2, title: '新版棋局', tags: ['轻量'] }, { ...entry, id: 'another', title: 'Another', author: 'Alice', tags: ['策略'] }];
    expect(validateCatalog(catalog(entries)).entries).toHaveLength(3);
    expect(latestEntries(entries)).toHaveLength(2);
    expect(filterEntries(entries, '新版 棋友', '轻量').map(e => e.revision)).toEqual([2]);
    expect(filterEntries(entries, 'ALICE', '策略').map(e => e.id)).toEqual(['another']);
    expect(filterEntries(entries, entry.title, '')).toHaveLength(0);
    expect(filterEntries(entries, '', '不存在')).toEqual([]);
  });
  it('preserves repository subpaths and pins share links without room credentials', () => {
    expect(galleryAsset('/chess-studio/')).toBe('/chess-studio/gallery/index.json');
    expect(galleryAsset('/chess-studio/', entry)).toBe('/chess-studio/gallery/test-chess/v1/project.json');
    expect(galleryAsset('/', entry, 'cover.svg')).toBe('/gallery/test-chess/v1/cover.svg');
    expect(galleryShareUrl('https://example.com/chess-studio/?room=ABC&server=wss://private/#/gallery', entry)).toBe('https://example.com/chess-studio/#/gallery/test-chess/v1');
    expect(parseGalleryHash(galleryHash(entry))).toEqual({ page: 'gallery', id: 'test-chess', revision: 1 });
    expect(parseGalleryHash('#/gallery/test-chess')).toEqual({ page: 'gallery', id: 'test-chess', revision: undefined });
    expect(parseGalleryHash('')).toEqual({ page: 'editor' });
    for (const hash of ['#/gallery/../secret', '#/gallery/test/v0', '#/gallery/test/v1/other', '#/gallery/%2f']) expect(parseGalleryHash(hash)).toEqual({ page: 'gallery', invalid: true });
  });
  it('escapes SVG labels and uses a deterministic cover for each design', () => {
    const project = structuredClone(TEMPLATES[4]);
    project.name = '<script>alert("x")</script>';
    project.pieceTypes[0].symbol = '<&"\'';
    const svg = galleryCover(project);
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&lt;&amp;&quot;&apos;');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('href=');
    expect(galleryCover(structuredClone(project))).toBe(svg);
  });
});
