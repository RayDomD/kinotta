import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProject, fetchReels, fetchRenderJobs, fetchTranscription, fetchVersion, fetchWorkingVersion, fetchVersions, revealRender, subscribe, versionPageUrl } from './api/index.ts';
import type { Comment, ProjectEvent, ReelListing, ReelSummary, RenderJob, TranscriptionProgress, Version, VersionEntry } from './api/index.ts';
import { BUILT_BY_YOU } from '../../server/core/model.ts';
import { BriefWaiting } from './BriefReel.tsx';
import { CommentsPanel } from './CommentsPanel.tsx';
import { CopyButton } from './CopyButton.tsx';
import { Empty } from './Empty.tsx';
import { lastTab, rememberTab } from './lastTab.ts';
import { NewReel, NewReelSide } from './NewReel.tsx';
import { RenderMenu, RenderPlayer, VersionActions, outputFile, presetName } from './Renders.tsx';
import type { RenderMenuProps } from './Renders.tsx';
import { EditorIcon, EditorRail, EditorWorkspace, Review, ReviewSide, useEditorWorkspace, useEdits } from './review/index.ts';
import { afterPendingEdits } from './review/_internal/useEdits.ts';
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
import { SimpleMode, startsInSimpleMode } from './SimpleMode.tsx';
import { Library } from './Library.tsx';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; project: string; listing: ReelListing };

type VersionLoad =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; slug: string; version: Version };

const PHASES = ['Storyboard', 'Review'] as const;
type Phase = (typeof PHASES)[number];

function HexMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M4.5 8.5L14 14l9.5-5.5M14 14v11" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".6" />
    </svg>
  );
}

function topBarVerifyAttrs(choices: number) {
  return { 'data-verify-unit': 'TopBar', 'data-verify-choice-count': String(choices) };
}

function TopBar(props: {
  onSimple?(): void;
  onLibrary?(): void;
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
  /** The New reel screen is open: the bar names it instead of the reel left behind, and offers no batch to copy. */
  creating?: boolean;
  /** The render menu: the project's queue and the open reel's past renders, on every tab. Absent while loading. */
  renders?: RenderMenuProps;
}) {
  const { reel, version, commentCount, note, frozen, section = null, onCopied, issues, phase = null, onPhase, creating = false, renders } = props;
  const workspace = useEditorWorkspace();
  const choices = (version?.workingParts?.shots ?? version?.shots ?? []).filter((shot) => !shot.choiceMade && (shot.alternates?.filter((alternate) => !alternate.dismissed).length ?? 0) > 1).length;
  return (
    <header className="top" {...topBarVerifyAttrs(choices)}>
      <div className="brand"><HexMark />KINOTTA</div>
      <div className="reelname">
        {creating ? 'New reel' : reel?.title}
        {version && !creating && <span className="num">{formatDuration(version.duration)}</span>}
      </div>
      <nav className="modes" aria-label="Phase">
        {PHASES.map((name) => (
          <button key={name} type="button" aria-current={name === phase ? 'page' : undefined} onClick={() => onPhase?.(name)}>
            {name}
          </button>
        ))}
      </nav>
      {renders && <RenderMenu {...renders} />}
      {props.onSimple && <button type="button" className="c-act" onClick={props.onSimple}>Simple mode</button>}
      {props.onLibrary && <button type="button" className="c-act" onClick={props.onLibrary}>Library</button>}
      {choices > 0 && !creating && <span className="alternate-choice-count" aria-label="Shots needing a choice" role="status"><span className="num">{choices}</span>{` ${choices === 1 ? 'shot needs' : 'shots need'} a choice`}</span>}
      {reel && version && !creating && (
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
      <button type="button" className="editor-icon-button editor-gear" aria-label="Settings" title="Settings" onClick={() => workspace.setSettingsOpen(true)}><EditorIcon name="settings" /></button>
    </header>
  );
}

/** A render finished: like the version notice, with Play and Show in folder, over any tab until dismissed. */
function RenderReadyNotice({ job, title, onPlay, onDismiss }: { job: RenderJob; title: string; onPlay(file: string): void; onDismiss(): void }) {
  const file = outputFile(job);
  const [problem, setProblem] = useState('');
  return (
    <div className="notice render-ready" role="status" aria-label="Render ready">
      <span>{`${title} ${job.working ? 'Working' : `v${job.version}`} ${presetName(job.preset)} is ready.`}</span>
      {problem !== '' && <span className="meta">{problem}</span>}
      <span className="pk-actions">
        {file !== null && /\.mp4$/i.test(file) && (
          <button type="button" className="btn" onClick={() => onPlay(file)}>Play</button>
        )}
        {file !== null && (
          <button type="button" className="c-act" onClick={() => revealRender(job.reel, file).catch((err: unknown) => setProblem(err instanceof Error ? err.message : 'Could not reach the server'))}>
            Show in folder
          </button>
        )}
        <button type="button" className="c-act" onClick={onDismiss}>Dismiss</button>
      </span>
    </div>
  );
}

interface VersionRailProps {
  edits: EditsState;
  entries: VersionEntry[];
  selected: number | undefined;
  /** Versions an agent wrote since the reel was opened and the reviewer has not opened yet. */
  ready: ReadonlySet<number>;
  /** Section ids in the order the open version lists them, on a reel with several; the rail numbers changed sections by it. */
  sectionIds: string[] | null;
  onOpen(number: number): void;
  working: boolean;
  editsSinceFreeze: number;
  frozenVersion: number;
  onWorking(): void;
}

/** The current Working reel; frozen folders remain available to the storage API. */
function VersionRail({ working, editsSinceFreeze, frozenVersion, onWorking, edits }: VersionRailProps) {
  return <div><div className="label">Reel</div><nav className="versions" aria-label="Current reel" data-verify-unit="VersionRail" data-verify-working={String(working)} data-verify-count="0">
    <button type="button" data-working-row data-current-version={frozenVersion} aria-current={working ? 'true' : undefined} onClick={onWorking}>
      <span>Current<span className="rv-who">{editsSinceFreeze} {editsSinceFreeze === 1 ? 'edit' : 'edits'}</span></span>
    </button>
  </nav><div className="rv-undo" role="group" aria-label="Current reel history">
    <button type="button" className="c-act" disabled={edits.busy || !edits.list?.canUndo} onClick={() => void edits.undo()}>Undo</button>
    <button type="button" className="c-act" disabled={edits.busy || !edits.list?.canRedo} onClick={() => void edits.redo()}>Redo</button>
  </div></div>;
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
  reviewMode: boolean;
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
    <EditorRail reviewMode={props.reviewMode}>
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
      {sections !== null && !creating && <SectionRail {...sections} />}
      {current !== undefined && versions.entries.length > 0 && !creating && (
        <VersionRail
          edits={versions.edits}
          working={versions.working}
          editsSinceFreeze={versions.editsSinceFreeze}
          frozenVersion={versions.frozenVersion}
          onWorking={versions.onWorking}
          entries={versions.entries}
          selected={versions.selected}
          ready={versions.ready}
          sectionIds={versions.sectionIds}
          onOpen={versions.onOpenVersion}
        />
      )}
    </EditorRail>
  );
}

function ReadyNotice({ version, onOpen }: { version: number | null; onOpen(number: number): void }) {
  return (
    <div className="notice-slot" role="status">
      {version !== null && (
        <div className="notice">
          <span>An updated reel is ready.</span>
          <button type="button" className="btn" onClick={() => onOpen(version)}>View current</button>
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
  /** The reel's versions: the one on show carries its approval. */
  entries: VersionEntry[];
  /** The finished render Review is playing instead of the version, if any. */
  playingRender: string | null;
  onStopRender(): void;
  working: boolean;
  onWorking(): void;
  onFrozen(): void;
}

function Main(props: MainProps) {
  const { project, listing, reel, version, newest, readyVersion, onOpenVersion, comments, reveal, sectionId, onSection, issues, phase, creating, onStarted, edits, transcription, onBriefStarted, entries, playingRender, onStopRender, working, onWorking, onFrozen } = props;
  if (creating) return <NewReel project={project} onStarted={onStarted} onBriefStarted={onBriefStarted} />;
  if (listing.state === 'no-reels-folder') {
    return <main className="main"><Empty>{`No reels folder in ${project}. Ask your agent for a storyboard to create one.`}</Empty></main>;
  }
  if (listing.state === 'no-reels' || !reel) {
    return <main className="main"><Empty>{`The reels folder in ${project} has no reels yet. Ask your agent for a storyboard to add one.`}</Empty></main>;
  }
  if (reel.brief !== undefined && reel.newestVersion === null) return <BriefWaiting reel={{ ...reel, brief: reel.brief }} />;
  if (phase === 'Review') {
    const shown = version.status === 'ready' ? version.version : undefined;
    // A finished render plays in place of the version, with a way back to it.
    if (playingRender !== null) {
      return (
        <main className="main rv-main" aria-label="Review">
          <RenderPlayer slug={reel.slug} file={playingRender} version={shown?.number} onBack={onStopRender} />
        </main>
      );
    }
    return (
      <Review
        actions={shown && (
          <VersionActions
            slug={reel.slug}
            entry={entries.find((e) => e.number === shown.number)}
            footage={shown.footage !== undefined}
            working={working}
            nextVersion={(newest ?? shown.number) + (edits.list?.editsSinceFreeze ? 1 : 0)}
            onSaved={onFrozen}
          />
        )}
        frozen={!working}
        onWorking={onWorking}
        reel={reel}
        state={version.status}
        message={version.status === 'error' ? version.message : undefined}
        version={version.status === 'ready' ? version.version : undefined}
        comments={comments.comments}
        onSaveComment={comments.save}
        reveal={reveal}
        section={version.status === 'ready' && hasSections(version.version.sections) ? (version.version.sections.find((s) => s.id === sectionId) ?? null) : null}
        edits={edits}
        transcription={transcription}
      />
    );
  }
  return (
    <main className="main">
      <ReadyNotice version={readyVersion} onOpen={() => onWorking()} />
      {version.status === 'ready' ? (
        <Storyboard
          key={`${reel.slug}/${version.version.number}`}
          slug={reel.slug}
          edits={working ? edits : undefined}
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
function useVersion(slug: string | undefined, number: number | undefined, noVersions: boolean, refresh: number, working: boolean): VersionLoad {
  const [load, setLoad] = useState<VersionLoad>({ status: 'none' });

  useEffect(() => {
    if (slug === undefined || number === undefined) return;
    let current = true;
    // A refresh reads the version again without taking it off the screen.
    setLoad((prev) => (prev.status === 'ready' && prev.slug === slug && prev.version.number === number ? prev : { status: 'loading' }));
    (working ? fetchWorkingVersion(slug) : fetchVersion(slug, number)).then(
      (version) => current && setLoad({ status: 'ready', slug, version: working ? version : { ...version, isNewest: false } }),
      (err: unknown) => current && setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not reach the server' }),
    );
    return () => {
      current = false;
    };
  }, [slug, number, refresh, working]);

  if (slug === undefined || (number === undefined && noVersions)) return { status: 'none' };
  if (number === undefined) return { status: 'loading' };
  // Until the effect runs for a newly chosen reel or version, the previous one must not show.
  return load.status === 'ready' && (load.slug !== slug || load.version.number !== number || (load.version.workingBase !== undefined) !== working) ? { status: 'loading' } : load;
}

export function App() {
  return <EditorWorkspace><Studio /></EditorWorkspace>;
}

function Studio() {
  const [simple, setSimple] = useState(startsInSimpleMode);
  const [library, setLibrary] = useState(() => typeof window !== 'undefined' && (window.location.hash === '#library' || new URLSearchParams(window.location.search).get('page') === 'library'));

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#library') setLibrary(true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const changeMode = (next: boolean) => {
    try { sessionStorage.setItem('kinotta-mode', next ? 'simple' : 'editor'); } catch { /* The mode still works for this visit. */ }
    setSimple(next);
  };
  const workspace = useEditorWorkspace();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [selected, setSelected] = useState<string | undefined>();
  /** The version on screen. Set to the newest when a reel is opened; after that only the reviewer changes it. */
  const [chosen, setChosen] = useState<number | undefined>();
  const [working, setWorking] = useState(true);
  const [ready, setReady] = useState<ReadonlySet<number>>(new Set());
  const [versionsTick, setVersionsTick] = useState(0);
  const [commentsTick, setCommentsTick] = useState(0);
  const reel = load.status === 'ready' ? load.listing.reels.find((r) => r.slug === selected) : undefined;
  const entries = useReelVersions(reel?.slug, versionsTick);
  const newest = entries?.find((e) => e.isNewest)?.number;
  const [versionTick, setVersionTick] = useState(0);
  const version = useVersion(reel?.slug, chosen, entries !== null && entries.length === 0, versionTick, working);
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
  const issues = useVersionIssues(openVersion, openVersion && reel ? versionPageUrl(reel.slug, openVersion.workingBase ?? openVersion.number) : '');
  const multiSection = openVersion !== undefined && hasSections(openVersion.sections);

  const [phase, setPhase] = useState<Phase>('Storyboard');
  const [creating, setCreating] = useState(false);
  /** The finished render Review plays in place of the version; cleared when another reel or version opens. */
  const [playingRender, setPlayingRender] = useState<string | null>(null);
  const [rendersTick, setRendersTick] = useState(0);
  /** The project's render queue, in order: loaded once, then kept from render-progress events. */
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  /** The render that finished last, for the ready notice, until dismissed. */
  const [readyRender, setReadyRender] = useState<RenderJob | null>(null);
  /** The render that failed last, shown in the render menu until another is queued. */
  const [renderFailure, setRenderFailure] = useState<RenderJob | null>(null);

  const openReel = useCallback((slug: string) => {
    setCreating(false);
    setSelected(slug);
    setChosen(undefined);
    setWorking(true);
    setPlayingRender(null);
    setReady(new Set());
    setPhase(lastTab(slug) ?? 'Storyboard');
  }, []);

  const openVersionNumber = useCallback((number: number) => {
    setWorking(false);
    setChosen(number);
    setPlayingRender(null);
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

  useEffect(() => {
    fetchRenderJobs().then((loaded) => setJobs((prev) => (prev.length === 0 ? loaded : prev)), () => undefined);
  }, []);

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
    if ((working || chosen === undefined) && entries !== null && newest !== undefined) setChosen(newest);
  }, [chosen, entries, newest, working]);

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

  const current = useRef({ slug: reel?.slug, version: chosen, waiting: false, working });
  current.current = { slug: reel?.slug, version: chosen, waiting: reel?.brief !== undefined && reel.newestVersion === null, working };

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
      } else if (event.type === 'edits-changed') {
        // The save event can arrive before its HTTP reply. Keep the local preview until that reply settles.
        afterPendingEdits(event.reel, () => {
          if (event.reel !== current.current.slug) return;
          setVersionsTick((n) => n + 1);
          if (current.current.working) setVersionTick((n) => n + 1);
        });
      } else if (event.type === 'version-added') {
        refreshListing();
        if (event.reel === current.current.slug) {
          // The shot list a brief reel was waiting for: it opens in Storyboard.
          if (current.current.waiting) {
            setPhase('Storyboard');
            rememberTab(event.reel, 'Storyboard');
          }
          setVersionsTick((n) => n + 1);
          if (current.current.working) setVersionTick((n) => n + 1);
          setReady((prev) => new Set([...prev, event.version]));
        }
      } else if (event.type === 'transcription-progress') {
        setTranscribed({ slug: event.reel, progress: event.progress });

      } else if (event.type === 'render-progress') {
        const { job } = event;
        const over = job.state === 'done' || job.state === 'failed' || job.state === 'cancelled';
        // The queue keeps its order: a known job is updated in place, a new one joins the end, a finished one leaves.
        setJobs((prev) => {
          const known = prev.some((j) => j.id === job.id);
          if (over) return prev.filter((j) => j.id !== job.id);
          return known ? prev.map((j) => (j.id === job.id ? job : j)) : [...prev, job];
        });
        if (job.state === 'queued') setRenderFailure(null);
        if (job.state === 'failed') setRenderFailure(job);
        if (job.state === 'done') {
          setReadyRender(job);
          // A finished render of the open reel joins the render menu's past renders.
          if (job.reel === current.current.slug) setRendersTick((n) => n + 1);
        }
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
  const frozen = openVersion !== undefined && !working;

  if (library) return <Library reelTitle={reel?.title ?? 'The pin'} onBack={() => {
    setLibrary(false);
    if (typeof window !== 'undefined' && window.location.hash === '#library') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }} />;

  if (simple) return <SimpleMode listing={load.listing} reel={reel} version={openVersion} state={version.status} message={version.status === 'error' ? version.message : undefined} creating={creating}
    comments={comments} edits={edits} onOpen={openReel} onNew={() => setCreating(true)} onStarted={reelStarted}
    onEditor={() => { setWorking(true); setChosen(newest); setPhase('Review'); changeMode(false); }}
    onRefresh={() => { setVersionTick((tick) => tick + 1); setVersionsTick((tick) => tick + 1); setCommentsTick((tick) => tick + 1); }} />;

  const commentsPanel = (
    <CommentsPanel
      frozen={frozen}
      version={openVersion?.number}
      newest={newest}
      shots={openVersion?.workingParts?.shots ?? openVersion?.shots}
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
        onSimple={() => { setWorking(true); setChosen(newest); changeMode(true); }}
        onLibrary={() => setLibrary(true)}
        reel={reel}
        version={openVersion}
        commentCount={multiSection ? (pinCounts(comments.comments, openVersion.shots).get(sectionId) ?? 0) : comments.comments.length}
        note={note}
        frozen={frozen}
        issues={issues}
        onCopied={() => { setVersionTick((n) => n + 1); setVersionsTick((n) => n + 1); }}
        phase={creating ? undefined : phase}
        creating={creating}
        onPhase={(next) => {
          setCreating(false);
          setPhase(next);
          if (reel) rememberTab(reel.slug, next);
        }}
        section={multiSection ? { id: sectionId, number: sectionNumber(openVersion.sections.findIndex((s) => s.id === sectionId)) } : null}
        renders={{
          slug: creating ? undefined : reel?.slug,
          jobs,
          titles: new Map(load.listing.reels.map((r) => [r.slug, r.title])),
          failure: renderFailure,
          rendersTick,
          onPlay: (file) => {
            setPhase('Review');
            if (reel) rememberTab(reel.slug, 'Review');
            setPlayingRender(file);
          },
        }}
      />
      <div className="body" data-review-shell={String(phase === 'Review' && !creating)} data-parts-storyboard={String(phase === 'Storyboard' && !!openVersion?.parts && !creating)} data-focus={String(workspace.focus)} data-rail-open={String(workspace.railOpen)}>
        <Rail
          reviewMode={phase === 'Review' && !creating}
          project={load.project}
          listing={load.listing}
          current={reel?.slug}
          sections={multiSection ? { version: openVersion, comments: comments.comments, selected: sectionId, onSelect: pickSection } : null}
          versions={{
            edits,
            working,
            editsSinceFreeze: edits.list?.editsSinceFreeze ?? edits.list?.operations.length ?? 0,
            frozenVersion: edits.list?.frozen ?? newest ?? 0,
            onWorking: () => { setWorking(true); setChosen(newest); },
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
          working={working}
          onWorking={() => { setWorking(true); setChosen(newest); }}
          onFrozen={() => { setVersionsTick((n) => n + 1); setVersionTick((n) => n + 1); }}
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
          entries={entries ?? []}
          playingRender={playingRender}
          onStopRender={() => setPlayingRender(null)}
        />
        {creating ? (
          <NewReelSide />
        ) : phase === 'Review' ? (
          <ReviewSide
            edits={edits}
            pieces={openVersion?.pieces}
            clips={openVersion?.clips}
            editable={(openVersion?.isNewest === true && (openVersion.pieces !== undefined || openVersion.code !== undefined || openVersion.media !== undefined) && edits.list?.stale !== true) || awaitingV1}
            codeOnly={openVersion?.code !== undefined}
            media={openVersion?.media !== undefined || openVersion?.isNewest === true}
            commentCount={comments.comments.length}
            comments={commentsPanel}
          />
        ) : (
          commentsPanel
        )}
      </div>
      {readyRender !== null && (
        <RenderReadyNotice
          job={readyRender}
          title={load.listing.reels.find((r) => r.slug === readyRender.reel)?.title ?? readyRender.reel}
          onDismiss={() => setReadyRender(null)}
          onPlay={(file) => {
            if (readyRender.reel !== reel?.slug) openReel(readyRender.reel);
            setCreating(false);
            setPhase('Review');
            rememberTab(readyRender.reel, 'Review');
            setPlayingRender(file);
            setReadyRender(null);
          }}
        />
      )}
    </div>
  );
}
