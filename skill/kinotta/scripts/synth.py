#!/usr/bin/env python3
"""Synthesized music score and sound effects generator.

Generates beat-synced music beds and sound effects catalogue using pure numpy/scipy math.
Deterministic: same inputs and seed give identical bytes. Headroom: bed peak near -6 dBFS,
effects well below full scale (< -3 dBFS). 48 kHz, 16-bit WAV.

Usage:
  python synth.py effects <out-dir>
  python synth.py score <plan.json> <out-dir> [--tempo N] [--seed N]
"""

import argparse
import json
import math
import os
import pathlib
import sys
import zlib
from dataclasses import dataclass
import numpy as np
import scipy.io.wavfile
import scipy.signal

RATE = 48000
EFFECT_PEAK_DBFS = -4.5
PEAK_CEILING_DBFS = -3.0


def to_i16(samples: np.ndarray, peak_dbfs: float = EFFECT_PEAK_DBFS) -> np.ndarray:
    """Normalize float audio to target peak dBFS and convert to signed 16-bit PCM."""
    max_val = np.max(np.abs(samples))
    if max_val < 1e-9:
        return np.zeros(len(samples), dtype=np.int16)
    target_amp = 10.0 ** (peak_dbfs / 20.0)
    scaled = samples * (target_amp / max_val)
    return np.clip(scaled * 32767.0, -32768, 32767).astype(np.int16)


def measure_peak_dbfs(i16_samples: np.ndarray) -> float:
    """Measure peak amplitude in dBFS relative to 32767."""
    max_val = int(np.max(np.abs(i16_samples)))
    if max_val == 0:
        return -96.0
    return float(20.0 * np.log10(max_val / 32767.0))


def butter_bandpass_filter(data: np.ndarray, lowcut: float, highcut: float, fs: int = RATE, order: int = 2) -> np.ndarray:
    nyq = 0.5 * fs
    low = max(10.0, lowcut) / nyq
    high = min(nyq - 10.0, highcut) / nyq
    if low >= high:
        low = high * 0.5
    b, a = scipy.signal.butter(order, [low, high], btype='band')
    return scipy.signal.lfilter(b, a, data)


def butter_lowpass_filter(data: np.ndarray, cutoff: float, fs: int = RATE, order: int = 2) -> np.ndarray:
    nyq = 0.5 * fs
    cut = min(nyq - 10.0, max(10.0, cutoff)) / nyq
    b, a = scipy.signal.butter(order, cut, btype='low')
    return scipy.signal.lfilter(b, a, data)


def butter_highpass_filter(data: np.ndarray, cutoff: float, fs: int = RATE, order: int = 2) -> np.ndarray:
    nyq = 0.5 * fs
    cut = min(nyq - 10.0, max(10.0, cutoff)) / nyq
    b, a = scipy.signal.butter(order, cut, btype='high')
    return scipy.signal.lfilter(b, a, data)


# ---------------------------------------------------------------------------
# Per-hit sound settings
# ---------------------------------------------------------------------------

# Every setting runs 0..1 and 0.5 is the catalogue recipe, so a hit with no settings
# sounds exactly like the committed catalogue WAV.
NEUTRAL_SETTING = 0.5
# Octaves covered from setting 0 to setting 1 (0.5 is no change): pitch moves a recipe's
# frequencies, length stretches its envelopes and timings.
PITCH_SPAN_OCTAVES = 1.0
LENGTH_SPAN_OCTAVES = 1.0
# Brightness and weight blend a filtered copy of the effect. Cutoffs in Hz.
BRIGHT_CUTOFF_HZ = 3000.0
DARK_CUTOFF_HZ = 1500.0
WEIGHT_CUTOFF_HZ = 200.0
LIGHT_CUTOFF_HZ = 250.0
BRIGHT_BOOST = 1.0
WEIGHT_BOOST = 1.5
DARK_MAX_MIX = 0.9
LIGHT_MAX_MIX = 0.8
SETTING_NAMES = ("pitch", "length", "brightness", "weight")


def clamp_unit(value: float) -> float:
    return min(1.0, max(0.0, float(value)))


@dataclass(frozen=True)
class Sound:
    """How one hit is shaped: four 0..1 settings, clamped so every effect stays inside its headroom."""
    pitch: float = NEUTRAL_SETTING
    length: float = NEUTRAL_SETTING
    brightness: float = NEUTRAL_SETTING
    weight: float = NEUTRAL_SETTING

    @property
    def pitch_ratio(self) -> float:
        return 2.0 ** ((clamp_unit(self.pitch) - NEUTRAL_SETTING) * PITCH_SPAN_OCTAVES)

    @property
    def length_ratio(self) -> float:
        return 2.0 ** ((clamp_unit(self.length) - NEUTRAL_SETTING) * LENGTH_SPAN_OCTAVES)


NEUTRAL_SOUND = Sound()


def finish(samples: np.ndarray, sound: Sound, peak_dbfs: float = EFFECT_PEAK_DBFS) -> np.ndarray:
    """Apply brightness and weight, then normalise to the recipe's own peak (so settings never raise the level)."""
    out = samples
    brightness = clamp_unit(sound.brightness)
    weight = clamp_unit(sound.weight)
    if brightness > NEUTRAL_SETTING:
        out = out + (brightness - NEUTRAL_SETTING) * 2.0 * BRIGHT_BOOST * butter_highpass_filter(out, BRIGHT_CUTOFF_HZ)
    elif brightness < NEUTRAL_SETTING:
        mix = (NEUTRAL_SETTING - brightness) * 2.0 * DARK_MAX_MIX
        out = (1.0 - mix) * out + mix * butter_lowpass_filter(out, DARK_CUTOFF_HZ)
    if weight > NEUTRAL_SETTING:
        out = out + (weight - NEUTRAL_SETTING) * 2.0 * WEIGHT_BOOST * butter_lowpass_filter(out, WEIGHT_CUTOFF_HZ)
    elif weight < NEUTRAL_SETTING:
        mix = (NEUTRAL_SETTING - weight) * 2.0 * LIGHT_MAX_MIX
        out = (1.0 - mix) * out + mix * butter_highpass_filter(out, LIGHT_CUTOFF_HZ)
    return to_i16(out, peak_dbfs=peak_dbfs)


def sound_from_input(raw: object) -> tuple[str | None, str | None, Sound]:
    """Read a hit's `sound` object: its kind, its id and its settings (missing or non-numeric ones stay neutral)."""
    if not isinstance(raw, dict):
        return None, None, NEUTRAL_SOUND
    values = {}
    for name in SETTING_NAMES:
        value = raw.get(name)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
            values[name] = clamp_unit(value)
    kind = raw.get("kind")
    ident = raw.get("id")
    return (kind if isinstance(kind, str) else None, str(ident) if ident not in (None, "") else None, Sound(**values))


def hit_seed(base_seed: int, hit_id: str) -> int:
    """A stable seed from the hit's id, so the same hit sounds the same wherever it sits in the list."""
    return zlib.crc32(f"{base_seed}:{hit_id}".encode("utf-8")) & 0x7FFFFFFF


# ---------------------------------------------------------------------------
# Effect Recipes
# ---------------------------------------------------------------------------

def synth_chime(seed: int = 101, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Soft melodic chime — pentatonic bell chord with shimmering partials."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 2.2 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    out = np.zeros(n_samples, dtype=np.float64)

    # Chime notes: E5, G#5, B5, E6
    notes = [
        (659.25 * pitch, 0.0, 0.7 * length),
        (830.61 * pitch, 0.05 * length, 0.65 * length),
        (987.77 * pitch, 0.11 * length, 0.6 * length),
        (1318.51 * pitch, 0.18 * length, 0.55 * length),
    ]
    partials = [(1.0, 1.0), (2.756, 0.32), (5.404, 0.12)]

    for f0, start_t, decay_tau in notes:
        idx = int(start_t * RATE)
        sub_t = t[idx:] - start_t
        env = np.exp(-sub_t / decay_tau)
        att_len = int(0.005 * RATE)
        if len(env) > att_len:
            env[:att_len] *= 0.5 * (1.0 - np.cos(np.pi * np.arange(att_len) / att_len))
        tone = np.zeros(len(sub_t), dtype=np.float64)
        for p_ratio, p_amp in partials:
            tone += p_amp * np.sin(2.0 * np.pi * (f0 * p_ratio) * sub_t)
        out[idx:] += tone * env

    return finish(out, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_click(seed: int = 102, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Crisp UI click — tactile high transient with damped body."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 0.08 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    noise = rng.standard_normal(n_samples)
    noise_filt = butter_bandpass_filter(noise, 2500.0 * pitch, 7500.0 * pitch)
    noise_env = np.exp(-t / (0.0025 * length))
    body = np.sin(2.0 * np.pi * 1800.0 * pitch * t) * np.exp(-t / (0.007 * length))
    out = 0.7 * (noise_filt * noise_env) + 0.3 * body
    return finish(out, sound, peak_dbfs=-5.0)


def synth_error(seed: int = 103, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Negative / error tone — two-stage low dissonant rejection buzz."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 0.75 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    out = np.zeros(n_samples, dtype=np.float64)

    # Pulse 1: 0.0 to 0.22s, F#3 (185 Hz) + C3 (131 Hz)
    idx1 = 0
    len1 = int(0.22 * length * RATE)
    t1 = t[idx1:idx1 + len1]
    saw1 = scipy.signal.sawtooth(2.0 * np.pi * 185.0 * pitch * t1) + 0.8 * scipy.signal.sawtooth(2.0 * np.pi * 131.0 * pitch * t1)
    env1 = np.exp(-t1 / (0.12 * length))
    att1 = int(0.004 * RATE)
    env1[:att1] *= np.linspace(0.0, 1.0, att1)
    out[idx1:idx1 + len1] += saw1 * env1

    # Pulse 2: 0.28 to 0.55s, slightly lower E3 (165 Hz) + Bb2 (116 Hz)
    idx2 = int(0.28 * length * RATE)
    len2 = int(0.27 * length * RATE)
    t2 = t[:len2]
    saw2 = scipy.signal.sawtooth(2.0 * np.pi * 165.0 * pitch * t2) + 0.8 * scipy.signal.sawtooth(2.0 * np.pi * 116.0 * pitch * t2)
    env2 = np.exp(-t2 / (0.15 * length))
    att2 = int(0.004 * RATE)
    env2[:att2] *= np.linspace(0.0, 1.0, att2)
    out[idx2:idx2 + len2] += saw2 * env2

    filtered = butter_lowpass_filter(out, 650.0 * pitch)
    return finish(filtered, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_glitch_1(seed: int = 104, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Punchy digital glitch — rapid FM chirp with bit-decimation transient."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 0.55 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    # Carrier frequency modulation
    carrier_f = pitch * (750.0 + 400.0 * np.sin(2.0 * np.pi * 14.0 * t))
    mod_f = 220.0 * pitch
    mod_index = 4.0 * np.exp(-t / (0.15 * length))
    phi = 2.0 * np.pi * np.cumsum(carrier_f) / RATE + mod_index * np.sin(2.0 * np.pi * mod_f * t)
    tone = np.sin(phi)

    # Digital step hold / decimation
    step = 8
    held = np.repeat(tone[::step], step)[:n_samples]

    # Initial punch click
    noise = rng.standard_normal(n_samples)
    click = butter_bandpass_filter(noise, 1500.0 * pitch, 6000.0 * pitch) * np.exp(-t / 0.015)

    env = np.exp(-t / (0.22 * length))
    out = 0.7 * (held * env) + 0.3 * click
    return finish(out, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_glitch_2(seed: int = 105, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Harsh, longer glitch — stuttering ring-modulated burst with frequency hops."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 1.2 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    noise = rng.standard_normal(n_samples)
    mod = np.sign(np.sin(2.0 * np.pi * 95.0 * pitch * t))
    ring = noise * mod

    # Rhythm gate: 5 bursts
    gate = np.zeros(n_samples)
    bursts = [(start * length, end * length) for start, end in [(0.0, 0.12), (0.16, 0.30), (0.35, 0.52), (0.58, 0.82), (0.88, 1.10)]]
    for start, end in bursts:
        i0, i1 = int(start * RATE), int(end * RATE)
        seg_len = i1 - i0
        gate[i0:i1] = 0.5 * (1.0 - np.cos(2.0 * np.pi * np.arange(seg_len) / seg_len))

    # Stepped resonance
    f_hops = [freq * pitch for freq in [450.0, 1400.0, 750.0, 2200.0, 600.0]]
    out = np.zeros(n_samples)
    for (start, end), freq in zip(bursts, f_hops):
        i0, i1 = int(start * RATE), int(end * RATE)
        seg = ring[i0:i1] * gate[i0:i1]
        bp = butter_bandpass_filter(seg, freq * 0.7, freq * 1.4)
        out[i0:i1] += bp

    return finish(out, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_glitch_3(seed: int = 106, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Low-key glitch texture — subtle micro-clicks and low FM murmur."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 1.0 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    out = np.zeros(n_samples)
    # Subtle digital clicks
    click_times = [ct * length for ct in [0.05, 0.18, 0.31, 0.44, 0.62, 0.75, 0.88]]
    for ct in click_times:
        i0 = int(ct * RATE)
        c_len = int(0.008 * RATE)
        if i0 + c_len < n_samples:
            c_noise = rng.standard_normal(c_len)
            c_bp = butter_bandpass_filter(c_noise, 2000.0 * pitch, 5000.0 * pitch)
            c_env = np.exp(-np.arange(c_len) / (0.002 * RATE))
            out[i0:i0 + c_len] += c_bp * c_env * 0.4

    # Low FM texture
    sub_fm = np.sin(2.0 * np.pi * 65.0 * pitch * t + 1.2 * np.sin(2.0 * np.pi * 18.0 * t))
    sub_env = np.sin(np.pi * t / dur) ** 2.0
    out += 0.3 * sub_fm * sub_env

    return finish(out, sound, peak_dbfs=-6.0)


def synth_impact_bass_1(seed: int = 107, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Bass impact hit — punchy snap landing on a deep decaying sub drop."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 1.8 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    # Sub drop: 130 Hz down to 38 Hz
    freq = pitch * (38.0 + (130.0 - 38.0) * np.exp(-t / 0.08))
    phi = 2.0 * np.pi * np.cumsum(freq) / RATE
    sub = np.sin(phi) + 0.2 * np.sin(2.0 * phi)
    sub_env = np.exp(-t / (0.45 * length))
    att = int(0.003 * RATE)
    sub_env[:att] *= np.linspace(0.0, 1.0, att)

    # Punch transient
    noise = rng.standard_normal(n_samples)
    snap = butter_bandpass_filter(noise, 800.0 * pitch, 3500.0 * pitch) * np.exp(-t / 0.012)

    combined = (sub * sub_env) + 0.4 * snap
    saturated = np.tanh(1.3 * combined)
    return finish(saturated, sound, peak_dbfs=-4.0)


def synth_impact_bass_2(seed: int = 108, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Bass impact with short swell — 0.4s reverse build into heavy sub landing."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 2.4 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    out = np.zeros(n_samples)
    swell_dur = 0.4 * length
    n_swell = int(swell_dur * RATE)
    t_swell = t[:n_swell]

    # Reverse swell: rising noise and sub
    noise = rng.standard_normal(n_swell)
    swell_filt = butter_bandpass_filter(noise, 250.0 * pitch, 1400.0 * pitch)
    swell_env = (t_swell / swell_dur) ** 2.5
    out[:n_swell] += 0.6 * swell_filt * swell_env

    # Impact at swell_dur
    t_hit = t[n_swell:] - swell_dur
    freq = pitch * (42.0 + (145.0 - 42.0) * np.exp(-t_hit / 0.09))
    phi = 2.0 * np.pi * np.cumsum(freq) / RATE
    sub = np.sin(phi) + 0.22 * np.sin(2.0 * phi)
    sub_env = np.exp(-t_hit / (0.5 * length))
    att = int(0.003 * RATE)
    sub_env[:att] *= np.linspace(0.0, 1.0, att)

    hit_noise = rng.standard_normal(len(t_hit))
    hit_snap = butter_bandpass_filter(hit_noise, 700.0 * pitch, 4000.0 * pitch) * np.exp(-t_hit / 0.015)

    hit_combined = (sub * sub_env) + 0.35 * hit_snap
    out[n_swell:] += hit_combined

    saturated = np.tanh(1.2 * out)
    return finish(saturated, sound, peak_dbfs=-4.0)


def synth_key_press(seed: int = 109, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Single key press — tactile switch click and keycap bottom-out thud."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 0.12 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    # High switch click
    noise = rng.standard_normal(n_samples)
    click = butter_bandpass_filter(noise, 3200.0 * pitch, 6500.0 * pitch) * np.exp(-t / 0.0025)

    # Keycap bottom-out thud: damped sine
    thud = np.sin(2.0 * np.pi * 310.0 * pitch * t) * np.exp(-t / (0.018 * length))
    combined = 0.6 * click + 0.4 * thud
    return finish(combined, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_notification(seed: int = 110, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Notification chime — uplifting two-note bell chime (F5 -> C6)."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 1.4 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    out = np.zeros(n_samples)

    notes = [(698.46 * pitch, 0.0, 0.45 * length), (1046.5 * pitch, 0.12 * length, 0.75 * length)]
    for f0, start_t, decay_tau in notes:
        idx = int(start_t * RATE)
        sub_t = t[idx:] - start_t
        env = np.exp(-sub_t / decay_tau)
        att = int(0.004 * RATE)
        if len(env) > att:
            env[:att] *= 0.5 * (1.0 - np.cos(np.pi * np.arange(att) / att))
        tone = np.sin(2.0 * np.pi * f0 * sub_t) + 0.22 * np.sin(2.0 * np.pi * (2.0 * f0) * sub_t) + 0.08 * np.sin(2.0 * np.pi * (3.0 * f0) * sub_t)
        out[idx:] += tone * env

    return finish(out, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_ping(seed: int = 111, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Sharp electronic ping — high crystal accent with smooth exponential decay."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 1.0 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)

    freq = pitch * (2150.0 + 550.0 * np.exp(-t / 0.008))
    phi = 2.0 * np.pi * np.cumsum(freq) / RATE
    tone = np.sin(phi) + 0.12 * np.sin(2.0 * phi)
    env = np.exp(-t / (0.3 * length))
    att = int(0.001 * RATE)
    env[:att] *= np.linspace(0.0, 1.0, att)

    return finish(tone * env, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_pop(seed: int = 112, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Quick pop — fast upward pitch sweep with tight decay."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 0.10 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)

    freq = pitch * (180.0 + (720.0 - 180.0) * (1.0 - np.exp(-t / 0.018)))
    phi = 2.0 * np.pi * np.cumsum(freq) / RATE
    env = np.exp(-t / (0.024 * length))
    att = int(0.002 * RATE)
    env[:att] *= np.linspace(0.0, 1.0, att)

    return finish(np.sin(phi) * env, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_riser(seed: int = 113, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Long cinematic riser (~6s build, peak at the end)."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 6.0 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    # Exponential pitch sweep from 60 Hz to 2800 Hz
    freq = pitch * 60.0 * (2800.0 / 60.0) ** (t / dur)
    phi = 2.0 * np.pi * np.cumsum(freq) / RATE
    saw = scipy.signal.sawtooth(phi) + 0.5 * np.sin(phi)

    # Sweeping filtered noise layer
    noise = rng.standard_normal(n_samples)
    noise_filt = butter_bandpass_filter(noise, 250.0 * pitch, 6000.0 * pitch)

    # Tremolo accelerating from 2 Hz to 18 Hz
    trem_freq = 2.0 + 16.0 * (t / dur) ** 2.0
    trem_phi = 2.0 * np.pi * np.cumsum(trem_freq) / RATE
    trem = 0.5 * (1.0 + np.sin(trem_phi))

    swell = (t / dur) ** 2.2
    combined = (0.65 * saw + 0.35 * noise_filt) * swell * (0.6 + 0.4 * trem)

    # Crisp cut at end with tiny 4 ms fadeout
    fade_len = int(0.004 * RATE)
    combined[-fade_len:] *= np.linspace(1.0, 0.0, fade_len)
    return finish(combined, sound, peak_dbfs=-4.0)


def synth_sparkle(seed: int = 114, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Bright sparkle / shimmer — cascading cluster of high bell chimes."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 1.6 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    out = np.zeros(n_samples)

    frequencies = [freq * pitch for freq in [2489.0, 3136.0, 3729.0, 4400.0, 4978.0, 5588.0, 6272.0, 7458.0]]
    starts = [st * length for st in [0.0, 0.05, 0.11, 0.17, 0.24, 0.32, 0.40, 0.50]]

    for f0, st in zip(frequencies, starts):
        idx = int(st * RATE)
        sub_t = t[idx:] - st
        env = np.exp(-sub_t / (0.45 * length))
        att = int(0.003 * RATE)
        if len(env) > att:
            env[:att] *= np.linspace(0.0, 1.0, att)
        # Vibrato shimmer
        vibrato = 1.0 + 0.004 * np.sin(2.0 * np.pi * 12.0 * sub_t)
        phi = 2.0 * np.pi * (f0 * vibrato) * sub_t
        tone = np.sin(phi) + 0.15 * np.sin(2.0 * phi)
        out[idx:] += tone * env

    return finish(out, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_typing(seed: int = 115, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Typing burst (~1.5s of keys) — rhythmic keystroke sequence."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 1.5 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    out = np.zeros(n_samples)
    rng = np.random.default_rng(seed)

    key_times = [kt * length for kt in [0.0, 0.10, 0.22, 0.35, 0.46, 0.58, 0.73, 0.88, 1.02, 1.15, 1.30]]
    for i, kt in enumerate(key_times):
        idx = int(kt * RATE)
        k_dur = 0.10
        k_samples = int(k_dur * RATE)
        if idx + k_samples <= n_samples:
            sub_t = np.linspace(0, k_dur, k_samples, endpoint=False)
            noise = rng.standard_normal(k_samples)
            click = butter_bandpass_filter(noise, (3000.0 + i * 80.0) * pitch, 6500.0 * pitch) * np.exp(-sub_t / 0.0025)
            key_pitch = (280.0 + (i % 4) * 25.0) * pitch
            thud = np.sin(2.0 * np.pi * key_pitch * sub_t) * np.exp(-sub_t / 0.018)
            out[idx:idx + k_samples] += 0.55 * click + 0.45 * thud

    return finish(out, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_whoosh(seed: int = 116, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Punchy whoosh/impact — fast swept transition accent."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 0.50 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    noise = rng.standard_normal(n_samples)
    # Filter with swept center frequency
    bp = butter_bandpass_filter(noise, 400.0 * pitch, 3200.0 * pitch)
    env = (np.sin(np.pi * t / dur)) ** 2.2
    return finish(bp * env, sound, peak_dbfs=EFFECT_PEAK_DBFS)


def synth_whoosh_cinematic(seed: int = 117, sound: Sound = NEUTRAL_SOUND) -> np.ndarray:
    """Cinematic whoosh build (~3.5s) — sweeping scene transition."""
    pitch, length = sound.pitch_ratio, sound.length_ratio
    dur = 3.5 * length
    n_samples = int(dur * RATE)
    t = np.linspace(0, dur, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    peak_t = 2.4 * length
    noise = rng.standard_normal(n_samples)
    bp = butter_bandpass_filter(noise, 250.0 * pitch, 3800.0 * pitch)

    # Asymmetric bell envelope peaking at peak_t
    env = np.zeros(n_samples)
    mask_up = t <= peak_t
    env[mask_up] = (t[mask_up] / peak_t) ** 2.5
    mask_down = t > peak_t
    env[mask_down] = np.exp(-(t[mask_down] - peak_t) / (0.4 * length))

    # Sub underlay swell
    sub = np.sin(2.0 * np.pi * 55.0 * pitch * t) * env * 0.4
    combined = (bp * env) + sub
    return finish(combined, sound, peak_dbfs=-4.0)


CATALOGUE_RECIPES = {
    "chime": (synth_chime, "Soft melodic chime — gentle positive beat: success/confirmation or a lighthearted transition. Sync to the visual moment."),
    "click": (synth_click, "Crisp UI click — button press, toggle, selection. Short accent, sync exactly to the on-screen action."),
    "error": (synth_error, "Negative / error tone — failure state, a 'wrong' beat, or a glitchy interruption."),
    "glitch-1": (synth_glitch_1, "Punchy digital glitch — hard-cut accent or sudden reveal. Trigger on the hit; let the decay bleed into the next shot (J-cut)."),
    "glitch-2": (synth_glitch_2, "Harsh, longer glitch — chaotic / jarring transition or a distorted reveal."),
    "glitch-3": (synth_glitch_3, "Low-key glitch texture — subtle digital shift, minimal transition that sits under other audio."),
    "impact-bass-1": (synth_impact_bass_1, "Bass impact hit — logo/hero snap, headline slam. Trigger on the visual landing; decay carries into the next shot (J-cut)."),
    "impact-bass-2": (synth_impact_bass_2, "Bass impact with a short swell — brief anticipation then a deep hit. Place so the peak lands on the reveal."),
    "key-press": (synth_key_press, "Single key press — one keystroke / terminal-input beat. Short accent, sync to the typed character."),
    "notification": (synth_notification, "Notification chime — alert, message-in, toast/badge appears. Sync to the element entering."),
    "ping": (synth_ping, "Sharp electronic ping — punchy accent on a key reveal or data point. Sync to the beat."),
    "pop": (synth_pop, "Quick pop — element appear/spawn, chip/tag/badge in. Small precise accent, sync to the pop-in."),
    "riser": (synth_riser, "Long cinematic riser (~6s build, peak at the end). Trigger at (climax_time - 6.0s) so it crests exactly on the reveal."),
    "sparkle": (synth_sparkle, "Bright sparkle / shimmer — magical reveal or 'shine' highlight on a hero element. Sync to the highlight."),
    "typing": (synth_typing, "Typing burst (~1.5s of keys) — keyboard / code typing reveal, text-being-typed beat. Start as the text begins typing."),
    "whoosh": (synth_whoosh, "Punchy whoosh/impact — fast reveal or hard transition accent. Sync to the motion."),
    "whoosh-cinematic": (synth_whoosh_cinematic, "Cinematic whoosh build (~3.5s) — sweeping scene transition. Align so the swell peaks on the cut."),
}


# ---------------------------------------------------------------------------
# Score Mode Components (Bed & Hit Stems)
# ---------------------------------------------------------------------------

def synth_bed(duration: float, tempo: float, seed: int = 42) -> np.ndarray:
    """Generate electronic music bed stem with sidechain ducking under the kick."""
    n_samples = int(math.ceil(duration * RATE))
    t = np.linspace(0, duration, n_samples, endpoint=False)
    rng = np.random.default_rng(seed)

    spb = 60.0 / tempo  # seconds per beat
    bar_sec = 4.0 * spb

    # Master stem buffer
    kick_track = np.zeros(n_samples)
    snare_track = np.zeros(n_samples)
    hat_track = np.zeros(n_samples)
    bass_track = np.zeros(n_samples)
    pad_track = np.zeros(n_samples)
    arp_track = np.zeros(n_samples)
    duck_envelope = np.ones(n_samples)

    # 1. Kick drum (four on the floor or 1 and 3)
    # Four-on-the-floor driving pulse
    num_beats = int(math.ceil(duration / spb))
    for b in range(num_beats):
        t_hit = b * spb
        if t_hit >= duration:
            break
        i0 = int(t_hit * RATE)
        k_dur = 0.35
        k_samples = min(int(k_dur * RATE), n_samples - i0)
        sub_t = t[i0:i0 + k_samples] - t_hit

        # Kick pitch drop
        f_kick = 42.0 + (140.0 - 42.0) * np.exp(-sub_t / 0.04)
        phi_kick = 2.0 * np.pi * np.cumsum(f_kick) / RATE
        k_body = np.sin(phi_kick) * np.exp(-sub_t / 0.12)
        # Click
        k_click = np.sin(2.0 * np.pi * 900.0 * sub_t) * np.exp(-sub_t / 0.005)
        kick_track[i0:i0 + k_samples] += 0.85 * k_body + 0.25 * k_click

        # Sidechain ducking: dip by ~12 dB (factor of ~0.25) and recover over 160 ms
        duck_samples = min(int(0.20 * RATE), n_samples - i0)
        duck_t = sub_t[:duck_samples]
        duck_curve = 0.25 + 0.75 * (1.0 - np.exp(-duck_t / 0.05))
        duck_envelope[i0:i0 + duck_samples] = np.minimum(duck_envelope[i0:i0 + duck_samples], duck_curve)

    # 2. Snare / Clap (on beats 2 and 4)
    for b in range(num_beats):
        if (b % 4) in (1, 3):
            t_hit = b * spb
            if t_hit >= duration:
                break
            i0 = int(t_hit * RATE)
            s_dur = 0.25
            s_samples = min(int(s_dur * RATE), n_samples - i0)
            sub_t = t[i0:i0 + s_samples] - t_hit
            s_noise = rng.standard_normal(s_samples)
            s_filt = butter_highpass_filter(s_noise, 800.0) * np.exp(-sub_t / 0.08)
            s_body = np.sin(2.0 * np.pi * 190.0 * sub_t) * np.exp(-sub_t / 0.04)
            snare_track[i0:i0 + s_samples] += 0.6 * s_filt + 0.4 * s_body

    # 3. Hi-hats (16th notes with accent on 8th offbeats)
    num_16ths = int(math.ceil(duration / (spb * 0.25)))
    for n in range(num_16ths):
        t_hit = n * (spb * 0.25)
        if t_hit >= duration:
            break
        i0 = int(t_hit * RATE)
        h_dur = 0.04 if (n % 2 == 0) else 0.08
        h_samples = min(int(h_dur * RATE), n_samples - i0)
        sub_t = t[i0:i0 + h_samples] - t_hit
        h_noise = rng.standard_normal(h_samples)
        h_filt = butter_bandpass_filter(h_noise, 6500.0, 14000.0)
        accent = 0.8 if (n % 4 == 2) else (0.5 if (n % 2 == 0) else 0.35)
        hat_track[i0:i0 + h_samples] += accent * h_filt * np.exp(-sub_t / (0.015 if h_dur == 0.04 else 0.035))

    # 4. Chord Progression: Dm - Bb - F - C
    # Roots in Hz: D2=73.42, Bb1=58.27, F1=43.65, C2=65.41
    # Chord triads:
    # Dm: D3(146.83), F3(174.61), A3(220.0)
    # Bb: Bb2(116.54), D3(146.83), F3(174.61)
    # F:  F2(87.31), A2(110.0), C3(130.81)
    # C:  C3(130.81), E3(164.81), G3(196.0)
    chords = [
        {"root": 73.42, "notes": [146.83, 174.61, 220.0]},
        {"root": 58.27, "notes": [116.54, 146.83, 174.61]},
        {"root": 43.65, "notes": [87.31, 110.0, 130.81]},
        {"root": 65.41, "notes": [130.81, 164.81, 196.0]},
    ]

    # Synth Bass & Warm Pad
    num_bars = int(math.ceil(duration / bar_sec))
    for bar in range(num_bars):
        chord = chords[bar % len(chords)]
        t_bar = bar * bar_sec
        i_bar0 = int(t_bar * RATE)
        i_bar1 = min(n_samples, int((t_bar + bar_sec) * RATE))
        bar_len = i_bar1 - i_bar0
        if bar_len <= 0:
            break
        sub_t = t[i_bar0:i_bar1] - t_bar

        # Pad: detuned sines + lowpass
        pad_sig = np.zeros(bar_len)
        for freq in chord["notes"]:
            pad_sig += np.sin(2.0 * np.pi * freq * sub_t)
            pad_sig += 0.5 * np.sin(2.0 * np.pi * (freq * 1.004) * sub_t)
            pad_sig += 0.5 * np.sin(2.0 * np.pi * (freq * 0.996) * sub_t)
        # Pad envelope: smooth attack & release
        pad_env = np.ones(bar_len)
        att_p = min(bar_len // 4, int(0.18 * RATE))
        if att_p > 0:
            pad_env[:att_p] = np.linspace(0.0, 1.0, att_p)
            pad_env[-att_p:] = np.linspace(1.0, 0.0, att_p)
        pad_track[i_bar0:i_bar1] += butter_lowpass_filter(pad_sig * pad_env, 900.0)

        # Bass: 16th note rhythm (driving syncopated notes on 0, 3, 6, 8, 10, 12, 14)
        bass_pattern = [0, 3, 6, 8, 10, 12, 14]
        for sixteenth in bass_pattern:
            t_note = t_bar + sixteenth * (spb * 0.25)
            if t_note >= duration:
                break
            i_b0 = int(t_note * RATE)
            b_dur = spb * 0.24
            b_samples = min(int(b_dur * RATE), n_samples - i_b0)
            if b_samples <= 0:
                continue
            b_sub_t = t[i_b0:i_b0 + b_samples] - t_note
            root = chord["root"]
            saw = scipy.signal.sawtooth(2.0 * np.pi * root * b_sub_t)
            sine = np.sin(2.0 * np.pi * root * b_sub_t)
            b_env = np.exp(-b_sub_t / (b_dur * 0.6))
            bass_track[i_b0:i_b0 + b_samples] += (0.6 * sine + 0.4 * saw) * b_env

        # Arp: 16th note melodic sequence over chord tones
        notes = chord["notes"] + [chord["notes"][0] * 2.0]
        for sixteenth in range(16):
            t_arp = t_bar + sixteenth * (spb * 0.25)
            if t_arp >= duration:
                break
            i_a0 = int(t_arp * RATE)
            a_dur = spb * 0.22
            a_samples = min(int(a_dur * RATE), n_samples - i_a0)
            if a_samples <= 0:
                continue
            a_sub_t = t[i_a0:i_a0 + a_samples] - t_arp
            freq = notes[sixteenth % len(notes)]
            pluck = np.sin(2.0 * np.pi * freq * a_sub_t) * np.exp(-a_sub_t / 0.04)
            arp_track[i_a0:i_a0 + a_samples] += pluck

    # Duck pad and bass under kick
    pad_ducked = pad_track * duck_envelope
    bass_ducked = bass_track * duck_envelope

    # Combine stems into the bed stem
    bed = (
        0.75 * kick_track
        + 0.55 * snare_track
        + 0.35 * hat_track
        + 0.70 * bass_ducked
        + 0.40 * pad_ducked
        + 0.28 * arp_track
    )

    # Fade out very end gracefully if needed
    fade_samples = min(int(0.04 * RATE), n_samples)
    if fade_samples > 0:
        bed[-fade_samples:] *= np.linspace(1.0, 0.0, fade_samples)

    # Target headroom: bed peak near -6.0 dBFS
    return to_i16(bed, peak_dbfs=-6.0)


def extract_cuts_and_hits(plan: dict) -> tuple[float, float, list[float], list[dict]]:
    """Extract duration, fps, cuts, and hits from a Kinotta plan.json."""
    duration = float(plan.get("duration", 0))

    # FPS extraction
    fps_raw = plan.get("fps", 30)
    if isinstance(fps_raw, str):
        if "/" in fps_raw:
            num, denom = fps_raw.split("/")
            fps = float(num) / float(denom)
        else:
            fps = float(fps_raw)
    else:
        fps = float(fps_raw)
    if fps <= 0:
        fps = 30.0

    cuts: list[float] = []
    if "cuts" in plan and isinstance(plan["cuts"], list):
        for c in plan["cuts"]:
            if isinstance(c, (int, float)):
                cuts.append(float(c))
            elif isinstance(c, dict) and "at" in c:
                cuts.append(float(c["at"]))
            elif isinstance(c, dict) and "time" in c:
                cuts.append(float(c["time"]))
    elif "clips" in plan and isinstance(plan["clips"], list):
        for c in plan["clips"]:
            cin = float(c.get("in", 0))
            if cin > 0:
                cuts.append(cin)
            cout = float(c.get("out", 0))
            if cout > duration:
                duration = cout
    elif "media" in plan and isinstance(plan["media"], dict):
        media = plan["media"]
        seq = media.get("sequence", [])
        placements = {p["id"]: p for p in media.get("placements", []) if "id" in p}
        curr = 0.0
        for pid in seq:
            p = placements.get(pid)
            if p:
                dur = float(p.get("out", 0)) - float(p.get("in", 0))
                if dur <= 0:
                    dur = float(p.get("duration", 0))
                if curr > 0:
                    cuts.append(curr)
                curr += dur
        if duration <= 0:
            duration = curr

    cuts = sorted(set(cuts))
    if duration <= 0:
        duration = 12.0

    # Hits extraction
    hits: list[dict] = []
    if "hits" in plan and isinstance(plan["hits"], list):
        for h in plan["hits"]:
            if isinstance(h, (int, float)):
                hits.append({"at": float(h), "effect": None, "sound": None})
            elif isinstance(h, dict):
                t_val = h.get("at", h.get("time", h.get("cut", 0.0)))
                hits.append({"at": float(t_val), "effect": h.get("effect"), "sound": h.get("sound") if isinstance(h.get("sound"), dict) else None})
    else:
        # If no explicit hits, derive one hit per cut
        for c in cuts:
            hits.append({"at": c, "effect": None, "sound": None})

    return duration, fps, cuts, hits


# ---------------------------------------------------------------------------
# CLI Commands: effects and score
# ---------------------------------------------------------------------------

def run_effects(out_dir: pathlib.Path) -> None:
    """Render effects catalogue and write manifest.json."""
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}

    for effect_id, (generator_fn, desc) in sorted(CATALOGUE_RECIPES.items()):
        samples = generator_fn()
        filename = f"{effect_id}.wav"
        filepath = out_dir / filename
        scipy.io.wavfile.write(str(filepath), RATE, samples)

        duration = round(float(len(samples)) / float(RATE), 2)
        peak_dbfs = measure_peak_dbfs(samples)
        if peak_dbfs >= PEAK_CEILING_DBFS:
            raise RuntimeError(f"Effect {effect_id} peaks at {peak_dbfs:.2f} dBFS, which violates < -3 dBFS!")

        manifest[effect_id] = {
            "file": filename,
            "duration": duration,
            "description": desc,
        }

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Rendered {len(manifest)} catalogue effects to {out_dir}", file=sys.stderr)


def run_score(plan_path: pathlib.Path, out_dir: pathlib.Path, tempo: float = 120.0, seed: int = 42) -> None:
    """Generate bed stem and hit stems for a reel plan, printing placement-add operations."""
    if not plan_path.is_file():
        raise FileNotFoundError(f"Plan file not found: {plan_path}")

    plan_text = plan_path.read_text(encoding="utf-8")
    plan = json.loads(plan_text)
    out_dir.mkdir(parents=True, exist_ok=True)

    duration, fps, cuts, hits = extract_cuts_and_hits(plan)
    dt_frame = 1.0 / fps

    # 1. Render Bed Stem
    bed_samples = synth_bed(duration, tempo, seed=seed)
    bed_filename = "bed.wav"
    bed_filepath = out_dir / bed_filename
    scipy.io.wavfile.write(str(bed_filepath), RATE, bed_samples)

    bed_dur = round(float(len(bed_samples)) / float(RATE), 3)
    spb = 60.0 / tempo
    num_beats = int(math.floor(duration / spb)) + 1
    beats_list = [round(i * spb, 6) for i in range(num_beats) if i * spb < duration]
    downbeats_list = beats_list[0::4]

    # Calculate relative paths for placement
    try:
        bed_rel_path = os.path.relpath(bed_filepath, plan_path.parent).replace("\\", "/")
    except ValueError:
        bed_rel_path = bed_filepath.as_posix()

    operations = []
    tracks = plan.get("media", {}).get("tracks", [])
    track_ids = {track["id"] for track in tracks}
    next_order = max((track["order"] for track in tracks), default=-1) + 1
    for track_id, name in [("music", "Music"), ("sfx", "Sound effects")]:
        if track_id not in track_ids:
            operations.append({
                "kind": "track-add",
                "track": {"id": track_id, "name": name, "order": next_order, "gain": 1, "mute": False},
            })
            next_order += 1

    # Bed placement-add operation
    bed_op = {
        "kind": "placement-add",
        "source": {
            "id": "score-bed",
            "kind": "audio",
            "path": bed_rel_path,
            "duration": bed_dur,
            "beats": {
                "tempo": tempo,
                "beats": beats_list,
                "downbeats": downbeats_list,
            },
        },
        "placement": {
            "id": "score-bed",
            "role": "audio",
            "source": "score-bed",
            "track": "music",
            "in": 0,
            "out": bed_dur,
            "at": 0,
            "gain": 0.8,
        },
    }
    operations.append(bed_op)

    # 2. Render Hit Stems
    hit_effect_cycle = ["whoosh", "impact-bass-1", "pop", "ping", "chime"]

    for i, hit in enumerate(hits):
        hit_at = float(hit["at"])
        # Quantize starting time to the nearest video frame: guarantees starting within 1 frame of cut
        hit_frame_at = round(round(hit_at * fps) / fps, 4)

        sound_kind, sound_id, sound = sound_from_input(hit.get("sound"))
        effect_name = sound_kind if sound_kind in CATALOGUE_RECIPES else hit.get("effect")
        if not effect_name or effect_name not in CATALOGUE_RECIPES:
            effect_name = hit_effect_cycle[i % len(hit_effect_cycle)]

        gen_fn, _ = CATALOGUE_RECIPES[effect_name]
        # A hit with a `sound` object gets its seed from its id; older plans keep the positional seed.
        if hit.get("sound") is not None:
            hit_samples = gen_fn(seed=hit_seed(seed, sound_id or f"hit-{i+1:02d}"), sound=sound)
        else:
            hit_samples = gen_fn(seed=seed + 1000 + i)
        hit_filename = f"hit-{i+1:02d}.wav"
        hit_filepath = out_dir / hit_filename
        scipy.io.wavfile.write(str(hit_filepath), RATE, hit_samples)

        hit_dur = round(float(len(hit_samples)) / float(RATE), 3)
        try:
            hit_rel_path = os.path.relpath(hit_filepath, plan_path.parent).replace("\\", "/")
        except ValueError:
            hit_rel_path = hit_filepath.as_posix()

        stem_id = f"hit-{i+1:02d}"
        hit_op = {
            "kind": "placement-add",
            "source": {
                "id": stem_id,
                "kind": "audio",
                "path": hit_rel_path,
                "duration": hit_dur,
            },
            "placement": {
                "id": stem_id,
                "role": "audio",
                "source": stem_id,
                "track": "sfx",
                "in": 0,
                "out": hit_dur,
                "at": hit_frame_at,
                "gain": 0.35,
            },
        }
        operations.append(hit_op)

    # Output operations to stdout (one JSON per line)
    for op in operations:
        sys.stdout.write(json.dumps(op) + "\n")
    sys.stdout.flush()

    print(
        f"Wrote bed ({bed_dur}s) and {len(hits)} hit stems to {out_dir}",
        file=sys.stderr,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest="command", required=True)

    # effects command
    p_effects = subparsers.add_parser("effects", help="Render sound effects catalogue and manifest")
    p_effects.add_argument("out_dir", type=pathlib.Path, help="Directory to save catalogue WAVs and manifest.json")

    # score command
    p_score = subparsers.add_parser("score", help="Generate score bed and hit stems from a reel plan")
    p_score.add_argument("plan", type=pathlib.Path, help="Path to reel plan.json")
    p_score.add_argument("out_dir", type=pathlib.Path, help="Directory to save score stems")
    p_score.add_argument("--tempo", type=float, default=120.0, help="Tempo in BPM (default: 120)")
    p_score.add_argument("--seed", type=int, default=42, help="RNG seed for deterministic generation (default: 42)")

    args = parser.parse_args()

    if args.command == "effects":
        run_effects(args.out_dir)
    elif args.command == "score":
        run_score(args.plan, args.out_dir, tempo=args.tempo, seed=args.seed)


if __name__ == "__main__":
    main()
