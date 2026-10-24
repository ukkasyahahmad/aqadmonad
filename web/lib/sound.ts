"use client";

// Gavel knocks synthesised with WebAudio (no audio files). Browsers only allow sound after a
// user gesture, so the screen's "Sound on" button creates the AudioContext.
let ctx: AudioContext | null = null;

export function enableSound(): boolean {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

function knock(at: number, gain = 0.9) {
  if (!ctx) return;
  // Low wooden thump
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, at);
  osc.frequency.exponentialRampToValueAtTime(60, at + 0.12);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
  osc.connect(g).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.2);
  // Short noise click for the strike
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const n = ctx.createBufferSource();
  const ng = ctx.createGain();
  n.buffer = buf;
  ng.gain.setValueAtTime(gain * 0.5, at);
  n.connect(ng).connect(ctx.destination);
  n.start(at);
}

/** Three knocks: "going, going, gone". */
export function playGavel() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  knock(t, 0.7);
  knock(t + 0.45, 0.8);
  knock(t + 0.9, 1);
}

/** A single light tick for each new bid. */
export function playBidTick() {
  if (!ctx) return;
  knock(ctx.currentTime + 0.01, 0.35);
}
