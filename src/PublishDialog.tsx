import { useState } from 'react';
import { ArrowDownToLine, Check, Copy } from 'lucide-react';
import { Modal } from './components';
import { validateProject, type Project } from './model';
import { validateRelease, type GalleryRelease } from './gallery-format';
import { galleryCover } from './gallery-cover';
import { downloadJson } from './gallery-client';

export function PublishDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [id, setId] = useState(project.id.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 64) || `work-${Date.now().toString(36)}`);
  const [revision, setRevision] = useState(1), [author, setAuthor] = useState('');
  const [summary, setSummary] = useState(project.description.slice(0, 180)), [tags, setTags] = useState('');
  const [instructions, setInstructions] = useState(''), [error, setError] = useState(''), [exported, setExported] = useState(''), [copied, setCopied] = useState(false);
  const command = `npm run gallery:add -- "${exported || `${id}-v${revision}.qijing-release.json`}"`;
  let cover = '';
  try { cover = galleryCover(validateProject(project)); } catch { /* Invalid drafts remain editable. */ }
  function exportRelease() {
    setError(''); setExported(''); setCopied(false);
    try {
      const p = validateProject(project), now = new Date();
      const publishedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const release = validateRelease({ format: 'qijing-gallery-release', version: 1, project: p, entry: { id, revision, title: p.name, summary, author, tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean), publishedAt, instructions } });
      if (new TextEncoder().encode(JSON.stringify(p, null, 2) + '\n').length > 500000) throw new Error('作品超过 500 KB，请精简后导出。');
      const payload: GalleryRelease = { ...release, coverSvg: galleryCover(p) }, filename = `${id}-v${revision}.qijing-release.json`;
      downloadJson(payload, filename); setExported(filename);
    } catch (error) { setError((error as Error).message); }
  }
  return <Modal title="准备发布你的作品" subtitle="将当前设计、玩法介绍与棋盘封面打包，加入你的静态作品广场。" onClose={onClose} wide>
    <div className="publish-body">
      <div className="publish-preview">{cover && <img src={`data:image/svg+xml,${encodeURIComponent(cover)}`} alt={`${project.name}的发布封面`}/>}<strong>{project.name || '未命名作品'}</strong><span>导出初始布局与完整规则，包括 AI 适配代码。</span></div>
      <div className="publish-fields">
        <div className="publish-row"><label className="field-label">作品标识<input value={id} maxLength={64} onChange={e => setId(e.target.value)} placeholder="例如 forest-chess"/><small>用于分享链接；更新同一作品时保持不变。</small></label><label className="field-label">发布版本<input type="number" min={1} max={1000000} value={revision} onChange={e => setRevision(Number(e.target.value))}/><small>再次发布时增加版本号。</small></label></div>
        <label className="field-label">作者署名<input value={author} maxLength={40} onChange={e => setAuthor(e.target.value)} placeholder="你希望展示的名字"/></label>
        <label className="field-label">简短介绍<textarea value={summary} maxLength={180} rows={2} onChange={e => setSummary(e.target.value)}/></label>
        <label className="field-label">标签<input value={tags} onChange={e => setTags(e.target.value)} placeholder="例如 原创, 策略, 轻量"/><small>用逗号分隔，最多 6 个。</small></label>
        <label className="field-label">玩法说明<textarea value={instructions} maxLength={6000} rows={5} onChange={e => setInstructions(e.target.value)} placeholder="介绍如何走子、怎样获胜，以及特殊规则。"/></label>
        {error && <p className="error-box" role="alert">{error}</p>}
        <button className="button primary full" onClick={exportRelease}><ArrowDownToLine size={16}/>导出发布包</button>
        {exported && <div className="publish-next" role="status"><strong><Check size={16}/>发布包已导出</strong><p>将下载的文件放到项目目录，在终端运行：</p><code>{command}</code><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(command); setCopied(true); } catch { setError('无法自动复制，请选中命令手动复制。'); } }}><Copy size={13}/>{copied ? '已复制命令' : '复制命令'}</button><p>检查本地广场后，提交并推送生成的 public/gallery 文件；部署完成后访客就能看到作品。</p></div>}
        <p className="muted tiny">导出发布包不会直接上传或公开作品。网站只展示已加入仓库并完成部署的版本。</p>
      </div>
    </div>
  </Modal>;
}
