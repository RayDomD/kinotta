import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProject, fetchReels, fetchTranscription, fetchVersion, fetchVersions, subscribe, versionPageUrl } from './api/index.ts';
import type { Comment, ProjectEvent, ReelListing, ReelSummary, TranscriptionProgress, Version, VersionEntry } from './api/index.ts';
import { BUILT_BY_YOU } from '../../server/core/model.ts';
import { BriefWaiting } from './BriefReel.tsx';
import { CommentsPanel } from './CommentsPanel.tsx';
import { CopyButton } from './CopyButton.tsx';
import { Empty } from './Empty.tsx';
import { lastTab, rememberTab } from './lastTab.ts';
import { NewReel } from './NewReel.tsx';
import { Review, ReviewSide, useEdits } from './review/index.ts';
import type { EditsState } from './review/index.ts';
import { Storyboard } from './Storyboard.tsx';
import type { Reveal } from './Storyboard.tsx';
import { useVersionIssues } from './issues.ts';
import type { VersionIssues } from './issues.ts';
import { hasSections, pinCounts, sectionNumber, sectionSpan, shotCount } from './sections.ts';
import { PinsBadge } from './Pins.tsx';
import { formatDuration } from './timecode.ts';
import { WaitingMark } from './Waiting.tsx';
import { useComments } from './useComments.ts';
import type { CommentsState } from './useComments.ts';
import { useNote } from './useNote.ts';
import type { NoteState } from './useNote.ts';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; project: string; listing: ReelListing };

type VersionLoad =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; slug: string; version: Version };

const PHASES = ['Storyboard', 'Review', 'Picker'] as const;
type Phase = 'Storyboard' | 'Review';

function HexMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M4.5 8.5L14 14l9.5-5.5M14 14v11" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".6" />
    </svg>
  );
}

function TopBar(props: {
  reel: ReelSummary | undefined;
  version: Version | undefined;
  commentCount: number;
  note?: NoteState;
  frozen: boolean;
  /** On a reel with several sections: the one on screen, which the copy button copies. */
  section?: { id: string; number: string } | null;
  /** The batch was saved, which changes what the version says (a section now waiting). */
  onCopied?(): void;
  /** The version's contract issues, which the batch can include. */
  issues?: VersionIssues;
  /** The phase on screen; null while the New reel screen is open. */
  phase?: Phase | null;
  onPhase?(phase: Phase): void;
}) {
  const { reel, version, commentCount, note, frozen, section = null, onCopied, issues, phase = null, onPhase } = props;
  return (
    <header className="top">
      <div className="brand"><HexMark />KINOTTA</div>
      <div className="reelname">
        {reel?.title}
        {version && <span className="num">{formatDuration(version.duration)}</span>}
      </div>
      <nav className="modes" aria-label="Phase">
        {PHASES.map((name) =>
          name === 'Storyboard' || name === 'Review' ? (
            <button key={name} type="button" aria-current={name === phase ? 'page' : undefined} onClick={() => onPhase?.(name)}>
              {name}
            </button>
          ) : (
            <span key={name} aria-disabled="true" title="Not built yet">{name}</span>
          ),
        )}
      </nav>
      {reel && version && (
        <CopyButton
          slug={reel.slug}
          version={version.number}
          count={commentCount}
          hasNote={note !== undefined && note.text.trim() !== ''}
          beforeCopy={note?.flush}
          frozen={frozen}
          issues={issues && { all: issues.messages, runtime: issues.runtime }}
          section={section}
          onSaved={onCopied}
        />
      )}
    </header>
  );
}

interface VersionRailProps {
  entries: VersionEntry[];
  selected: number | undefined;
  /** Versions an agent wrote since the reel was opened and the reviewer has not opened yet. */
  ready: ReadonlySet<number>;
  /** Section ids in the order the open version lists them, on a reel with several; the rail numbers changed sections by it. */
  sectionIds: string[] | null;
  onOpen(number: number): void;
}

/** Who made a version, as the rail says it: "Saved by you" for one Kinotta built, else the agent's name. */
function whoMade(builtBy: string | undefined): string | null {
  if (builtBy === undefined) return null;
  return builtBy === BUILT_BY_YOU ? 'Saved by you' : `Built by ${builtBy}`;
}

/** `now · changed 01`, `changed 01, 02`, `storyboard`: what a version row says besides its number. */
function versionTag(entry: VersionEntry, sectionIds: string[] | null): string {
  const label = entry.isNewest ? 'now' : entry.isStoryboard ? 'storyboard' : '';
  const numbers = (entry.changedSections ?? []).map((id) => sectionIds?.indexOf(id) ?? -1).filter((i) => i >= 0).sort((a, b) => a - b).map(sectionNumber);
  return [label, numbers.length > 0 ? `changed ${numbers.join(', ')}` : ''].filter((part) => part !== '').join(' · ');
}

function VersionRail({ entries, selected, ready, sectionIds, onOpen }: VersionRailProps) {
  return (
    <div>
      <div className="label">Versions</div>
      <nav className="versions" aria-label="Versions">
        {entries.map((entry) => (
          <button
            key={entry.number}
            type="button"
            aria-current={entry.number === selected ? 'true' : undefined}
            data-newest={entry.isNewest ? 'true' : undefined}
            onClick={() => onOpen(entry.number)}
          >
            <span>
              {`v${entry.number}`}
              {whoMade(entry.builtBy) !== null && <span className="rv-who">{whoMade(entry.builtBy)}</span>}
            </span>
            <span className="tags">
              {versionTag(entry, sectionIds) !== '' && <small className="num">{versionTag(entry, sectionIds)}</small>}
              {ready.has(entry.number) && entry.number !== selected && <small className="num ready-mark">ready</small>}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

interface SectionRailProps {
  version: Version;
  comments: Comment[];
  selected: string;
  onSelect(id: string): void;
}

/** The sections of a multi-section reel: name, span, shot count and pin count, one button each. */
function SectionRail({ version, comments, selected, onSelect }: SectionRailProps) {
  const pins = pinCounts(comments, version.shots);
  return (
    <div>
      <div className="label">{`Sections · ${version.sections.length}`}</div>
      <nav className="secs" aria-label="Sections">
        {version.sections.map((section, i) => (
          <button key={section.id} type="button" aria-current={section.id === selected ? 'true' : undefined} onClick={() => onSelect(section.id)}>
            <span className="n">{sectionNumber(i)}</span>
            <span className="nm">{section.name}</span>
            <span className="sub">
              <span className="num">{sectionSpan(section)}</span>
              <span>{shotCount(section.shots)}</span>
              {(pins.get(section.id) ?? 0) > 0 && <PinsBadge count={pins.get(section.id)!} />}
              {section.waiting && <WaitingMark />}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

interface RailProps {
  project: string;
  listing: ReelListing;
  current: string | undefined;
  sections: SectionRailProps | null;
  versions: Omit<VersionRailProps, 'onOpen'> & { onOpenVersion(number: number): void };
  onOpen(slug: string): void;
  /** The New reel screen is open. */
  creating: boolean;
  onNewReel(): void;
}

function Rail(props: RailProps) {
  const { project, listing, current, sections, versions, onOpen, creating, onNewReel } = props;
  return (
    <aside className="rail" aria-label="Project">
      <div>
        <div className="label">Reels in {project}/reels</div>
        {listing.reels.length > 0 ? (
          <nav className="reels" aria-label="Reels">
            {listing.reels.map((reel) => (
              <button key={reel.slug} type="button" aria-current={reel.slug === current && !creating ? 'true' : undefined} onClick={() => onOpen(reel.slug)}>
                {reel.title}
                {reel.brief !== undefined && reel.newestVersion === null && <WaitingMark />}
              </button>
            ))}
          </nav>
        ) : (
          <div className="meta rail-none">None</div>
        )}
        <nav className="reels" aria-label="New reel">
          <button type="button" aria-current={creating ? 'true' : undefined} onClick={onNewReel}>New reel</button>
        </nav>
      </div>
      {sections !== null && <SectionRail {...sections} />}
      {current !== undefined && versions.entries.length > 0 && (
        <VersionRail
          entries={versions.entries}
          selected={versions.selected}
          ready={versions.ready}
          sectionIds={versions.sectionIds}
          onOpen={versions.onOpenVersion}
        />
      )}
    </aside>
  );
}

function ReadyNotice({ version, onOpen }: { version: number | null; onOpen(number: number): void }) {
  return (
    <div className="notice-slot" role="status">
      {version !== null && (
        <div className="notice">
          <span>{`v${version} is ready.`}</span>
          <button type="button" className="btn" onClick={() => onOpen(version)}>{`Open v${version}`}</button>
        </div>
      )}
    </div>
  );
}

interface MainProps {
  project: string;
  listing: ReelListing;
  reel: ReelSummary | undefined;
  version: VersionLoad;
  newest: number | undefined;
  readyVersion: number | null;
  onOpenVersion(number: number): void;
  comments: CommentsState;
  reveal: Reveal | null;
  sectionId: string;
  onSection(id: string): void;
  issues: VersionIssues;
  phase: Phase;
  creating: boolean;
  onStarted(slug: string): void;
  edits: EditsState;
  /** The open reel's transcription, while its v1 waits for it. */
  transcription: TranscriptionProgress | null;
  onBriefStarted(slug: string): void;
}

function Main(props: MainProps) {
  const { project, listing, reel, version, newest, readyVersion, onOpenVersion, comments, reveal, sectionId, onSection, issues, phase, creating, onStarted, edits, transcription, onBriefStarted } = props;
  if (creating) return <NewReel project={project} onStarted={onStarted} onBriefStarted={onBriefStarted} />;
  if (listing.state === 'no-reels-folder') {
    return <main className="main"><Empty>{`No reels folder in ${project}. Ask your agent for a storyboard to create one.`}</Empty></main>;
  }
  if (listing.state === 'no-reels' || !reel) {
    return <main className="main"><Empty>{`The reels folder in ${project} has no reels yet. Ask your agent for a storyboard to add one.`}</Empty></main>;
  }
  if (reel.brief !== undefined && reel.newestVersion === null) return <BriefWaiting reel={{ ...reel, brief: reel.brief }} />;
  if (phase === 'Review') {
    return (
      <Review
        reel={reel}
        state={version.status}
        message={version.status === 'error' ? version.message : undefined}
        version={version.status === 'ready' ? version.version : undefined}
        comments={comments.comments}
        section={version.status === 'ready' && hasSections(version.version.sections) ? (version.version.sections.find((s) => s.id === sectionId) ?? null) : null}
        edits={edits}
        transcription={transcription}
      />
    );
  }
  return (
    <main className="main">
      <ReadyNotice version={readyVersion} onOpen={onOpenVersion} />
      {version.status === 'ready' ? (
        <Storyboard
          key={`${reel.slug}/${version.version.number}`}
          slug={reel.slug}
          version={version.version}
          newest={newest ?? version.version.number}
          comments={comments.comments}
          sectionId={sectionId}
          onSection={onSection}
          save={comments.save}
          reveal={reveal}
          issues={issues}
        />
      ) : version.status === 'loading' ? (
        <div className="state">Loading…</div>
      ) : version.status === 'error' ? (
        <Empty>{`Could not read the storyboard. ${version.message}`}</Empty>
      ) : (
        <Empty>
          {transcription?.state === 'running'
            ? `${reel.title} is being transcribed. Its storyboard appears when v1 is built.`
            : `${reel.title} has no versions yet. Ask your agent for a storyboard to add one.`}
        </Empty>
      )}
    </main>
  );
}

/** A reel's versions, reloaded whenever `refresh` changes. Null until the current reel's list has arrived. */
function useReelVersions(slug: string | undefined, refresh: number): VersionEntry[] | null {
  const [loaded, setLoaded] = useState<{ slug: string; entries: VersionEntry[] } | null>(null);

  useEffect(() => {
    if (slug === undefined) return;
    let current = true;
    fetchVersions(slug).then(
      (entries) => current && setLoaded({ slug, entries }),
      () => current && setLoaded({ slug, entries: [] }),
    );
    return () => {
      current = false;
    };
  }, [slug, refresh]);

  return loaded !== null && loaded.slug === slug ? loaded.entries : null;
}

/** Loads the version the reviewer has chosen. Only the reviewer changes it. */
function useVersion(slug: string | undefined, number: number | undefined, noVersions: boolean, refresh: number): VersionLoad {
  const [load, setLoad] = useState<VersionLoad>({ status: 'none' });

  useEffect(() => {
    if (slug === undefined || number === undefined) return;
    let current = true;
    // A refresh reads the version again without taking it off the screen.
    setLoad((prev) => (prev.status === 'ready' && prev.slug === slug && prev.version.number === number ? prev : { status: 'loading' }));
    fetchVersion(slug, number).then(
      (version) => current && setLoad({ status: 'ready', slug, version }),
      (err: unknown) => current && setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not reach the server' }),
    );
    return () => {
      current = false;
    };
  }, [slug, number, refresh]);

  if (slug === undefined || (number === undefined && noVersions)) return { status: 'none' };
  if (number === undefined) return { status: 'loading' };
  // Until the effect runs for a newly chosen reel or version, the previous one must not show.
  return load.status === 'ready' && (load.slug !== slug || load.version.number !== number) ? { status: 'loading' } : load;
}

export function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [selected, setSelected] = useState<string | undefined>();
  /** The version on screen. Set to the newest when a reel is opened; after that only the reviewer changes it. */
  const [chosen, setChosen] = useState<number | undefined>();
  const [ready, setReady] = useState<ReadonlySet<number>>(new Set());
  const [versionsTick, setVersionsTick] = useState(0);
  const [commentsTick, setCommentsTick] = useState(0);
  const reel = load.status === 'ready' ? load.listing.reels.find((r) => r.slug === selected) : undefined;
  const entries = useReelVersions(reel?.slug, versionsTick);
  const newest = entries?.find((e) => e.isNewest)?.number;
  const [versionTick, setVersionTick] = useState(0);
  const version = useVersion(reel?.slug, chosen, entries !== null && entries.length === 0, versionTick);
  const openVersion = version.status === 'ready' ? version.version : undefined;
  const comments = useComments(openVersion ? reel?.slug : undefined, openVersion?.number, commentsTick);
  const edits = useEdits(reel?.slug, versionsTick + commentsTick);
  const [transcribed, setTranscribed] = useState<{ slug: string; progress: TranscriptionProgress | null } | null>(null);
  const transcription = transcribed !== null && transcribed.slug === reel?.slug ? transcribed.progress : null;
  const note = useNote(openVersion ? reel?.slug : undefined, openVersion?.number);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // The section on screen is kept per reel and version, so opening another one starts on its first section.
  const [pickedSection, setPickedSection] = useState<{ key: string; id: string } | null>(null);
  const versionKey = openVersion ? `${reel?.slug}/${openVersion.number}` : null;
  const sectionId =
    openVersion === undefined ? '' : pickedSection?.key === versionKey && openVersion.sections.some((s) => s.id === pickedSection.id) ? pickedSection.id : openVersion.sections[0]!.id;
  const pickSection = useCallback(
    (id: string) => {
      if (versionKey !== null) setPickedSection({ key: versionKey, id });
    },
    [versionKey],
  );
  const issues = useVersionIssues(openVersion, openVersion && reel ? versionPageUrl(reel.slug, openVersion.number) : '');
  const multiSection = openVersion !== undefined && hasSections(openVersion.sections);

  const [phase, setPhase] = useState<Phase>('Storyboard');
  const [creating, setCreating] = useState(false);

  const openReel = useCallback((slug: string) => {
    setCreating(false);
    setSelected(slug);
    setChosen(undefined);
    setReady(new Set());
    setPhase(lastTab(slug) ?? 'Storyboard');
  }, []);

  const openVersionNumber = useCallback((number: number) => {
    setChosen(number);
    setReady((prev) => new Set([...prev].filter((n) => n > number)));
  }, []);

  useEffect(() => {
    Promise.all([fetchProject(), fetchReels()])
      .then(([project, listing]) => {
        setLoad({ status: 'ready', project: project.name, listing });
        const first = listing.reels[0]?.slug;
        if (first !== undefined) openReel(first);
      })
      .catch((err: unknown) => setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not reach the server' }));
  }, [openReel]);

  // A reel Kinotta just started: it joins the list, then opens in Review.
  const reelStarted = useCallback(
    (slug: string) => {
      fetchReels().then(
        (listing) => setLoad((prev) => (prev.status === 'ready' ? { ...prev, listing } : prev)),
        () => undefined,
      );
      openReel(slug);
      setPhase('Review');
      rememberTab(slug, 'Review');
    },
    [openReel],
  );

  // A reel started from a brief joins the list as waiting and opens on its waiting page.
  const briefStarted = useCallback(
    (slug: string) => {
      fetchReels().then(
        (listing) => setLoad((prev) => (prev.status === 'ready' ? { ...prev, listing } : prev)),
        () => undefined,
      );
      openReel(slug);
    },
    [openReel],
  );

  // Opening a reel selects its newest version, once. Later changes to the list never move the selection.
  useEffect(() => {
    if (chosen === undefined && entries !== null && newest !== undefined) setChosen(newest);
  }, [chosen, entries, newest]);

  // A reel appearing in an empty project is opened; one already open is left alone.
  useEffect(() => {
    if (load.status === 'ready' && selected === undefined && load.listing.reels[0]) openReel(load.listing.reels[0].slug);
  }, [load, selected, openReel]);

  // A reel opened while its transcription runs picks up where it is; after that events carry it.
  const openSlug = reel?.slug;
  useEffect(() => {
    if (openSlug === undefined) return;
    let live = true;
    fetchTranscription(openSlug).then(
      (progress) => live && setTranscribed((prev) => (prev?.slug === openSlug && prev.progress !== null && progress === null ? prev : { slug: openSlug, progress })),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [openSlug]);

  const current = useRef({ slug: reel?.slug, version: chosen, waiting: false });
  current.current = { slug: reel?.slug, version: chosen, waiting: reel?.brief !== undefined && reel.newestVersion === null };

  useEffect(() => {
    const refreshListing = (): void => {
      fetchReels().then(
        (listing) => setLoad((prev) => (prev.status === 'ready' ? { ...prev, listing } : prev)),
        () => undefined,
      );
    };
    return subscribe((event: ProjectEvent) => {
      if (event.type === 'reels-changed') {
        refreshListing();
      } else if (event.type === 'version-added') {
        refreshListing();
        if (event.reel === current.current.slug) {
          // The shot list a brief reel was waiting for: it opens in Storyboard.
          if (current.current.waiting) {
            setPhase('Storyboard');
            rememberTab(event.reel, 'Storyboard');
          }
          setVersionsTick((n) => n + 1);
          setReady((prev) => new Set([...prev, event.version]));
        }
      } else if (event.type === 'transcription-progress') {
        setTranscribed({ slug: event.reel, progress: event.progress });
      } else if (event.reel === current.current.slug && event.version === current.current.version) {
        setCommentsTick((n) => n + 1);
      }
    });
  }, []);

  if (load.status !== 'ready') {
    return (
      <div className="app">
        <TopBar reel={undefined} version={undefined} commentCount={0} frozen={false} />
        <div className="state">{load.status === 'loading' ? 'Loading…' : `Could not load reels. ${load.message}`}</div>
      </div>
    );
  }

  const readyVersion =
    [...ready].filter((n) => openVersion === undefined || n > openVersion.number).sort((a, b) => b - a)[0] ?? null;
  // A reel with no version yet (its transcript is still coming in) can be cut and snipped; Save waits for v1.
  const awaitingV1 = reel !== undefined && openVersion === undefined && version.status === 'none' && edits.list !== null && edits.list.stale !== true;
  const frozen = openVersion !== undefined && newest !== undefined && openVersion.number !== newest;

  const commentsPanel = (
    <CommentsPanel
      version={openVersion?.number}
      newest={newest}
      state={comments}
      note={note}
      onOpenComment={(comment: Comment, opener: HTMLElement) =>
        setReveal((prev) => ({ commentId: comment.id, seq: (prev?.seq ?? 0) + 1, opener }))
      }
      section={
        multiSection
          ? {
              number: sectionNumber(openVersion.sections.findIndex((s) => s.id === sectionId)),
              shots: new Set(openVersion.shots.filter((s) => s.section === sectionId).map((s) => s.number)),
            }
          : null
      }
    />
  );

  return (
    <div className="app">
      <TopBar
        reel={reel}
        version={openVersion}
        commentCount={multiSection ? (pinCounts(comments.comments, openVersion.shots).get(sectionId) ?? 0) : comments.comments.length}
        note={note}
        frozen={frozen}
        issues={issues}
        onCopied={() => setVersionTick((n) => n + 1)}
        phase={creating ? undefined : phase}
        onPhase={(next) => {
          setCreating(false);
          setPhase(next);
          if (reel) rememberTab(reel.slug, next);
        }}
        section={multiSection ? { id: sectionId, number: sectionNumber(openVersion.sections.findIndex((s) => s.id === sectionId)) } : null}
      />
      <div className="body">
        <Rail
          project={load.project}
          listing={load.listing}
          current={reel?.slug}
          sections={multiSection ? { version: openVersion, comments: comments.comments, selected: sectionId, onSelect: pickSection } : null}
          versions={{
            entries: entries ?? [],
            selected: chosen,
            ready,
            sectionIds: multiSection ? openVersion.sections.map((s) => s.id) : null,
            onOpenVersion: openVersionNumber,
          }}
          onOpen={openReel}
          creating={creating}
          onNewReel={() => setCreating(true)}
        />
        <Main
          project={load.project}
          listing={load.listing}
          reel={reel}
          version={version}
          newest={newest}
          readyVersion={readyVersion}
          onOpenVersion={openVersionNumber}
          comments={comments}
          reveal={reveal}
          sectionId={sectionId}
          onSection={pickSection}
          issues={issues}
          phase={phase}
          creating={creating}
          onStarted={reelStarted}
          edits={edits}
          transcription={transcription}
          onBriefStarted={briefStarted}
        />
        {phase === 'Review' && !creating ? (
          <ReviewSide
            edits={edits}
            pieces={openVersion?.pieces}
            clips={openVersion?.clips}
            editable={(openVersion?.isNewest === true && (openVersion.pieces !== undefined || openVersion.code !== undefined) && edits.list?.stale !== true) || awaitingV1}
            awaitingV1={awaitingV1}
            codeOnly={openVersion?.code !== undefined}
            nextVersion={(newest ?? 0) + 1}
            commentCount={comments.comments.length}
            onSaved={openVersionNumber}
            comments={commentsPanel}
          />
        ) : (
          commentsPanel
        )}
      </div>
    </div>
  );
}
