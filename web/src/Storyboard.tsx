import { useEffect, useRef, useState } from 'react';
import { alternatePageUrl, footageUrl, versionPageUrl, workingPartsPageUrl } from './api/index.ts';
import type { Comment, NewComment, Shot, Version } from './api/index.ts';
import { EmptyStoryboard } from './EmptyStoryboard.tsx';
import { IssueList } from './IssueList.tsx';
import type { VersionIssues } from './issues.ts';
import { Lanes } from './Lanes.tsx';
import { HexPin, PinsBadge, tagStacks } from './Pins.tsx';
import { ShotKind, ShotLine } from './Transcript.tsx';
import { ShotSheet } from './ShotSheet.tsx';
import { clipStates, hasSections, pinCounts, sectionNumber, sectionSpan, shotCount, pinCount } from './sections.ts';
import { WaitingMark } from './Waiting.tsx';
import { PagePlayer, PageStill } from './stage/index.ts';
import { formatTimecode } from './timecode.ts';
import type { EditsState } from './review/index.ts';

import { EFFECT_DRAG_TYPE } from './PinnedEffects.tsx';

const FROZEN_NOTE = 'Open Working to add or change comments.';

function storyboardVerifyAttrs(count: number, duration: number, workingParts: boolean) {
  return { 'data-verify-unit': 'Storyboard', 'data-verify-count': String(count), 'data-verify-empty': String(count === 0), 'data-verify-duration': String(duration), 'data-verify-working-parts': String(workingParts) };
}

function shotVerifyAttrs(shot: Shot, count: number, shownRevision?: string) {
  return {
    'data-verify-unit': 'ShotCard',
    'data-verify-count': String(count),
    'data-verify-selected': shot.revision ?? '',
    'data-verify-shown': shownRevision ?? '',
    'data-verify-choice-made': String(!!shot.choiceMade),
    'data-verify-needs-choice': String(count > 1 && !shot.choiceMade),
  };
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  return reducedMotion;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
}

/** Loops a page from `start` for `duration` seconds. It keeps its own clock, so the card around it does not re-render each frame. */
function CardPlayer({ pageUrl, start, duration, title }: { pageUrl: string; start: number; duration: number; title: string }) {
  const [time, setTime] = useState(start);

  useEffect(() => {
    let animId: number;
    const startAt = performance.now();
    setTime(start);
    const loop = (now: number) => {
      setTime(start + (((now - startAt) / 1000) % duration));
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [start, duration]);

  return <PagePlayer className="still-player" pageUrl={pageUrl} time={time} title={title} />;
}

interface ShotCardProps {
  saveEffect?(input: NewComment): Promise<void>;
  shot: Shot;
  pageUrl: string;
  alternatePage?(shot: string, revision: string): string;
  /** The reel's footage URL when it has footage; a panel shot draws it under its clip. */
  footage: string | undefined;
  pins: Comment[];
  /** The states of the shot's clip when it is one of several (empty otherwise). */
  states: Shot[];
  /** Why this shot cannot render, when it cannot. */
  unavailable: string | undefined;
  playing: boolean;
  onPlayingChange(playing: boolean): void;
  open(revision?: string): void;
  buttonRef(button: HTMLButtonElement | null): void;
  edits?: EditsState;
}

/** A non-interactive card (still and labels) with one real button stretched over it to open the shot. */
function ShotCard({ shot, pageUrl, alternatePage, footage, pins, states, unavailable, playing, onPlayingChange, open, buttonRef, edits, saveEffect }: ShotCardProps) {
  const [dropPoint, setDropPoint] = useState<{ x: number; y: number } | null>(null);
  const [dropProblem, setDropProblem] = useState('');
  const timecode = formatTimecode(shot.start);
  const alternates = shot.alternates?.filter((alternate) => !alternate.dismissed) ?? [];
  const inReelAlternate = alternates.find((a) => a.inReel);
  const [shownRevision, setShownRevision] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const cardButton = useRef<HTMLButtonElement | null>(null);

  const alternateRevisions = alternates.map((a) => a.revision).join(',');
  useEffect(() => {
    setShownRevision(null);
  }, [shot.revision, alternateRevisions]);

  const shown = alternates.find((a) => a.revision === shownRevision) ?? inReelAlternate ?? alternates[0];

  useEffect(() => {
    setDismissing(false);
    setDismissReason('');
  }, [shown?.revision]);

  const activeRevision = shown?.revision ?? shot.revision;
  const stillPageUrl = shown && shown.revision !== shot.revision && shot.name && alternatePage ? alternatePage(shot.name, shown.revision) : pageUrl;
  const framePins = pins.flatMap((c) => (c.pin.kind === 'frame' && (!c.pin.alternate || c.pin.alternate === activeRevision) ? [{ id: c.id, number: c.number, x: c.pin.x, y: c.pin.y }] : []));
  const stacks = tagStacks(framePins);
  const part = states.indexOf(shot) + 1;
  const partOf = part > 0 ? `${part} of ${states.length}` : null;
  const inReelLabel = inReelAlternate?.label ?? shot.revision;

  const reducedMotion = usePrefersReducedMotion();
  // The player draws the page alone, so a shot over footage or one that cannot render keeps its still.
  const playable = unavailable === undefined && !(shot.type === 'panel' && footage !== undefined);
  const isPlaying = playing && alternates.length > 1 && !reducedMotion && playable;
  const duration = Math.max(0.01, shown?.duration ?? shot.duration);

  function stepAlternate(delta: number): void {
    const current = alternates.findIndex((a) => a.revision === shown?.revision);
    const next = alternates[current + delta];
    if (next) setShownRevision(next.revision);
  }

  function framePoint(event: React.DragEvent<HTMLDivElement>) {
    if (!saveEffect || !event.dataTransfer.types.includes(EFFECT_DRAG_TYPE) || window.matchMedia('(max-width: 600px), (pointer: coarse)').matches) return null;
    const bounds = event.currentTarget.querySelector('.still')?.getBoundingClientRect();
    if (!bounds || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return null;
    return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
  }
  const effectPins = pins.filter((comment) => comment.effect && comment.pin.kind === 'frame' && (!comment.pin.alternate || comment.pin.alternate === activeRevision));
  const effectMarks = <>{effectPins.map((comment) => comment.pin.kind === 'frame' && <button key={comment.id} type="button" className="fx-anchor" aria-label={`Select pin ${comment.number}`} style={{ left: `${comment.pin.x * 100}%`, top: `${comment.pin.y * 100}%` }}
    onClick={(event) => { event.stopPropagation(); document.querySelector<HTMLElement>(`[data-pin-card="${comment.id}"]`)?.focus(); }}><span className="num">{comment.number}</span></button>)}
    {effectPins.filter((comment) => !comment.instant).map((comment) => comment.pin.kind === 'frame' && <span key={comment.id} className="fx-footprint planned" style={{ left: `${comment.pin.x * 100}%`, top: `${comment.pin.y * 100}%` }}>{comment.effectName} - planned</span>)}
    {dropPoint && <span className="fx-footprint" style={{ left: `${dropPoint.x * 100}%`, top: `${dropPoint.y * 100}%` }}>Pin effect here</span>}</>;

  return (
    <div
      onDragOver={(event) => { const point = framePoint(event); setDropPoint(point); if (point) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPoint(null); }}
      onDrop={(event) => { const point = framePoint(event); setDropPoint(null); if (!point) return; event.preventDefault(); const effect = event.dataTransfer.getData(EFFECT_DRAG_TYPE); void saveEffect!({ effect, text: '', pin: { shot: shot.number, x: point.x, y: point.y, element: null, ...(shown ? { alternate: shown.revision } : {}) } }).catch((error: Error) => setDropProblem(error.message)); }}
      className={['shot', alternates.length > 1 ? 'has-alternates' : '', dismissing && !shown?.inReel ? 'dismissing' : ''].filter(Boolean).join(' ')}
      {...shotVerifyAttrs(shot, alternates.length, shown?.revision)}
      onMouseEnter={() => {
        if (alternates.length > 1) onPlayingChange(true);
      }}
      onMouseLeave={(e) => {
        if (alternates.length > 1 && !e.currentTarget.contains(document.activeElement)) {
          onPlayingChange(false);
        }
      }}
      onFocusCapture={() => {
        if (alternates.length > 1) onPlayingChange(true);
      }}
      onBlurCapture={(e) => {
        if (alternates.length > 1 && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onPlayingChange(false);
        }
      }}
    >
      {isPlaying ? (
        <div className="still playing" data-card-player="true">
          <CardPlayer key={stillPageUrl} pageUrl={stillPageUrl} start={shot.start} duration={duration} title={`Shot ${shot.number} player`} />
          {framePins.filter((pin) => !effectPins.some((comment) => comment.id === pin.id)).map((p, i) => <HexPin key={p.id} number={p.number} x={p.x} y={p.y} stack={stacks[i]} />)}
          {effectMarks}
        </div>
      ) : (
        <PageStill key={stillPageUrl} pageUrl={stillPageUrl} time={shot.start} title={`Shot ${shot.number} still`} footageUrl={shot.type === 'panel' ? footage : undefined} unavailable={unavailable}>
          {framePins.filter((pin) => !effectPins.some((comment) => comment.id === pin.id)).map((p, i) => <HexPin key={p.id} number={p.number} x={p.x} y={p.y} stack={stacks[i]} />)}
          {effectMarks}
        </PageStill>
      )}
      {dropProblem && <p role="alert">{dropProblem}</p>}
      <div className="lbl">
        <span>
          <span className="dot">{shot.number}</span>
          {shot.title}
          <ShotKind type={shot.type} />
          {pins.length > 0 && <PinsBadge count={pins.length} />}
        </span>
        <span className="t">{timecode}</span>
      </div>
      {partOf && (
        <div className="part">
          {states.map((s) => <i key={s.number} className={s === shot ? 'on' : undefined} />)}
          {partOf}
        </div>
      )}
      <ShotLine text={shot.spoken} />
      <div className="desc">{shot.description}</div>
      {alternates.length > 0 && (
        <div className="shot-alternates" aria-label={`${alternates.length} alternates, ${inReelLabel} in the reel${shown && !shown.inReel ? `, previewing ${shown.label}` : ''}`}>
          {alternates.map((alternate) => (
            <button
              key={alternate.revision}
              type="button"
              data-alternate-revision={alternate.revision}
              aria-label={`Show alternate ${alternate.label}`}
              aria-pressed={alternate.revision === shown?.revision}
              className={[alternate.inReel ? 'on' : '', alternate.revision === shown?.revision ? 'shown' : ''].filter(Boolean).join(' ') || undefined}
              onClick={(e) => {
                e.stopPropagation();
                setShownRevision(alternate.revision);
              }}
            />
          ))}
          <span>{`${alternates.length} alternates · ${inReelLabel} in the reel${shown && !shown.inReel ? ` · previewing ${shown.label}` : ''}`}</span>
        </div>
      )}
      {alternates.length > 1 && shown && edits && shot.name && (
        <div className="shot-alternate-actions">
          <button
            type="button"
            className="use"
            aria-label={`Use alternate ${shown.label}`}
            disabled={edits.busy || shown.inReel}
            onClick={(e) => {
              e.stopPropagation();
              void edits.add({ kind: 'shot-alternate', shot: shot.name!, revision: shown.revision });
            }}
          >
            Use
          </button>
          <button
            type="button"
            className="not-this"
            aria-label={`Not this alternate ${shown.label}`}
            disabled={edits.busy || shown.inReel}
            onClick={(e) => {
              e.stopPropagation();
              setDismissing(true);
            }}
          >
            Not this
          </button>
        </div>
      )}
      {alternates.length > 1 && shown && edits && shot.name && dismissing && !shown.inReel && (
        <form
          className="shot-alternate-reason"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (edits.busy) return;
            const reason = dismissReason.trim();
            const revision = shown.revision;
            setDismissing(false);
            setDismissReason('');
            setShownRevision(inReelAlternate?.revision ?? shot.revision ?? null);
            cardButton.current?.focus();
            requestAnimationFrame(() => cardButton.current?.focus());
            void edits.add({ kind: 'shot-alternate-dismiss', shot: shot.name!, revision, reason });
          }}
        >
          <input
            autoFocus
            type="text"
            aria-label="Reason for Not this"
            placeholder="Why not? (optional)"
            value={dismissReason}
            disabled={edits.busy}
            onChange={(e) => setDismissReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setDismissing(false);
                setDismissReason('');
                cardButton.current?.focus();
              }
            }}
          />
          <button type="submit" disabled={edits.busy}>Reject</button>
        </form>
      )}
      <button
        ref={(button) => {
          cardButton.current = button;
          buttonRef(button);
        }}
        type="button"
        className="open"
        aria-label={`Shot ${shot.number}, ${shot.title}, ${partOf ? `state ${partOf} of clip ${shot.clip}, ` : ''}${timecode}`}
        onClick={() => open(shown?.revision)}
        onKeyDown={(e) => {
          if (alternates.length > 1 && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            stepAlternate(e.key === 'ArrowDown' ? 1 : -1);
          }
        }}
      />
    </div>
  );
}

/** A request from the comments panel to open a comment's shot. `seq` changes with every request. */
export interface Reveal {
  commentId: string;
  seq: number;
  /** The panel control that asked, so focus returns to it when the sheet closes. */
  opener: HTMLElement;
}

export interface StoryboardProps {
  edits?: EditsState;
  slug: string;
  version: Version;
  /** The reel's newest version. Any other version is read-only. */
  newest: number;
  comments: Comment[];
  /** The section the grid shows. */
  sectionId: string;
  onSection(id: string): void;
  save(input: NewComment): Promise<void>;
  reveal: Reveal | null;
  issues: VersionIssues;
}

export function Storyboard({ slug, version: baseVersion, newest, comments, sectionId, onSection, save, reveal, issues, edits }: StoryboardProps) {
  const version = baseVersion.workingParts ? { ...baseVersion, duration: baseVersion.workingParts.duration, shots: baseVersion.workingParts.shots } : baseVersion;
  const readOnly = !version.isNewest;
  const pageUrl = version.workingEffectKey ? workingPartsPageUrl(slug, version.workingEffectKey) : version.workingParts ? workingPartsPageUrl(slug, version.workingParts.key) : versionPageUrl(slug, version.workingBase ?? version.number);
  const footage = version.footage ? footageUrl(slug) : undefined;
  const multi = hasSections(version.sections);
  const sectionIndex = Math.max(0, version.sections.findIndex((s) => s.id === sectionId));
  const section = version.sections[sectionIndex]!;
  /** What the grid and the enlarged shot step through: the current section's shots (all of them on a one-section reel). */
  const shots = multi ? version.shots.filter((shot) => shot.section === section.id) : version.shots;
  const [inserting, setInserting] = useState<Shot | null>(null);
  const [insertText, setInsertText] = useState('');
  const [insertProblem, setInsertProblem] = useState('');
  const [insertBusy, setInsertBusy] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [openRevision, setOpenRevision] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  /** The comment whose pin is highlighted while the sheet is open. */
  const [markedId, setMarkedId] = useState<string | null>(null);
  const handledReveal = useRef(reveal?.seq ?? 0);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const returnTo = useRef<string | null>(null);
  /** The lane control that opened the sheet, if one did; null when the grid opened it. */
  const laneOpener = useRef<HTMLElement | null>(null);

  // The sheet consumes this on mount. Later Working remounts should follow the reel's current choice.
  useEffect(() => {
    setOpenRevision(null);
  }, [openRevision]);

  // When the sheet closes, focus goes back to the lane control that opened it, else to the button of the shot it was showing.
  useEffect(() => {
    if (openIndex === null && returnTo.current !== null) {
      const opener = laneOpener.current;
      (opener?.isConnected ? opener : buttons.current.get(returnTo.current))?.focus();
      returnTo.current = null;
      laneOpener.current = null;
    }
  }, [openIndex]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Ctrl or Cmd with Z (Shift for redo) or Y steps the edit list, as in Review.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.defaultPrevented && /^[zy]$/i.test(e.key)) {
        if (readOnly || !edits || edits.busy || openIndex !== null || isTyping(e.target)) return;
        e.preventDefault();
        void (e.key.toLowerCase() === 'y' || e.shiftKey ? edits.redo() : edits.undo());
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, edits, openIndex]);

  // A comment clicked in the panel opens its shot with its pin marked.
  useEffect(() => {
    if (!reveal || reveal.seq === handledReveal.current) return;
    handledReveal.current = reveal.seq;
    const comment = comments.find((c) => c.id === reveal.commentId);
    const name = comment?.pin.kind === 'frame' ? comment.pin.shotName : undefined;
    const shot = comment ? version.shots.find((s) => name ? s.name === name : s.number === comment.pin.shot) : undefined;
    if (!comment || !shot) return;
    // The sheet steps through one section's shots, so bring the comment's section into the grid first.
    if (multi && shot.section !== undefined && shot.section !== section.id) onSection(shot.section);
    laneOpener.current = reveal.opener;
    setMarkedId(comment.id);
    const pinAlternate = comment.pin.kind === 'frame' ? comment.pin.alternate : undefined;
    setOpenRevision(pinAlternate ?? null);
    setOpenIndex(version.shots.filter((s) => !multi || s.section === shot.section).indexOf(shot));
  }, [reveal]);

  function close(): void {
    returnTo.current = openIndex === null ? null : (shots[openIndex]?.number ?? null);
    setOpenIndex(null);
    setOpenRevision(null);
    setMarkedId(null);
  }

  return (
    <>
      <div className="head">
        {multi ? (
          <>
            <h1>
              <span className="dot">{sectionNumber(sectionIndex)}</span> {section.name}
            </h1>
            <span className="meta num">{`${sectionSpan(section)} · ${shotCount(shots.length)} · ${pinCount(pinCounts(comments, version.shots).get(section.id) ?? 0)}`}</span>
            {section.waiting && <WaitingMark />}
          </>
        ) : (
          <>
            <h1>Storyboard, v{version.number}</h1>
            {version.shots.length > 0 && <span className="meta">{readOnly ? 'Click a shot to enlarge it' : 'Click a shot to enlarge it and pin comments'}</span>}
          </>
        )}
      </div>
      {readOnly && <p className="readonly-note">{FROZEN_NOTE}</p>}
      <IssueList issues={issues.messages} />
      {version.shots.length === 0 && <EmptyStoryboard version={version} comments={comments} readOnly={readOnly} save={save} />}
      {inserting && <form className="fx-insert-form" aria-label="Insert shot" onSubmit={(event) => {
        event.preventDefault(); setInsertBusy(true); setInsertProblem('');
        void save({ insertShot: true, text: insertText, pin: { shot: inserting.number, x: .5, y: .5, element: null } }).then(() => { setInserting(null); setInsertText(''); }, (error: Error) => setInsertProblem(error.message)).finally(() => setInsertBusy(false));
      }}><label>Describe the new shot after Shot {inserting.number}<textarea autoFocus aria-label="Describe the new shot" value={insertText} onChange={(event) => setInsertText(event.target.value)} /></label>
        <button type="submit" className="btn" disabled={insertBusy || !insertText.trim()}>Add to next Build</button><button type="button" className="c-act" onClick={() => setInserting(null)}>Cancel</button>{insertProblem && <p role="alert">{insertProblem}</p>}
      </form>}
      <div className="grid" {...storyboardVerifyAttrs(shots.length, version.duration, !!version.workingParts)}>
        {shots.map((shot, i) => (
          <div key={`${slug}/${version.workingBase ?? version.number}/${shot.number}`} className="fx-shot-slot"><ShotCard
            saveEffect={readOnly ? undefined : save}
            shot={shot}
            pageUrl={pageUrl}
            alternatePage={(shotName, revision) => alternatePageUrl(slug, version.number, shotName, revision, version.workingParts?.key)}
            footage={footage}
            pins={comments.filter((c) => c.pin.kind === 'frame' && c.pin.shotName && shot.name ? c.pin.shotName === shot.name : c.pin.shot === shot.number)}
            states={clipStates(version.shots, shot)}
            unavailable={issues.unavailable.get(shot.number)}
            playing={playingKey === shot.number}
            onPlayingChange={(playing) => setPlayingKey((current) => playing ? shot.number : current === shot.number ? null : current)}
            open={(revision) => {
              laneOpener.current = null;
              setOpenRevision(revision ?? null);
              setOpenIndex(i);
            }}
            buttonRef={(button) => {
              if (button) buttons.current.set(shot.number, button);
              else buttons.current.delete(shot.number);
            }}
            edits={readOnly ? undefined : edits}
          />{!readOnly && i < shots.length - 1 && <div className="fx-gap" data-after-shot={shot.number}><button type="button" aria-label={`Insert shot after Shot ${shot.number}`} onClick={() => { setInserting(shot); setInsertText(''); }}>Insert shot</button></div>}</div>
        ))}
      </div>
      <Lanes
        duration={version.duration}
        shots={version.shots}
        comments={comments.filter((c) => {
          const name = c.pin.kind === 'frame' ? c.pin.shotName : undefined;
          return !name || version.shots.some((shot) => shot.name === name);
        })}
        overlays={version.overlays}
        sections={version.sections}
        currentSection={section.id}
        onSection={onSection}
        onOpen={(shot, opener) => {
          laneOpener.current = opener;
          setOpenRevision(null);
          // A pin on another section's shot brings that section into the grid first.
          if (multi && shot.section !== undefined && shot.section !== section.id) onSection(shot.section);
          setOpenIndex(version.shots.filter((s) => !multi || s.section === shot.section).indexOf(shot));
        }}
      />
      {openIndex !== null && (
        <ShotSheet
          key={pageUrl}
          pageUrl={pageUrl}
          initialRevision={openRevision ?? undefined}
          edits={readOnly ? undefined : edits}
          canAskOptions={!!(version.parts || version.code)}
          alternatePage={(shot, revision) => alternatePageUrl(slug, version.number, shot, revision, version.workingParts?.key)}
          footage={footage}
          shots={shots}
          reelShots={version.shots}
          index={openIndex}
          comments={comments}
          markedId={markedId}
          revealSequence={reveal?.seq}
          unavailable={issues.unavailable}
          readOnlyNote={readOnly ? FROZEN_NOTE : null}
          save={save}
          onStep={setOpenIndex}
          onClose={close}
        />
      )}
    </>
  );
}
