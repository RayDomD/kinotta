import { useEffect, useRef, useState } from 'react';
import { footageUrl, versionPageUrl } from './api/index.ts';
import type { Comment, NewComment, Shot, Version } from './api/index.ts';
import { Lanes } from './Lanes.tsx';
import { HexPin, PinsBadge } from './Pins.tsx';
import { ShotKind, ShotLine } from './Transcript.tsx';
import { ShotSheet } from './ShotSheet.tsx';
import { readOnlyNote } from './readOnly.ts';
import { PageStill } from './stage/index.ts';
import { formatTimecode } from './timecode.ts';

interface ShotCardProps {
  shot: Shot;
  pageUrl: string;
  /** The reel's footage URL when it has footage; a panel shot draws it under its clip. */
  footage: string | undefined;
  pins: Comment[];
  open(): void;
  buttonRef(button: HTMLButtonElement | null): void;
}

/** A non-interactive card (still and labels) with one real button stretched over it to open the shot. */
function ShotCard({ shot, pageUrl, footage, pins, open, buttonRef }: ShotCardProps) {
  const timecode = formatTimecode(shot.start);
  return (
    <div className="shot">
      <PageStill pageUrl={pageUrl} time={shot.start} title={`Shot ${shot.number} still`} footageUrl={shot.type === 'panel' ? footage : undefined}>
        {pins.map((c) => (
          <HexPin key={c.id} number={c.number} x={c.pin.x} y={c.pin.y} />
        ))}
      </PageStill>
      <div className="lbl">
        <span>
          <span className="dot">{shot.number}</span>
          {shot.title}
          <ShotKind type={shot.type} />
          {pins.length > 0 && <PinsBadge count={pins.length} />}
        </span>
        <span className="t">{timecode}</span>
      </div>
      <ShotLine text={shot.spoken} />
      <div className="desc">{shot.description}</div>
      <button ref={buttonRef} type="button" className="open" aria-label={`Shot ${shot.number}, ${shot.title}, ${timecode}`} onClick={open} />
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
  slug: string;
  version: Version;
  /** The reel's newest version. Any other version is read-only. */
  newest: number;
  comments: Comment[];
  save(input: NewComment): Promise<void>;
  reveal: Reveal | null;
}

export function Storyboard({ slug, version, newest, comments, save, reveal }: StoryboardProps) {
  const readOnly = version.number !== newest;
  const pageUrl = versionPageUrl(slug, version.number);
  const footage = version.footage ? footageUrl(slug) : undefined;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  /** The comment whose pin is highlighted while the sheet is open. */
  const [markedId, setMarkedId] = useState<string | null>(null);
  const handledReveal = useRef(reveal?.seq ?? 0);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const returnTo = useRef<string | null>(null);
  /** The lane control that opened the sheet, if one did; null when the grid opened it. */
  const laneOpener = useRef<HTMLElement | null>(null);

  // When the sheet closes, focus goes back to the lane control that opened it, else to the button of the shot it was showing.
  useEffect(() => {
    if (openIndex === null && returnTo.current !== null) {
      const opener = laneOpener.current;
      (opener?.isConnected ? opener : buttons.current.get(returnTo.current))?.focus();
      returnTo.current = null;
      laneOpener.current = null;
    }
  }, [openIndex]);

  // A comment clicked in the panel opens its shot with its pin marked.
  useEffect(() => {
    if (!reveal || reveal.seq === handledReveal.current) return;
    handledReveal.current = reveal.seq;
    const comment = comments.find((c) => c.id === reveal.commentId);
    const at = comment ? version.shots.findIndex((s) => s.number === comment.pin.shot) : -1;
    if (!comment || at < 0) return;
    laneOpener.current = reveal.opener;
    setMarkedId(comment.id);
    setOpenIndex(at);
  }, [reveal]);

  function close(): void {
    returnTo.current = openIndex === null ? null : (version.shots[openIndex]?.number ?? null);
    setOpenIndex(null);
    setMarkedId(null);
  }

  return (
    <>
      <div className="head">
        <h1>Storyboard, v{version.number}</h1>
        <span className="meta">{readOnly ? 'Click a shot to enlarge it' : 'Click a shot to enlarge it and pin comments'}</span>
      </div>
      {readOnly && <p className="readonly-note">{readOnlyNote(version.number, newest)}</p>}
      <div className="grid">
        {version.shots.map((shot, i) => (
          <ShotCard
            key={shot.number}
            shot={shot}
            pageUrl={pageUrl}
            footage={footage}
            pins={comments.filter((c) => c.pin.shot === shot.number)}
            open={() => {
              laneOpener.current = null;
              setOpenIndex(i);
            }}
            buttonRef={(button) => {
              if (button) buttons.current.set(shot.number, button);
              else buttons.current.delete(shot.number);
            }}
          />
        ))}
      </div>
      <Lanes
        duration={version.duration}
        shots={version.shots}
        comments={comments}
        overlays={version.overlays}
        onOpen={(i, opener) => {
          laneOpener.current = opener;
          setOpenIndex(i);
        }}
      />
      {openIndex !== null && (
        <ShotSheet
          pageUrl={pageUrl}
          footage={footage}
          shots={version.shots}
          index={openIndex}
          comments={comments}
          markedId={markedId}
          readOnlyNote={readOnly ? readOnlyNote(version.number, newest) : null}
          save={save}
          onStep={setOpenIndex}
          onClose={close}
        />
      )}
    </>
  );
}
