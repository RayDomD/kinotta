import { useEffect, useRef, useState } from 'react';
import { footageUrl, versionPageUrl } from './api/index.ts';
import type { Comment, NewComment, Shot, Version } from './api/index.ts';
import { IssueList } from './IssueList.tsx';
import type { VersionIssues } from './issues.ts';
import { Lanes } from './Lanes.tsx';
import { HexPin, PinsBadge } from './Pins.tsx';
import { ShotKind, ShotLine } from './Transcript.tsx';
import { ShotSheet } from './ShotSheet.tsx';
import { hasSections, pinCounts, sectionNumber, sectionSpan, shotCount, pinCount } from './sections.ts';
import { readOnlyNote } from './readOnly.ts';
import { WaitingMark } from './Waiting.tsx';
import { PageStill } from './stage/index.ts';
import { formatTimecode } from './timecode.ts';

interface ShotCardProps {
  shot: Shot;
  pageUrl: string;
  /** The reel's footage URL when it has footage; a panel shot draws it under its clip. */
  footage: string | undefined;
  pins: Comment[];
  /** Why this shot cannot render, when it cannot. */
  unavailable: string | undefined;
  open(): void;
  buttonRef(button: HTMLButtonElement | null): void;
}

/** A non-interactive card (still and labels) with one real button stretched over it to open the shot. */
function ShotCard({ shot, pageUrl, footage, pins, unavailable, open, buttonRef }: ShotCardProps) {
  const timecode = formatTimecode(shot.start);
  return (
    <div className="shot">
      <PageStill pageUrl={pageUrl} time={shot.start} title={`Shot ${shot.number} still`} footageUrl={shot.type === 'panel' ? footage : undefined} unavailable={unavailable}>
        {pins.map((c) => (c.pin.kind === 'frame' ? <HexPin key={c.id} number={c.number} x={c.pin.x} y={c.pin.y} /> : null))}
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
  /** The section the grid shows. */
  sectionId: string;
  onSection(id: string): void;
  save(input: NewComment): Promise<void>;
  reveal: Reveal | null;
  issues: VersionIssues;
}

export function Storyboard({ slug, version, newest, comments, sectionId, onSection, save, reveal, issues }: StoryboardProps) {
  const readOnly = version.number !== newest;
  const pageUrl = versionPageUrl(slug, version.number);
  const footage = version.footage ? footageUrl(slug) : undefined;
  const multi = hasSections(version.sections);
  const sectionIndex = Math.max(0, version.sections.findIndex((s) => s.id === sectionId));
  const section = version.sections[sectionIndex]!;
  /** What the grid and the enlarged shot step through: the current section's shots (all of them on a one-section reel). */
  const shots = multi ? version.shots.filter((shot) => shot.section === section.id) : version.shots;
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
    const shot = comment ? version.shots.find((s) => s.number === comment.pin.shot) : undefined;
    if (!comment || !shot) return;
    // The sheet steps through one section's shots, so bring the comment's section into the grid first.
    if (multi && shot.section !== undefined && shot.section !== section.id) onSection(shot.section);
    laneOpener.current = reveal.opener;
    setMarkedId(comment.id);
    setOpenIndex(version.shots.filter((s) => !multi || s.section === shot.section).indexOf(shot));
  }, [reveal]);

  function close(): void {
    returnTo.current = openIndex === null ? null : (shots[openIndex]?.number ?? null);
    setOpenIndex(null);
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
            <span className="meta">{readOnly ? 'Click a shot to enlarge it' : 'Click a shot to enlarge it and pin comments'}</span>
          </>
        )}
      </div>
      {readOnly && <p className="readonly-note">{readOnlyNote(version.number, newest)}</p>}
      <IssueList issues={issues.messages} />
      <div className="grid">
        {shots.map((shot, i) => (
          <ShotCard
            key={shot.number}
            shot={shot}
            pageUrl={pageUrl}
            footage={footage}
            pins={comments.filter((c) => c.pin.shot === shot.number)}
            unavailable={issues.unavailable.get(shot.number)}
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
        sections={version.sections}
        currentSection={section.id}
        onSection={onSection}
        onOpen={(shot, opener) => {
          laneOpener.current = opener;
          // A pin on another section's shot brings that section into the grid first.
          if (multi && shot.section !== undefined && shot.section !== section.id) onSection(shot.section);
          setOpenIndex(version.shots.filter((s) => !multi || s.section === shot.section).indexOf(shot));
        }}
      />
      {openIndex !== null && (
        <ShotSheet
          pageUrl={pageUrl}
          footage={footage}
          shots={shots}
          reelShots={version.shots}
          index={openIndex}
          comments={comments}
          markedId={markedId}
          unavailable={issues.unavailable}
          readOnlyNote={readOnly ? readOnlyNote(version.number, newest) : null}
          save={save}
          onStep={setOpenIndex}
          onClose={close}
        />
      )}
    </>
  );
}
