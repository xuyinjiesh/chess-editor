import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, Copy, Download, Grid2X2, LoaderCircle, Monitor, Play, RefreshCw, Search, Share2 } from 'lucide-react';
import { Board } from './Board';
import { BotSetup, type BotOptions } from './BotControls';
import { GalleryPlayer } from './GalleryPlayer';
import { initialState } from './engine';
import type { GameState, Project } from './model';
import { ENGINE_NAMES } from './templates';
import { filterEntries, galleryAsset, galleryHash, galleryShareUrl, latestEntries, type GalleryCatalog, type GalleryEntry, type GalleryRoute } from './gallery-format';
import { downloadJson, GALLERY_BASE, loadGallery, loadGalleryProject } from './gallery-client';

export function GalleryPage({ route, onCopy, onPublish }: { route: Extract<GalleryRoute, { page: 'gallery' }>; onCopy: (project: Project) => void; onPublish: () => void }) {
  const [catalog, setCatalog] = useState<GalleryCatalog | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(''), [tag, setTag] = useState('');
  const main = useRef<HTMLElement>(null);
  useLayoutEffect(() => { main.current?.scrollTo(0, 0); window.scrollTo(0, 0); }, [route.id, route.revision]);
  useEffect(() => {
    const controller = new AbortController(); setCatalog(null); setError('');
    loadGallery(controller.signal).then(value => { if (!controller.signal.aborted) setCatalog(value); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [retry]);
  const entries = catalog?.entries || [], latest = useMemo(() => latestEntries(entries), [catalog]);
  const tags = [...new Set(latest.flatMap(e => e.tags))].sort();
  const filtered = filterEntries(entries, query, tag);
  const selected = route.id ? entries.find(e => e.id === route.id && e.revision === (route.revision || latest.find(e => e.id === route.id)?.revision)) : undefined;
  return <main ref={main} className="gallery-page" aria-label="作品广场">
    {error ? <div className="gallery-empty" role="alert"><BookOpen size={32}/><h2>暂时无法打开广场</h2><p>{error}</p><button className="button" onClick={() => setRetry(n => n + 1)}><RefreshCw size={15}/>重新加载</button></div>
      : !catalog ? <div className="gallery-empty" role="status"><LoaderCircle className="spin" size={28}/><p>正在打开作品广场…</p></div>
      : route.invalid || (route.id && !selected) ? <div className="gallery-empty"><BookOpen size={32}/><h2>没有找到这个作品版本</h2><p>链接可能有误，或该版本已经下架。</p><a className="button" href={galleryHash()}>返回作品广场</a></div>
      : selected ? <GalleryDetail key={`${selected.id}-${selected.revision}`} entry={selected} versions={entries.filter(e => e.id === selected.id).sort((a, b) => b.revision - a.revision)} onCopy={onCopy}/>
      : <>
        <div className="gallery-hero"><div><span className="gallery-eyebrow">CHESS STUDIO · COLLECTION</span><h1>每一种规则，<br/>都是新的可能。</h1><p>发现值得一玩的棋局，和电脑过招，或从这里开始你的下一次创作。</p></div><div className="gallery-hero-side"><span className="gallery-hero-mark" aria-hidden="true">♞</span><span>{latest.length.toString().padStart(2, '0')} 款棋类 · 开放试玩</span></div></div>
        <div className="gallery-toolbar"><label className="gallery-search"><Search size={18}/><input aria-label="搜索作品" type="search" placeholder="搜索名称、作者或标签" value={query} onChange={e => setQuery(e.target.value)}/></label><label className="gallery-filter">分类<select aria-label="筛选作品分类" value={tag} onChange={e => setTag(e.target.value)}><option value="">全部作品</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</select></label><button className="button gallery-publish" onClick={onPublish}><ArrowUpRight size={16}/>准备发布</button></div>
        <div className="gallery-results"><h2>{tag || '全部作品'}</h2><span>{filtered.length} 款作品</span></div>
        {filtered.length ? <div className="gallery-grid">{filtered.map(entry => <article className="gallery-card" key={entry.id}>
          <a className="gallery-card-cover" href={galleryHash(entry)} aria-label={`查看${entry.title}`}><img src={galleryAsset(GALLERY_BASE, entry, 'cover.svg')} alt={`${entry.title}初始棋盘`} loading="lazy"/><span>v{entry.revision}</span></a>
          <div className="gallery-card-content"><div className="gallery-tags">{entry.tags.map(t => <span key={t}>{t}</span>)}</div><h3><a href={galleryHash(entry)}>{entry.title}</a><ArrowUpRight size={18}/></h3><p>{entry.summary || '打开作品，探索它的规则。'}</p><div className="gallery-card-meta"><span>{entry.author}</span><time dateTime={entry.publishedAt}>{entry.publishedAt.replaceAll('-', '.')}</time></div></div>
        </article>)}</div> : <div className="gallery-empty"><Search size={30}/><h2>{latest.length ? '没有找到匹配的作品' : '第一款作品，等你发布'}</h2><p>{latest.length ? '试试其他关键词，或清除筛选。' : '在编辑器完成设计后，导出发布包并加入作品目录。'}</p>{latest.length > 0 && <button className="button" onClick={() => { setQuery(''); setTag(''); }}>清除筛选</button>}</div>}
        <div className="gallery-about"><Grid2X2 size={20}/><div><strong>从试玩，到你的新创作。</strong><p>每个作品都可以下载或复制到编辑器。这里展示作者发布的固定版本，你的改动只保存在自己的浏览器中。</p></div></div>
      </>}
  </main>;
}

function GalleryDetail({ entry, versions, onCopy }: { entry: GalleryEntry; versions: GalleryEntry[]; onCopy: (project: Project) => void }) {
  const [project, setProject] = useState<Project | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [setup, setSetup] = useState(false), [game, setGame] = useState<{ state: GameState; options: BotOptions | null } | null>(null);
  const [share, setShare] = useState(false), [copied, setCopied] = useState(false);
  const link = galleryShareUrl(location.href, entry);
  useEffect(() => {
    const controller = new AbortController(); setProject(null); setError('');
    loadGalleryProject(entry, controller.signal).then(project => { if (!controller.signal.aborted) setProject(project); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [entry, retry]);
  function play(options: BotOptions | null) {
    if (!project) return;
    try { setGame({ state: initialState(project), options }); setSetup(false); setError(''); }
    catch (error) { setError(`无法开始试玩：${(error as Error).message}`); }
  }
  if (game && project) return <GalleryPlayer project={project} initial={game.state} initialBot={game.options} onClose={() => setGame(null)}/>;
  return <>
    <div className="gallery-detail-nav"><a className="text-button" href={galleryHash()}><ArrowLeft size={16}/>作品广场</a><label>作品版本<select aria-label="作品版本" value={entry.revision} onChange={e => { location.hash = galleryHash({ id: entry.id, revision: Number(e.target.value) }); }}>{versions.map(v => <option key={v.revision} value={v.revision}>v{v.revision}{v === versions[0] ? ' · 最新' : ''}</option>)}</select></label></div>
    <div className="gallery-detail-grid"><div className="gallery-detail-preview">{project ? <Board mini project={project} pieces={project.pieces}/> : <img src={galleryAsset(GALLERY_BASE, entry, 'cover.svg')} alt={`${entry.title}初始棋盘`}/>}</div><div className="gallery-detail-intro"><div className="gallery-tags">{entry.tags.map(tag => <span key={tag}>{tag}</span>)}</div><h1>{entry.title}</h1><p className="gallery-detail-summary">{entry.summary}</p><div className="gallery-byline"><span>{entry.author}</span><span>发布于 {entry.publishedAt}</span><span>v{entry.revision}</span></div>
      {project && <div className="gallery-facts"><span>{project.board.cols} × {project.board.rows} 棋盘</span><span>{ENGINE_NAMES[project.rules.engine]}</span><span>双人棋类</span></div>}
      {!project && !error && <p role="status"><LoaderCircle className="spin" size={16}/>正在加载棋类设计…</p>}
      {error && <div className="error-box" role="alert">{error}{!project && <button className="text-button" onClick={() => setRetry(n => n + 1)}>重新加载</button>}</div>}
      <div className="gallery-primary-actions"><button className="button primary" disabled={!project} onClick={() => play(null)}><Play size={17}/>开始试玩</button><button className="button" disabled={!project} onClick={() => setSetup(true)}><Monitor size={17}/>与电脑对弈</button></div>
      <div className="gallery-secondary-actions"><button className="text-button" disabled={!project} onClick={() => project && onCopy(project)}><Copy size={15}/>复制到编辑器</button><button className="text-button" disabled={!project} onClick={() => project && downloadJson(project, `${entry.id}-v${entry.revision}.qijing.json`)}><Download size={15}/>下载作品</button><button className="text-button" onClick={async () => { setShare(true); try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}><Share2 size={15}/>分享作品</button></div>
      {share && <label className="gallery-share">{copied ? '链接已复制，分享的是当前固定版本。' : '复制下方链接，分享当前固定版本。'}<input aria-label="作品分享链接" readOnly value={link} onFocus={e => e.currentTarget.select()}/></label>}
    </div></div>
    <section className="gallery-rules"><div><BookOpen size={20}/><h2>怎么玩</h2></div><p>{entry.instructions}</p></section>
    {setup && project && <BotSetup project={project} options={null} onClose={() => setSetup(false)} onStart={play}/>}
  </>;
}
