import { useEffect, useRef, useState } from 'react';

/** Thumbnail requests start only when this clip is in the timeline viewport. */
export function ClipStills({ source, start, end, duration, loop, url }: { source: string; start: number; end: number; duration: number; loop?: boolean; url(source: string, time: number): string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current!;
    const resize = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width)); resize.observe(el);
    const seen = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { root: el.closest('.rv-tracks-pane') }); seen.observe(el);
    return () => { resize.disconnect(); seen.disconnect(); };
  }, []);
  const count = visible && width > 96 ? Math.min(12, Math.ceil(width / 96)) : 0;
  return <span className="native-stills" ref={ref} aria-hidden="true">{Array.from({ length: count }, (_, index) => {
    const local = index / count * duration; const range = end - start;
    const time = start + (loop && range > 0 ? local % range : Math.min(local, Math.max(0, range - 0.001)));
    return <img key={`${source}:${time}`} src={url(source, time)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}/>
  })}</span>;
}
