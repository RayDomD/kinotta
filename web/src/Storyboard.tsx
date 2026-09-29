import { useEffect, useRef, useState } from 'react';
import { versionPageUrl } from './api/index.ts';
import type { Comment, NewComment, Shot, Version } from './api/index.ts';
import { HexPin, PinsBadge } from './Pins.tsx';
import { ShotSheet } from './ShotSheet.tsx';
import { PageStill } from './stage/index.ts';
import { formatTimecode } from './timecode.ts';

interface ShotCardProps {
  shot: Shot;
  pageUrl: string;
  pins: Comment[];
  open(): void;
  buttonRef(button: HTMLButtonElement | null): void;
}

/** A non-interactive card (still and labels) with one real button stretched over it to open the shot. */
function ShotCard({ shot, pageUrl, pins, open, buttonRef }: ShotCardProps) {
  const timecode = formatTimecode(shot.start);
  return (
    <div className="shot">
      <PageStill pageUrl={pageUrl} time={shot.start} title={`Shot ${shot.number} still`}>
        {pins.map((c) => (
          <HexPin key={c.id} number={c.number} x={c.pin.x} y={c.pin.y} />
        ))}
      </PageStill>
      <div className="lbl">
        <span>
          <span className="dot">{shot.number}</span>
          {shot.title}
          {pins.length > 0 && <PinsBadge count={pins.length} />}
        </span>
        <span className="t">{timecode}</span>
      </div>
      <div className="desc">{shot.description}</div>
      <button ref={buttonRef} type="button" className="open" aria-label={`Shot ${shot.number}, ${shot.title}, ${timecode}`} onClick={open} />
    </div>
  );
}

export interface StoryboardProps {
  slug: string;
  version: Version;
  comments: Comment[];
  save(input: NewComment): Promise<void>;
}

export function Storyboard({ slug, version, comments, save }: StoryboardProps) {
  const pageUrl = versionPageUrl(slug, version.number);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const returnTo = useRef<string | null>(null);

  // When the sheet closes, focus goes back to the button of the shot it was showing.
  useEffect(() => {
    if (openIndex === null && returnTo.current !== null) {
      buttons.current.get(returnTo.current)?.focus();
      returnTo.current = null;
    }
  }, [openIndex]);

  function close(): void {
    returnTo.current = openIndex === null ? null : (version.shots[openIndex]?.number ?? null);
    setOpenIndex(null);
  }

  return (
    <>
      <div className="head">
        <h1>Storyboard, v{version.number}</h1>
        <span className="meta">Click a shot to enlarge it and pin comments</span>
      </div>
      <div className="grid">
        {version.shots.map((shot, i) => (
          <ShotCard
            key={shot.number}
            shot={shot}
            pageUrl={pageUrl}
            pins={comments.filter((c) => c.pin.shot === shot.number)}
            open={() => setOpenIndex(i)}
            buttonRef={(button) => {
              if (button) buttons.current.set(shot.number, button);
              else buttons.current.delete(shot.number);
            }}
          />
        ))}
      </div>
      {openIndex !== null && (
        <ShotSheet
          pageUrl={pageUrl}
          shots={version.shots}
          index={openIndex}
          comments={comments}
          save={save}
          onStep={setOpenIndex}
          onClose={close}
        />
      )}
    </>
  );
}
