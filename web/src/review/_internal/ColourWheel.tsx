import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { GRADE_SPEC } from '../../../../server/core/model.ts';
import type { GradeRgb, GradeValues } from '../../../../server/core/model.ts';

const WHEEL_REACH = 0.4;
const TAU3 = 2 * Math.PI / 3;
export type WheelKey = 'shadowsColor' | 'midtonesColor' | 'highlightsColor';
export type ScalarKey = Exclude<keyof GradeValues, WheelKey>;

export function puckFromRgb(value: GradeRgb): [number, number] {
  let x = value.reduce((sum, channel, i) => sum + channel * Math.sin(i * TAU3), 0) / (1.5 * WHEEL_REACH);
  let y = -value.reduce((sum, channel, i) => sum + channel * Math.cos(i * TAU3), 0) / (1.5 * WHEEL_REACH);
  const radius = Math.hypot(x, y);
  if (radius > 1) { x /= radius; y /= radius; }
  return [x, y];
}

export function rgbFromPuck([x, y]: [number, number], current: GradeRgb = GRADE_SPEC.shadowsColor.default, spec = GRADE_SPEC.shadowsColor): GradeRgb {
  const radius = Math.min(1, Math.hypot(x, y));
  const angle = Math.atan2(x, -y);
  const mean = (current[0] + current[1] + current[2]) / 3;
  const red = Math.round(radius * WHEEL_REACH * Math.cos(angle) * 1000) / 1000;
  const green = Math.round(radius * WHEEL_REACH * Math.cos(angle - TAU3) * 1000) / 1000;
  const chroma = [red, green, -red - green];
  const room = (channel: number) => channel > 0 ? (spec.max - mean) / channel : channel < 0 ? (spec.min - mean) / channel : Infinity;
  const scale = Math.max(0, Math.min(1, ...chroma.map(room)));
  return chroma.map((channel) => mean + channel * scale) as GradeRgb;
}

interface GestureProps {
  disabled: boolean;
  disabledReason?: string;
  touched: boolean;
  onCommit(delay?: number): void;
  onReset(): void;
}

export function ColourScrub({ gradeKey, label, value, disabled, disabledReason, touched, onChange, onCommit, onReset }: GestureProps & { gradeKey: ScalarKey; label: string; value: number; onChange(value: number): void }) {
  const spec = GRADE_SPEC[gradeKey];
  const named = (name: string) => disabled && disabledReason ? `${name}, ${disabledReason}` : name;
  const step = spec.max > 10 ? 50 : 0.001;
  const digits = gradeKey === 'temperature' ? 0 : gradeKey === 'blacks' || gradeKey === 'whites' ? 3 : 2;
  const [input, setInput] = useState<{ value: number; text: string } | null>(null);
  const start = useRef(value);
  const dragged = useRef(false);
  const clamp = (v: number) => Math.max(spec.min, Math.min(spec.max, Math.round(v / step) * step));
  const at = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange(clamp(spec.min + (event.clientX - bounds.left) / bounds.width * (spec.max - spec.min)));
  };
  const pct = (v: number) => (v - spec.min) / (spec.max - spec.min) * 100;
  const neutral = pct(spec.default);
  const position = pct(value);
  return <div className={`rv-colour-field${touched ? ' rv-agent-touched' : ''}`} data-key={gradeKey}>
    <span>{label}</span>
    <div className="rv-colour-scrub" role="slider" tabIndex={disabled ? -1 : 0} aria-label={named(label)} aria-disabled={disabled} aria-valuemin={spec.min} aria-valuemax={spec.max} aria-valuenow={value}
      onPointerDown={(event) => { if (disabled || event.button !== 0) return; start.current = value; dragged.current = false; event.currentTarget.setPointerCapture(event.pointerId); at(event); }}
      onPointerMove={(event) => { if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) { dragged.current = true; at(event); } }}
      onPointerUp={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; event.currentTarget.releasePointerCapture(event.pointerId); onCommit(dragged.current ? 0 : 250); }}
      onPointerCancel={() => { if (!disabled) { onChange(start.current); onCommit(); } }}
      onDoubleClick={() => { if (!disabled) onReset(); }}
      onKeyDown={(event) => {
        if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        onChange(event.key === 'Home' ? spec.min : event.key === 'End' ? spec.max : clamp(value + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -step : step) * (event.shiftKey ? 10 : 1)));
        onCommit(400);
      }}>
      <i style={{ left: `${Math.min(position, neutral)}%`, width: `${Math.abs(position - neutral)}%` }} />
      <span className="rv-colour-zero" style={{ left: `${neutral}%` }} />
      <b style={{ left: `${position}%` }} />
    </div>
    <input className="rv-colour-number" aria-label={named(`${label} value`)} type="number" min={spec.min} max={spec.max} step={step} value={input?.value === value ? input.text : value.toFixed(digits)} disabled={disabled}
      onChange={(event) => { const text = event.target.value; if (text !== '' && Number.isFinite(event.target.valueAsNumber)) { const next = clamp(event.target.valueAsNumber); setInput({ value: next, text }); onChange(next); onCommit(400); } else setInput({ value, text }); }}
      onBlur={() => { setInput(null); onCommit(); }} onDoubleClick={onReset} />
  </div>;
}

export function ColourWheel({ title, gradeKey, value, disabled, disabledReason, touched, onChange, onCommit, onReset }: GestureProps & { title: string; gradeKey: WheelKey; value: GradeRgb; onChange(value: GradeRgb): void }) {
  const [x, y] = puckFromRgb(value);
  const name = `${title} colour`;
  const start = useRef(value);
  const dragged = useRef(false);
  const at = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange(rgbFromPuck([(event.clientX - bounds.left) / bounds.width * 2 - 1, (event.clientY - bounds.top) / bounds.height * 2 - 1], start.current, GRADE_SPEC[gradeKey]));
  };
  return <>
    <h2>{title} <small>{gradeKey === 'shadowsColor' ? 'colorbalance rs gs bs' : gradeKey === 'midtonesColor' ? 'colorbalance rm gm bm' : 'colorbalance rh gh bh'}</small></h2>
    <div className={`rv-colour-wheel${touched ? ' rv-agent-touched' : ''}`} role="group" aria-label={disabled && disabledReason ? `${name}, ${disabledReason}` : name} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} data-key={gradeKey} data-puck={`${x.toFixed(3)},${y.toFixed(3)}`}
      onPointerDown={(event) => { if (disabled || event.button !== 0) return; start.current = value; dragged.current = false; event.currentTarget.setPointerCapture(event.pointerId); at(event); }}
      onPointerMove={(event) => { if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) { dragged.current = true; at(event); } }}
      onPointerUp={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; event.currentTarget.releasePointerCapture(event.pointerId); onCommit(dragged.current ? 0 : 250); }}
      onPointerCancel={() => { if (!disabled) onCommit(); }}
      onDoubleClick={() => { if (!disabled) onReset(); }}
      onKeyDown={(event) => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (disabled || !delta) return;
        event.preventDefault(); event.stopPropagation();
        onChange(rgbFromPuck([x + delta[0] * 0.05, y + delta[1] * 0.05], value, GRADE_SPEC[gradeKey])); onCommit(400);
      }}>
      <span className="rv-colour-puck" style={{ left: `${50 + x * 44}%`, top: `${50 + y * 44}%` }} />
    </div>
    <output className="rv-colour-rgb" aria-label={`${title} RGB`}>{value.map((v) => `${v < 0 ? '' : '+'}${v.toFixed(2)}`).join(' ')}</output>
  </>;
}
