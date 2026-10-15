import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { activateBoardAudio, setSoundEnabled, soundEnabled, subscribeSound } from './board-audio';

export function SoundToggle({ className = '' }: { className?: string }) {
  const enabled = useSyncExternalStore(subscribeSound, soundEnabled, () => true);
  return <button type="button" className={className} aria-label="棋子音效" aria-pressed={enabled} title={enabled ? '关闭棋子音效' : '开启棋子音效'} onClick={() => {
    setSoundEnabled(!enabled);
    if (!enabled) activateBoardAudio();
  }}>{enabled ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button>;
}
