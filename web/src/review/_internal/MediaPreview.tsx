import { useState } from 'react';
import { mediaUrl } from '../../api/index.ts';
import type { MediaEntry } from '../../api/index.ts';

function verifyAttrs(entry: MediaEntry, failed: boolean) {
  return { 'data-verify-unit': 'MediaPreview', 'data-verify-kind': entry.kind, 'data-verify-error': String(failed), 'data-verify-id': entry.id };
}

export function MediaPreview({ entry, onClose }: { entry: MediaEntry; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const url = `${mediaUrl(entry.id)}${attempt ? `?retry=${attempt}` : ''}`;
  return <div className="editor-media-frame" {...verifyAttrs(entry, failed)}>
    <div className="editor-media-frame-title"><span>{entry.name}</span><button type="button" onClick={onClose} aria-label="Close media preview">Close</button></div>
    {entry.kind === 'image' && <img key={attempt} alt={`Preview of ${entry.name}`} src={url} onError={() => setFailed(true)} />}
    {entry.kind === 'video' && <video key={attempt} aria-label={`Preview of ${entry.name}`} src={url} controls playsInline preload="metadata" onError={() => setFailed(true)} />}
    {entry.kind === 'audio' && <audio key={attempt} aria-label={`Preview of ${entry.name}`} src={url} controls preload="metadata" onError={() => setFailed(true)} />}
    {failed && <p role="alert">This media could not be previewed. <button type="button" className="rv-tool" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Retry preview</button></p>}
  </div>;
}
