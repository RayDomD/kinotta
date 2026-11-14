import { useEffect, useMemo, useRef, useState } from 'react';
import { GRADE_SPEC, mediaTimeline } from '../../../../server/core/model.ts';
import type { Grade, GradeChanges, GradeValues, Sources } from '../../../../server/core/model.ts';
import { ApiError, fetchGradedPlayback, fetchMediaModel, footageUrl, gradedStillUrl, mediaUrl } from '../../api/index.ts';
import type { MediaEditingModel, Version } from '../../api/index.ts';
import { ColourScrub, ColourWheel } from './ColourWheel.tsx';
import type { ScalarKey, WheelKey } from './ColourWheel.tsx';
import { editPlayhead } from './playhead-memory.ts';
import { workingMedia } from './working-media.ts';
import type { ReviewProps } from './Review.tsx';
import '../review.css';

const PREVIEW_DELAY_MS = 60;
const AGENT_HIGHLIGHT_MS = 1600;
const PLAYBACK_POLL_MS = 1000;
const OWNER = 'you';
const gradeKeys = Object.keys(GRADE_SPEC) as (keyof GradeValues)[];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function gradeDifference(before: Grade, after: Grade): GradeChanges {
  return Object.fromEntries(gradeKeys.filter((key) => !same(before[key] ?? GRADE_SPEC[key].default, after[key] ?? GRADE_SPEC[key].default)).map((key) => [key, after[key] ?? null])) as GradeChanges;
}

function ColourContent({ reel, version, edits, frozen, legacySources }: ReviewProps & { version: Version; legacySources?: Sources }) {
  const edited = useMemo(() => workingMedia(version, edits?.list ?? null, legacySources), [version, edits?.list, legacySources]);
  const media = edited.media!;
  const pictures = useMemo(() => mediaTimeline(media, version.duration).placements.filter((p) => p.role !== 'gap' && p.role !== 'audio' && media.sources.find((s) => s.id === p.source)?.kind !== 'audio').sort((a, b) => a.at - b.at), [media, version.duration]);
  const initialTime = useRef(editPlayhead(reel.slug));
  const initial = pictures.find((p) => initialTime.current >= p.at && initialTime.current < p.at + p.duration) ?? pictures[0];
  const [selected, setSelected] = useState(initial?.id);
  const placement = pictures.find((p) => p.id === selected) ?? pictures[0];
  const picture = placement && placement.role !== 'gap' ? placement : undefined;
  const [time, setTime] = useState(Math.max(0, initialTime.current - (initial?.at ?? 0)));
  const localTime = Math.min(time, Math.max(0, (picture?.duration ?? 0) - 0.001));
  const savedGrade = picture?.grade ?? {};
  const savedKey = JSON.stringify(savedGrade);
  const [draft, setDraft] = useState<Grade | null>(null);
  const draftRef = useRef<Grade | null>(null);
  const draftTarget = useRef<{ placement: string; base: Grade; add: NonNullable<ReviewProps['edits']>['add'] } | null>(null);
  const baseRef = useRef(savedGrade);
  baseRef.current = savedGrade;
  const grade = draft ?? savedGrade;
  const [touched, setTouched] = useState<string[]>([]);
  const previous = useRef({ placement: picture?.id, grade: savedGrade, ids: edits?.list?.operations.map((op) => op.id) ?? [] });
  const editable = !frozen && version.isNewest && !!edits?.list && !edits.list.stale;
  const disabled = !editable || !picture || edits?.busy === true;
  const disabledReason = frozen || !version.isNewest ? `unavailable because v${version.number} is read-only`
    : !picture ? 'unavailable without a picture clip'
    : edits?.busy === true ? 'unavailable while saving'
    : edits?.list?.stale ? 'unavailable until edits are checked against the working reel'
    : !edits?.list ? 'unavailable while edits reload' : undefined;
  const context = useMemo(() => ({ version: version.workingBase ?? version.number, working: version.workingBase !== undefined }), [version.number, version.workingBase]);
  const [still, setStill] = useState<{ original: string; graded: string; placement: string; time: number } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loading, setLoading] = useState(false);
  const [wipe, setWipe] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [playback, setPlayback] = useState<{ url: string; offset: number } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const playTime = useRef(localTime);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentDraft = JSON.stringify(grade);

  useEffect(() => {
    const before = previous.current;
    const operations = edits?.list?.operations ?? [];
    const agentKeys = operations.filter((op) => !before.ids.includes(op.id) && op.by !== OWNER && op.kind === 'placement-change' && op.placement === picture?.id).flatMap((op) => op.kind === 'placement-change' ? Object.keys(op.changes.grade ?? {}) : []);
    setTouched(before.placement === picture?.id ? agentKeys.filter((key) => Object.hasOwn(gradeDifference(before.grade, savedGrade), key)) : []);
    previous.current = { placement: picture?.id, grade: savedGrade, ids: operations.map((op) => op.id) };
    const timer = setTimeout(() => setTouched([]), AGENT_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [edits?.list, picture?.id, savedKey]);

  useEffect(() => {
    void commit();
    setPlaying(false); setRendering(false); setPlayback(null);
  }, [picture?.id, savedKey, frozen]);
  useEffect(() => () => { void commit(); }, [picture?.id, savedKey, frozen]);

  const commit = async (explicit?: GradeChanges) => {
    clearTimeout(commitTimer.current);
    if (explicit && (!editable || !picture || !edits)) return;
    const target = draftTarget.current;
    const pending = draftRef.current;
    const changes = { ...(pending && target ? gradeDifference(target.base, pending) : {}), ...explicit };
    draftRef.current = null; draftTarget.current = null; setDraft(null);
    if (!Object.keys(changes).length) return;
    if (explicit && picture && edits) await edits.add({ kind: 'placement-change', placement: picture.id, changes: { grade: changes } });
    else if (target) await target.add({ kind: 'placement-change', placement: target.placement, changes: { grade: changes } });
  };
  const commitSoon = (delay = 0) => {
    clearTimeout(commitTimer.current);
    if (delay) commitTimer.current = setTimeout(() => { void commit(); }, delay);
    else void commit();
  };
  const change = <K extends keyof GradeValues>(key: K, value: GradeValues[K]) => {
    if (disabled) return;
    setPlaying(false);
    if (!draftTarget.current && picture && edits) draftTarget.current = { placement: picture.id, base: baseRef.current, add: edits.add };
    const next = { ...(draftRef.current ?? baseRef.current), [key]: value };
    draftRef.current = next; setDraft(next);
  };
  const reset = (key: keyof GradeValues) => {
    if (disabled) return;
    void commit({ [key]: null });
  };

  useEffect(() => {
    if (!picture) return;
    let live = true;
    setLoading(true); setPreviewError('');
    const timer = setTimeout(() => {
      const original = gradedStillUrl(reel.slug, picture.id, localTime, 1280, context, {});
      const graded = gradedStillUrl(reel.slug, picture.id, localTime, 1280, context, grade);
      const load = (url: string) => new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not load the colour preview. Try another frame.')); image.src = url; });
      void Promise.all([load(original), load(graded)]).then(() => { if (live) { setStill({ original, graded, placement: picture.id, time: localTime }); setLoading(false); } }, (error: Error) => { if (live) { setPreviewError(error.message); setLoading(false); } });
    }, PREVIEW_DELAY_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [reel.slug, picture?.id, localTime, context, currentDraft]);

  const source = picture && media.sources.find((s) => s.id === picture.source);
  const proxy = picture ? media.legacy && picture.source.startsWith('legacy:') ? footageUrl(reel.slug) : mediaUrl(picture.source, { reel: reel.slug, ...context }) : '';
  useEffect(() => {
    if (!playing || !picture) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await fetchGradedPlayback(reel.slug, picture.id, context);
        if (!live) return;
        if ('url' in result) { if (video.current && video.current.readyState >= 1) playTime.current = Math.max(0, video.current.currentTime - picture.in); setPlayback(result); setRendering(false); }
        else { setRendering(true); timer = setTimeout(() => { void poll(); }, PLAYBACK_POLL_MS); }
      } catch (error) {
        if (!live) return;
        setRendering(false);
        if (!(error instanceof ApiError && error.status === 409)) { setPreviewError(error instanceof Error ? error.message : 'Could not prepare playback.'); setPlaying(false); }
      }
    };
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [playing, picture?.id, context, reel.slug]);
  const togglePlay = () => {
    if (playing) { setTime(Math.max(0, (video.current?.currentTime ?? 0) - (picture ? picture.in - (playback?.offset ?? 0) : 0))); setPlaying(false); }
    else { playTime.current = localTime; setPlayback(null); setPreviewError(''); setPlaying(true); }
  };
  const scalar = (key: ScalarKey, label: string) => <ColourScrub key={key} gradeKey={key} label={label} value={grade[key] ?? GRADE_SPEC[key].default} disabled={disabled} disabledReason={disabledReason} touched={touched.includes(key)} onChange={(value) => change(key, value)} onCommit={commitSoon} onReset={() => reset(key)} />;
  const wheels: [string, WheelKey, ScalarKey, string][] = [['Lift', 'shadowsColor', 'blacks', 'Black'], ['Gamma', 'midtonesColor', 'mids', 'Mid'], ['Gain', 'highlightsColor', 'whites', 'White']];
  return <main className="main rv-main rv-colour" aria-label="Colour" data-verify-unit="ColourView" data-verify-count={pictures.length} data-verify-empty={String(!picture)} data-verify-readonly={String(!editable)} data-verify-selected={picture?.id ?? ''} data-verify-playing={String(playing)}
    onKeyDown={(event) => { if (editable && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target as HTMLElement).closest('input')) { event.preventDefault(); if (event.shiftKey) void edits?.redo(); else void edits?.undo(); } }}>
    <div className="rv-colour-well">
      {picture ? <div className="rv-colour-frame" role="slider" aria-label="Original and graded comparison" aria-valuemin={0} aria-valuemax={100} aria-valuenow={wipe} aria-disabled={false} tabIndex={0}
        onPointerDown={(event) => { if (playing || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); const bounds = event.currentTarget.getBoundingClientRect(); setWipe(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))); }}
        onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const bounds = event.currentTarget.getBoundingClientRect(); setWipe(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))); }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setWipe((value) => Math.max(0, Math.min(100, value + (event.key === 'ArrowLeft' ? -1 : 1)))); } }}>
        {still?.placement === picture.id && <><img src={still.graded} alt="Graded frame" /><img className="rv-colour-original" src={still.original} alt="Original frame" style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }} /><div className="rv-colour-wipe" style={{ left: `${wipe}%` }}><span>Original | Graded</span></div></>}
        {playing && source?.kind !== 'image' && <video key={playback?.url ?? proxy} ref={video} className="rv-colour-video" src={playback?.url ?? proxy} autoPlay playsInline
          onLoadedMetadata={(event) => { const element = event.currentTarget; element.currentTime = playTime.current + picture.in - (playback?.offset ?? 0); void element.play().catch(() => { if (video.current !== element || !element.isConnected) return; setPreviewError('Playback could not start. Press Play to retry.'); setPlaying(false); }); }}
          onTimeUpdate={(event) => { const at = event.currentTarget.currentTime - picture.in + (playback?.offset ?? 0); if (at >= picture.duration) { setPlaying(false); setTime(0); } }}
          onEnded={() => { setPlaying(false); setTime(0); }} onError={() => { setPreviewError('Could not play the colour preview.'); setPlaying(false); }} />}
        {loading && !playing && <span className="rv-colour-loading" role="status">Preparing frame</span>}
      </div> : <p className="state">No picture clips to grade.</p>}
    </div>
    <div className="rv-colour-transport">
      <button type="button" className="rv-tool" disabled={!picture || source?.kind === 'image'} aria-label={!picture ? 'Play, unavailable without a picture clip' : source?.kind === 'image' ? 'Play, unavailable for a still image' : undefined} onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
      <output className="rv-colour-time">{localTime.toFixed(2)}s</output>
      <input aria-label={!picture ? 'Frame time, unavailable without a picture clip' : 'Frame time'} type="range" min={0} max={Math.max(0, (picture?.duration ?? 0) - 0.001)} step={0.04} value={localTime} disabled={!picture} onChange={(event) => { setPlaying(false); setTime(event.target.valueAsNumber); }} />
      <span>Drag across the frame to compare</span>
      <button type="button" className="rv-tool" disabled={disabled} aria-label={disabled && disabledReason ? `Reset grade, ${disabledReason}` : undefined} onClick={() => { void commit(Object.fromEntries(gradeKeys.map((key) => [key, null]))); }}>Reset grade</button>
    </div>
    {rendering && <p className="rv-colour-note" role="status">Grade preview rendering</p>}
    {previewError && <p className="rv-colour-note" role="alert">{previewError}</p>}
    <div className="rv-colour-strip" role="group" aria-label="Picture clips">
      {pictures.map((item, index) => <button type="button" className="rv-colour-clip" key={item.id} aria-current={picture?.id === item.id ? 'true' : undefined} onClick={() => { void commit(); setSelected(item.id); setTime(0); setPlaying(false); }}>
        <span className="num">{String(index + 1).padStart(2, '0')}</span> {item.role !== 'gap' ? media.sources.find((s) => s.id === item.source)?.name ?? item.id : item.id}
      </button>)}
    </div>
    <div className="rv-colour-deck">
      {wheels.map(([title, key, tone, label]) => <section className="rv-colour-wheelbox" key={key}>
        <ColourWheel title={title} gradeKey={key} value={grade[key] ?? GRADE_SPEC[key].default} disabled={disabled} disabledReason={disabledReason} touched={touched.includes(key)} onChange={(value) => change(key, value)} onCommit={commitSoon} onReset={() => reset(key)} />
        {scalar(tone, label)}
      </section>)}
      <section className="rv-colour-global"><h2>Global <small>exposure &middot; colortemperature &middot; eq</small></h2>{scalar('exposure', 'Exposure')}{scalar('temperature', 'Temperature')}{scalar('tint', 'Tint')}{scalar('contrast', 'Contrast')}{scalar('saturation', 'Saturation')}</section>
    </div>
  </main>;
}

export function ColourView(props: ReviewProps) {
  const { reel, version, state, message } = props;
  const [model, setModel] = useState<MediaEditingModel | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setModel(null); setError('');
    if (state !== 'ready' || version?.media || !version?.isNewest) return;
    let live = true;
    void fetchMediaModel(reel.slug).then((value) => { if (live) setModel(value); }, (reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load picture clips.'); });
    return () => { live = false; };
  }, [reel.slug, version?.number, version?.media, version?.isNewest, state]);
  const adapted = useMemo(() => version && model ? { ...version, media: model.media, duration: model.duration, clips: model.clips ?? version.clips, mediaSections: model.sections, captions: model.captions === false ? undefined : model.captions ?? version.captions } : null, [version, model]);
  if (state === 'error' || error) return <main className="main rv-main" aria-label="Colour"><p role="alert">{error || message}</p></main>;
  if (version?.media) return <ColourContent key={`${reel.slug}/${version.number}`} {...props} version={version} />;
  if (adapted) return <ColourContent key={`${reel.slug}/${adapted.number}`} {...props} version={adapted} legacySources={model?.legacySources} />;
  return <main className="main rv-main" aria-label="Colour"><p className="state">{state === 'loading' || version?.isNewest ? 'Preparing Colour' : 'No picture clips to grade.'}</p></main>;
}
