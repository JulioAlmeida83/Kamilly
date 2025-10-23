import { useEffect, useMemo, useRef, useState } from "react";
import Soundfont from "soundfont-player";

/**
 * Kamilly Play — Acordes + Ritmos + Fretboard (dedos/pestana) + Sequência (dinâmica) + Afinadores
 * - Sequenciador linear com comprimento dinâmico, destaque do compasso atual e opção de loop
 * - Fretboard com números dos dedos e pestana (sem capotraste)
 * - Afinador de referência + afinador cromático (microfone)
 */

/** ===== Tipos ===== */
type Step = "D" | "U" | "-";
type Pattern = { id: string; label: string; steps: Step[]; accents?: number[] };
// shape: 6ª -> 1ª corda (E A D G B E). 'x' = abafada, 0 = solta, número = casa absoluta
type ShapeVal = number | "x";
type Shape = [ShapeVal, ShapeVal, ShapeVal, ShapeVal, ShapeVal, ShapeVal];
// dedos: 1=index,2=médio,3=anelar,4=mínimo (0/undefined = livre)
type Fingering = [number | undefined, number | undefined, number | undefined, number | undefined, number | undefined, number | undefined];
// pestana (barra)
type Barre = { finger: 1 | 2 | 3 | 4; fret: number; from: number; to: number };

type Voicing = { label: string; shape: Shape; fingers?: Fingering; barre?: Barre };
type ChordEntry = { name: string; variants: Voicing[] };

type InstrumentName =
  | "acoustic_guitar_steel"
  | "acoustic_guitar_nylon"
  | "electric_guitar_clean"
  | "electric_guitar_jazz"
  | "electric_guitar_muted"
  | "overdriven_guitar"
  | "distortion_guitar"
  | "acoustic_grand_piano";

/** ===== Afinação padrão EADGBE em MIDI (6ª->1ª) ===== */
const TUNING_MIDI = [40, 45, 50, 55, 59, 64] as const; // E2 A2 D3 G3 B3 E4
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

/** ===== Ritmos ===== */
const PATTERNS: Pattern[] = [
  { id: "down8", label: "D D D D D D D D", steps: ["D","D","D","D","D","D","D","D"], accents: [0,4] },
  { id: "folk1", label: "D - D U - U D U (Folk)", steps: ["D","-","D","U","-","U","D","U"], accents: [0,2,6] },
  { id: "pop1",  label: "D - U U - U - U (Pop)",  steps: ["D","-","U","U","-","U","-","U"], accents: [0,2,5] },
  { id: "rock1", label: "D D U - U D U - (Rock)", steps: ["D","D","U","-","U","D","U","-"], accents:[0,1,5] },
  { id: "reggae",label: "- U - U - U - U (Reggae)",steps: ["-","U","-","U","-","U","-","U"], accents: [1,3,5,7] },
  { id: "bossa", label: "D - D U - U - U (Bossa)", steps: ["D","-","D","U","-","U","-","U"], accents: [0,2,5] },
];

/** ===== Dicionário de acordes ===== */
const X = "x" as const;
const CHORDS: Record<string, ChordEntry> = {
  C: { name: "C (Dó maior)", variants: [
    { label: "Aberto x32010", shape: [X,3,2,0,1,0], fingers: [undefined,3,2,0,1,0] },
    { label: "C/G 332010",    shape: [3,3,2,0,1,0], fingers: [3,2,1,0,1,0] },
    { label: "Cadd9 x32033",  shape: [X,3,2,0,3,3], fingers: [undefined,3,2,0,3,4] },
    { label: "A-shape x35553",shape: [X,3,5,5,5,3], fingers: [undefined,1,3,4,4,1], barre: { finger:1, fret:3, from:1, to:5 } },
    { label: "E-shape 8-10-10-9-8-8", shape: [8,10,10,9,8,8], fingers: [1,3,4,2,1,1], barre: { finger:1, fret:8, from:0, to:5 } },
  ]},
  Cmaj7: { name: "Cmaj7 (Dó maior com sétima)", variants: [
    { label: "Aberto x32000", shape: [X,3,2,0,0,0], fingers: [undefined,3,2,0,0,0] },
    { label: "x35453", shape: [X,3,5,4,5,3], fingers: [undefined,1,3,2,4,1], barre: { finger:1, fret:3, from:1, to:5 } },
  ]},
  C7: { name: "C7 (Dó com sétima dominante)", variants: [
    { label: "Aberto x32310", shape: [X,3,2,3,1,0], fingers: [undefined,3,2,4,1,0] },
    { label: "x35353", shape: [X,3,5,3,5,3], fingers: [undefined,1,3,1,4,1], barre: { finger:1, fret:3, from:1, to:5 } },
  ]},
  Cm: { name: "Cm (Dó menor)", variants: [
    { label: "Barra x35543", shape: [X,3,5,5,4,3], fingers: [undefined,1,3,4,2,1], barre: { finger:1, fret:3, from:1, to:5 } },
    { label: "Cm7 8-10-8-8-8-8", shape: [8,10,8,8,8,8], fingers: [1,3,1,1,1,1], barre: { finger:1, fret:8, from:0, to:5 } },
  ]},
  Cm7: { name: "Cm7 (Dó menor com sétima)", variants: [
    { label: "Barra x35343", shape: [X,3,5,3,4,3], fingers: [undefined,1,3,1,2,1], barre: { finger:1, fret:3, from:1, to:5 } },
  ]},
  Cdim: { name: "Cdim (Dó diminuto)", variants: [
    { label: "xx1212", shape: [X,X,1,2,1,2], fingers: [undefined,undefined,1,3,2,4] },
    { label: "x34242", shape: [X,3,4,2,4,2], fingers: [undefined,3,4,1,4,1] },
  ]},
  D: { name: "D (Ré maior)", variants: [
    { label: "Aberto xx0232", shape: [X,X,0,2,3,2], fingers: [undefined,undefined,0,1,3,2] },
    { label: "D/F# 2x0232",   shape: [2,X,0,2,3,2], fingers: [2,undefined,0,1,3,2] },
    { label: "A-shape x57775",shape: [X,5,7,7,7,5], fingers: [undefined,1,3,4,4,1], barre: { finger:1, fret:5, from:1, to:5 } },
  ]},
  Dmaj7: { name: "Dmaj7 (Ré maior com sétima)", variants: [
    { label: "Aberto xx0222", shape: [X,X,0,2,2,2], fingers: [undefined,undefined,0,1,1,1] },
    { label: "x57675", shape: [X,5,7,6,7,5], fingers: [undefined,1,3,2,4,1], barre: { finger:1, fret:5, from:1, to:5 } },
  ]},
  D7: { name: "D7 (Ré com sétima dominante)", variants: [
    { label: "Aberto xx0212", shape: [X,X,0,2,1,2], fingers: [undefined,undefined,0,2,1,3] },
    { label: "x57575", shape: [X,5,7,5,7,5], fingers: [undefined,1,3,1,4,1], barre: { finger:1, fret:5, from:1, to:5 } },
  ]},
  Dm: { name: "Dm (Ré menor)", variants: [
    { label: "Aberto xx0231", shape: [X,X,0,2,3,1], fingers: [undefined,undefined,0,2,3,1] },
    { label: "A-shape x57765", shape: [X,5,7,7,6,5], fingers: [undefined,1,3,4,2,1], barre: { finger:1, fret:5, from:1, to:5 } },
  ]},
  Dm7: { name: "Dm7 (Ré menor com sétima)", variants: [
    { label: "Aberto xx0211", shape: [X,X,0,2,1,1], fingers: [undefined,undefined,0,2,1,1] },
    { label: "x57565", shape: [X,5,7,5,6,5], fingers: [undefined,1,3,1,2,1], barre: { finger:1, fret:5, from:1, to:5 } },
  ]},
  Ddim: { name: "Ddim (Ré diminuto)", variants: [
    { label: "xx0101", shape: [X,X,0,1,0,1], fingers: [undefined,undefined,0,1,0,2] },
    { label: "x56464", shape: [X,5,6,4,6,4], fingers: [undefined,2,3,1,4,1] },
  ]},
  E: { name: "E (Mi maior)", variants: [
    { label: "Aberto 022100", shape: [0,2,2,1,0,0], fingers: [0,2,3,1,0,0] },
    { label: "E/G# 4-2-2-1-0-0", shape: [4,2,2,1,0,0], fingers: [3,2,3,1,0,0] },
    { label: "E-shape 12-14-14-13-12-12", shape: [12,14,14,13,12,12], fingers: [1,3,4,2,1,1], barre: { finger:1, fret:12, from:0, to:5 } },
  ]},
  Emaj7: { name: "Emaj7 (Mi maior com sétima)", variants: [
    { label: "Aberto 021100", shape: [0,2,1,1,0,0], fingers: [0,2,1,1,0,0] },
    { label: "xx2444", shape: [X,X,2,4,4,4], fingers: [undefined,undefined,1,3,3,3] },
  ]},
  E7: { name: "E7 (Mi com sétima dominante)", variants: [
    { label: "Aberto 020100", shape: [0,2,0,1,0,0], fingers: [0,2,0,1,0,0] },
    { label: "xx2434", shape: [X,X,2,4,3,4], fingers: [undefined,undefined,1,3,2,4] },
  ]},
  Em: { name: "Em (Mi menor)", variants: [
    { label: "Aberto 022000", shape: [0,2,2,0,0,0], fingers: [0,2,3,0,0,0] },
    { label: "A-shape x79987", shape: [X,7,9,9,8,7], fingers: [undefined,1,3,4,2,1], barre: { finger:1, fret:7, from:1, to:5 } },
  ]},
  Em7: { name: "Em7 (Mi menor com sétima)", variants: [
    { label: "Aberto 020000", shape: [0,2,0,0,0,0], fingers: [0,2,0,0,0,0] },
    { label: "022030", shape: [0,2,2,0,3,0], fingers: [0,2,3,0,4,0] },
  ]},
  Edim: { name: "Edim (Mi diminuto)", variants: [
    { label: "xx2323", shape: [X,X,2,3,2,3], fingers: [undefined,undefined,1,3,2,4] },
    { label: "x78686", shape: [X,7,8,6,8,6], fingers: [undefined,2,3,1,4,1] },
  ]},
  F: { name: "F (Fá maior)", variants: [
    { label: "E-shape 133211", shape: [1,3,3,2,1,1], fingers: [1,3,4,2,1,1], barre: { finger:1, fret:1, from:0, to:5 } },
    { label: "Fmaj7 xx3210",  shape: [X,X,3,2,1,0], fingers: [undefined,undefined,3,2,1,0] },
  ]},
  Fmaj7: { name: "Fmaj7 (Fá maior com sétima)", variants: [
    { label: "Aberto xx3210", shape: [X,X,3,2,1,0], fingers: [undefined,undefined,3,2,1,0] },
    { label: "1-3-2-2-1-1", shape: [1,3,2,2,1,1], fingers: [1,3,2,2,1,1], barre: { finger:1, fret:1, from:0, to:5 } },
  ]},
  F7: { name: "F7 (Fá com sétima dominante)", variants: [
    { label: "131211", shape: [1,3,1,2,1,1], fingers: [1,3,1,2,1,1], barre: { finger:1, fret:1, from:0, to:5 } },
    { label: "xx3545", shape: [X,X,3,5,4,5], fingers: [undefined,undefined,1,3,2,4] },
  ]},
  Fm: { name: "Fm (Fá menor)", variants: [
    { label: "E-shape 133111", shape: [1,3,3,1,1,1], fingers: [1,3,4,1,1,1], barre: { finger:1, fret:1, from:0, to:5 } },
  ]},
  Fm7: { name: "Fm7 (Fá menor com sétima)", variants: [
    { label: "131111", shape: [1,3,1,1,1,1], fingers: [1,3,1,1,1,1], barre: { finger:1, fret:1, from:0, to:5 } },
  ]},
  Fdim: { name: "Fdim (Fá diminuto)", variants: [
    { label: "xx3434", shape: [X,X,3,4,3,4], fingers: [undefined,undefined,1,3,2,4] },
    { label: "1-2-3-1-3-1", shape: [1,2,3,1,3,1], fingers: [1,2,3,1,4,1] },
  ]},
  G: { name: "G (Sol maior)", variants: [
    { label: "Aberto 320003", shape: [3,2,0,0,0,3], fingers: [3,2,0,0,0,4] },
    { label: "E-shape 355433", shape: [3,5,5,4,3,3], fingers: [1,3,4,2,1,1], barre: { finger:1, fret:3, from:0, to:5 } },
  ]},
  Gmaj7: { name: "Gmaj7 (Sol maior com sétima)", variants: [
    { label: "Aberto 320002", shape: [3,2,0,0,0,2], fingers: [3,2,0,0,0,1] },
    { label: "3-5-4-4-3-3", shape: [3,5,4,4,3,3], fingers: [1,3,2,2,1,1], barre: { finger:1, fret:3, from:0, to:5 } },
  ]},
  G7: { name: "G7 (Sol com sétima dominante)", variants: [
    { label: "Aberto 320001", shape: [3,2,0,0,0,1], fingers: [3,2,0,0,0,1] },
    { label: "353433", shape: [3,5,3,4,3,3], fingers: [1,3,1,2,1,1], barre: { finger:1, fret:3, from:0, to:5 } },
  ]},
  Gm: { name: "Gm (Sol menor)", variants: [
    { label: "Barra 355333", shape: [3,5,5,3,3,3], fingers: [1,3,4,1,1,1], barre: { finger:1, fret:3, from:0, to:5 } },
  ]},
  Gm7: { name: "Gm7 (Sol menor com sétima)", variants: [
    { label: "353333", shape: [3,5,3,3,3,3], fingers: [1,3,1,1,1,1], barre: { finger:1, fret:3, from:0, to:5 } },
  ]},
  Gdim: { name: "Gdim (Sol diminuto)", variants: [
    { label: "xx5656", shape: [X,X,5,6,5,6], fingers: [undefined,undefined,1,3,2,4] },
    { label: "3-4-5-3-5-3", shape: [3,4,5,3,5,3], fingers: [1,2,3,1,4,1] },
  ]},
  A: { name: "A (Lá maior)", variants: [
    { label: "Aberto x02220", shape: [X,0,2,2,2,0], fingers: [undefined,0,1,2,3,0] },
    { label: "E-shape 577655", shape: [5,7,7,6,5,5], fingers: [1,3,4,2,1,1], barre: { finger:1, fret:5, from:0, to:5 } },
  ]},
  Amaj7: { name: "Amaj7 (Lá maior com sétima)", variants: [
    { label: "Aberto x02120", shape: [X,0,2,1,2,0], fingers: [undefined,0,2,1,3,0] },
    { label: "5-7-6-6-5-5", shape: [5,7,6,6,5,5], fingers: [1,3,2,2,1,1], barre: { finger:1, fret:5, from:0, to:5 } },
  ]},
  A7: { name: "A7 (Lá com sétima dominante)", variants: [
    { label: "Aberto x02020", shape: [X,0,2,0,2,0], fingers: [undefined,0,2,0,3,0] },
    { label: "575655", shape: [5,7,5,6,5,5], fingers: [1,3,1,2,1,1], barre: { finger:1, fret:5, from:0, to:5 } },
  ]},
  Am: { name: "Am (Lá menor)", variants: [
    { label: "Aberto x02210", shape: [X,0,2,2,1,0], fingers: [undefined,0,2,3,1,0] },
    { label: "E-shape 577555", shape: [5,7,7,5,5,5], fingers: [1,3,4,1,1,1], barre: { finger:1, fret:5, from:0, to:5 } },
  ]},
  Am7: { name: "Am7 (Lá menor com sétima)", variants: [
    { label: "Aberto x02010", shape: [X,0,2,0,1,0], fingers: [undefined,0,2,0,1,0] },
    { label: "575555", shape: [5,7,5,5,5,5], fingers: [1,3,1,1,1,1], barre: { finger:1, fret:5, from:0, to:5 } },
  ]},
  Adim: { name: "Adim (Lá diminuto)", variants: [
    { label: "x01212", shape: [X,0,1,2,1,2], fingers: [undefined,0,1,3,2,4] },
    { label: "xx7878", shape: [X,X,7,8,7,8], fingers: [undefined,undefined,1,3,2,4] },
  ]},
  B: { name: "B (Si maior)", variants: [
    { label: "x24442", shape: [X,2,4,4,4,2], fingers: [undefined,1,3,3,3,1], barre: { finger:1, fret:2, from:1, to:5 } },
    { label: "799877", shape: [7,9,9,8,7,7], fingers: [1,3,4,2,1,1], barre: { finger:1, fret:7, from:0, to:5 } },
  ]},
  Bmaj7: { name: "Bmaj7 (Si maior com sétima)", variants: [
    { label: "x24342", shape: [X,2,4,3,4,2], fingers: [undefined,1,3,2,4,1], barre: { finger:1, fret:2, from:1, to:5 } },
  ]},
  B7: { name: "B7 (Si com sétima dominante)", variants: [
    { label: "x21202", shape: [X,2,1,2,0,2], fingers: [undefined,2,1,3,0,4] },
    { label: "797877", shape: [7,9,7,8,7,7], fingers: [1,3,1,2,1,1], barre: { finger:1, fret:7, from:0, to:5 } },
  ]},
  Bm: { name: "Bm (Si menor)", variants: [
    { label: "x24432 (barra)", shape: [X,2,4,4,3,2], fingers: [undefined,1,3,4,2,1], barre: { finger:1, fret:2, from:1, to:5 } },
    { label: "799777", shape: [7,9,9,7,7,7], fingers: [1,3,4,1,1,1], barre: { finger:1, fret:7, from:0, to:5 } },
  ]},
  Bm7: { name: "Bm7 (Si menor com sétima)", variants: [
    { label: "x24232", shape: [X,2,4,2,3,2], fingers: [undefined,1,3,1,2,1], barre: { finger:1, fret:2, from:1, to:5 } },
    { label: "x20202", shape: [X,2,0,2,0,2], fingers: [undefined,2,0,3,0,4] },
  ]},
  Bdim: { name: "Bdim (Si diminuto)", variants: [
    { label: "x23434", shape: [X,2,3,4,3,4], fingers: [undefined,1,2,4,2,4] },
    { label: "xx9-10-9-10", shape: [X,X,9,10,9,10], fingers: [undefined,undefined,1,3,2,4] },
  ]},
};
const CHORD_KEYS = Object.keys(CHORDS);

/** ===== Instrumentos ===== */
const INSTRUMENTS: InstrumentName[] = [
  "acoustic_guitar_steel",
  "acoustic_guitar_nylon",
  "electric_guitar_clean",
  "electric_guitar_jazz",
  "electric_guitar_muted",
  "overdriven_guitar",
  "distortion_guitar",
  "acoustic_grand_piano",
];

/** ===== SoundFont Player ===== */
type SFInstrument = Awaited<ReturnType<typeof Soundfont.instrument>>;
function useSF(instrumentName: InstrumentName) {
  const ctxRef = useRef<AudioContext | null>(null);
  const instRef = useRef<SFInstrument | null>(null);
  const loadingRef = useRef(false);

  const ensure = async () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: "interactive" });
    }
    if (ctxRef.current.state !== "running") await ctxRef.current.resume();
    if (!instRef.current && !loadingRef.current) {
      loadingRef.current = true;
      instRef.current = await Soundfont.instrument(ctxRef.current, instrumentName, { gain: 0.92 });
      loadingRef.current = false;
    }
  };

  const playMidi = async (midi: number, when = 0, dur = 0.25, vel = 0.85) => {
    await ensure();
    const now = ctxRef.current!.currentTime;
    instRef.current!.play(midi.toString(), now + Math.max(0, when), { gain: vel, duration: dur });
  };

  // Afinador por tom de referência (seno contínuo)
  const sineHold = useRef<OscillatorNode | null>(null);
  const startSine = async (hz: number) => {
    await ensure();
    stopSine();
    const ctx = ctxRef.current!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.2;
    osc.type = "sine";
    osc.frequency.value = hz;
    osc.connect(g); g.connect(ctx.destination);
    osc.start();
    sineHold.current = osc;
  };
  const stopSine = () => { sineHold.current?.stop(); sineHold.current = null; };

  return { playMidi, ensure, startSine, stopSine, ctxRef };
}

/** ===== Fretboard (dedos + pestana) ===== */
function Fretboard({ shape, fingers, barre }: { shape: Shape; fingers?: Fingering; barre?: Barre }) {
  const { startFret, endFret, showNut } = useMemo(() => {
    const frets = shape.filter((v): v is number => typeof v === "number").map(f => f);
    const min = Math.min(...frets, 0);
    const max = Math.max(...frets, 0);
    const pad = 2;
    let s = Math.max(1, Math.min((min === 0 ? 1 : min) - 1, max - 4));
    if (max <= 3) s = 1;
    const e = Math.max(s + 4, max + pad);
    return { startFret: s, endFret: e, showNut: s === 1 };
  }, [shape]);

  const width = 420, height = 200, strings = 6;
  const fretsCount = endFret - startFret + 1;
  const margin = 14, innerW = width - margin * 2, innerH = height - margin * 2;
  const fretW = innerW / fretsCount, stringH = innerH / (strings - 1);
  const dots = [3,5,7,9,12,15];
  const fretX = (fretAbs: number) => (fretAbs - startFret + 1) * fretW - fretW / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-xl">
      <defs>
        <filter id="cardShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
        </filter>
      </defs>
      <rect x={0} y={0} width={width} height={height} rx={18} fill="#fff" filter="url(#cardShadow)" />
      <g transform={`translate(${margin},${margin})`}>
        {Array.from({ length: fretsCount + 1 }).map((_, i) => {
          const x = i * fretW; const fretNumber = startFret + i - 1;
          return (
            <g key={i}>
              <line x1={x} y1={0} x2={x} y2={innerH} stroke={i===0 && showNut? "#888":"#c9c9c9"} strokeWidth={i===0 && showNut? 6:2} />
              {i>0 && dots.includes(fretNumber) && (
                <circle cx={x - fretW/2} cy={innerH/2} r={6} fill="#a3a3a3" />
              )}
              {i>0 && fretNumber===12 && (
                <>
                  <circle cx={x - fretW/2} cy={innerH/3} r={5} fill="#a3a3a3" />
                  <circle cx={x - fretW/2} cy={(innerH/3)*2} r={5} fill="#a3a3a3" />
                </>
              )}
            </g>
          );
        })}
        {Array.from({ length: strings }).map((_, s) => {
          const y = s * stringH; const sw = 1.5 + (strings - s) * 0.25;
          return <line key={s} x1={0} y1={y} x2={innerW} y2={y} stroke="#666" strokeWidth={sw} />;
        })}
        {shape.map((v, s) => {
          const y = s * stringH;
          if (v === "x") return <text key={`x-${s}`} x={-10} y={y+4} textAnchor="end" fill="#dc2626" fontSize={12}>x</text>;
          if (v === 0)   return <text key={`o-${s}`} x={-10} y={y+4} textAnchor="end" fill="#065f46" fontSize={12}>0</text>;
          return null;
        })}
        {barre && (
          <g>
            <rect x={fretX(barre.fret) - 11} y={barre.from*stringH - 9} width={22} height={(barre.to - barre.from)*stringH + 18} rx={11} fill="#111827" opacity={0.6} />
            <text x={fretX(barre.fret)} y={barre.from*stringH - 14} textAnchor="middle" fill="#fff" fontSize={10}>{barre.finger}</text>
          </g>
        )}
        {shape.map((v, s) => {
          if (typeof v !== "number" || v === 0) return null;
          const cx = fretX(v); const cy = s * stringH; const finger = fingers?.[s];
          return (
            <g key={`f-${s}`}>
              <circle cx={cx} cy={cy} r={12} fill="#4f46e5" />
              {finger ? (
                <text x={cx} y={cy+4} textAnchor="middle" fill="#fff" fontSize={12}>{finger}</text>
              ) : (
                <circle cx={cx} cy={cy} r={6} fill="#fff" />
              )}
            </g>
          );
        })}
        {!(showNut) && (
          <text x={innerW + 6} y={innerH} fill="#737373" fontSize={12}>{startFret}fr</text>
        )}
      </g>
    </svg>
  );
}

/** ===== Afinador Cromático (microfone) ===== */
function useChromaticTuner() {
  const [running, setRunning] = useState(false);
  const [freq, setFreq] = useState<number | null>(null);
  const [note, setNote] = useState<string>("-");
  const [cents, setCents] = useState<number>(0);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const autoCorrelate = (buf: Float32Array, sampleRate: number): number => {
    // Autocorrelação simples (AMDF-ish)
    const SIZE = buf.length; let bestOf = -1; let bestI = -1;
    let rms = 0; for (let i=0;i<SIZE;i++){ const v=buf[i]; rms += v*v; }
    rms = Math.sqrt(rms / SIZE); if (rms < 0.01) return -1;
    let lastCorr = 1;
    const MIN_SAMPLES = 32, MAX_SAMPLES = 1024;
    for (let offset=MIN_SAMPLES; offset<MAX_SAMPLES; offset++) {
      let corr = 0;
      for (let i=0;i<MAX_SAMPLES;i++) corr += Math.abs(buf[i]-buf[i+offset]);
      corr = 1 - corr / MAX_SAMPLES;
      if (corr > 0.9 && corr > lastCorr) { bestOf = corr; bestI = offset; }
      lastCorr = corr;
    }
    if (bestOf > 0.01) return sampleRate / bestI; else return -1;
  };

  const start = async () => {
    if (running) return; setRunning(true);
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = ctxRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
    const src = ctx.createMediaStreamSource(stream); srcRef.current = src;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyserRef.current = analyser;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const loop = () => {
      analyser.getFloatTimeDomainData(buf);
      const f = autoCorrelate(buf, ctx.sampleRate);
      if (f > 0) {
        setFreq(f);
        const midi = Math.round(hzToMidi(f));
        const name = NOTE_NAMES[(midi % 12 + 12) % 12] || "C";
        const target = 440 * Math.pow(2, (midi - 69) / 12);
        const cents = Math.round(1200 * Math.log2(f / target));
        setNote(name + Math.floor(midi/12 - 1));
        setCents(cents);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null;
    if (srcRef.current) srcRef.current.mediaStream.getTracks().forEach(t=>t.stop());
    srcRef.current = null; analyserRef.current = null; setRunning(false); setFreq(null); setNote("-"); setCents(0);
  };

  return { running, freq, note, cents, start, stop };
}

/** ===== Utilidades de notas/roots e sequência por tom ===== */
const CHROMA = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const toIndex = (n: string) => CHROMA.indexOf(n);

function parseChordSymbol(sym: string): { root: string; qual: string } {
  const m = sym.match(/^(C#|Db|D#|Eb|F#|Gb|G#|Ab|A#|Bb|[A-G])(maj7|m7b5|m7|7|m|sus2|sus4|dim|°)?$/i);
  if (!m) return { root: sym[0].toUpperCase(), qual: sym.slice(1) };
  let root = m[1].toUpperCase();
  root = root.replace("DB","C#").replace("EB","D#").replace("GB","F#").replace("AB","G#").replace("BB","A#");
  let qual = (m[2]||"").toLowerCase();
  if (qual === "°") qual = "dim";
  return { root, qual };
}

function getChordDisplaySymbol(key: string): string {
  const p = parseChordSymbol(key);
  let d = p.root;
  if (key.includes("maj7")) d += "maj7";
  else if (key.includes("m7")) d += "m7";
  else if (key.endsWith("7")) d += "7";
  else if (key.endsWith("m")) d += "m";
  else if (key.includes("dim")) d += "°";
  return d;
}

const NATURALS_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const toPc = (n: string) => toIndex(n);
const nameForPc = (pc: number) => NATURALS_SHARP[(pc%12+12)%12];

type DegreeType = "" | "m" | "7" | "m7" | "maj7" | "dim";
type ProgressionDegree = { semitones: number; quality: DegreeType; alternatives?: DegreeType[] };

const PROGRESSIONS: Record<string, { name: string; degrees: ProgressionDegree[] }> = {
  "I-IV-V": {
    name: "I - IV - V (Rock básico)",
    degrees: [
      { semitones: 0, quality: "", alternatives: ["7", "maj7"] },
      { semitones: 5, quality: "", alternatives: ["7", "maj7"] },
      { semitones: 7, quality: "", alternatives: ["7"] },
    ]
  },
  "I-V-vi-IV": {
    name: "I - V - vi - IV (Pop)",
    degrees: [
      { semitones: 0, quality: "", alternatives: ["maj7"] },
      { semitones: 7, quality: "", alternatives: ["7"] },
      { semitones: 9, quality: "m", alternatives: ["m7"] },
      { semitones: 5, quality: "", alternatives: ["maj7"] },
    ]
  },
  "ii-V-I": {
    name: "ii - V - I (Jazz)",
    degrees: [
      { semitones: 2, quality: "m7", alternatives: ["m"] },
      { semitones: 7, quality: "7", alternatives: [""] },
      { semitones: 0, quality: "maj7", alternatives: [""] },
    ]
  },
  "I-vi-IV-V": {
    name: "I - vi - IV - V (Anos 50)",
    degrees: [
      { semitones: 0, quality: "", alternatives: ["maj7"] },
      { semitones: 9, quality: "m", alternatives: ["m7"] },
      { semitones: 5, quality: "", alternatives: ["maj7"] },
      { semitones: 7, quality: "", alternatives: ["7"] },
    ]
  },
  "I-ii-iii-IV-V-vi-vii": {
    name: "Escala harmônica completa",
    degrees: [
      { semitones: 0, quality: "", alternatives: ["maj7"] },
      { semitones: 2, quality: "m", alternatives: ["m7"] },
      { semitones: 4, quality: "m", alternatives: ["m7"] },
      { semitones: 5, quality: "", alternatives: ["maj7"] },
      { semitones: 7, quality: "", alternatives: ["7"] },
      { semitones: 9, quality: "m", alternatives: ["m7"] },
      { semitones: 11, quality: "dim", alternatives: ["m7"] },
    ]
  },
  "I-IV-I-V": {
    name: "I - IV - I - V (Blues)",
    degrees: [
      { semitones: 0, quality: "7", alternatives: [""] },
      { semitones: 5, quality: "7", alternatives: [""] },
      { semitones: 0, quality: "7", alternatives: [""] },
      { semitones: 7, quality: "7", alternatives: [""] },
    ]
  },
  "vi-IV-I-V": {
    name: "vi - IV - I - V (Emotional)",
    degrees: [
      { semitones: 9, quality: "m", alternatives: ["m7"] },
      { semitones: 5, quality: "", alternatives: ["maj7"] },
      { semitones: 0, quality: "", alternatives: ["maj7"] },
      { semitones: 7, quality: "", alternatives: ["7"] },
    ]
  },
};

function buildSequenceFromProgression(tonicRoot: string, progressionKey: string) {
  const prog = PROGRESSIONS[progressionKey];
  if (!prog) return [];
  const base = toPc(tonicRoot);
  return prog.degrees.map(deg => {
    const root = nameForPc(base + deg.semitones);
    let symbol = root;
    if (deg.quality === "m") symbol += "m";
    else if (deg.quality === "7") symbol += "7";
    else if (deg.quality === "m7") symbol += "m7";
    else if (deg.quality === "maj7") symbol += "maj7";
    else if (deg.quality === "dim") symbol += "dim";
    return symbol;
  });
}

function mapSymbolToDictKey(sym: string): string {
  if (CHORDS[sym as keyof typeof CHORDS]) return sym;
  const p = parseChordSymbol(sym);

  if (p.qual === "maj7") {
    const maj7 = p.root + "maj7";
    if (CHORDS[maj7 as keyof typeof CHORDS]) return maj7;
    const maj = p.root;
    if (CHORDS[maj as keyof typeof CHORDS]) return maj;
  }
  if (p.qual === "m7") {
    const m7 = p.root + "m7";
    if (CHORDS[m7 as keyof typeof CHORDS]) return m7;
    const min = p.root + "m";
    if (CHORDS[min as keyof typeof CHORDS]) return min;
  }
  if (p.qual === "7") {
    const dom7 = p.root + "7";
    if (CHORDS[dom7 as keyof typeof CHORDS]) return dom7;
    const maj = p.root;
    if (CHORDS[maj as keyof typeof CHORDS]) return maj;
  }
  if (p.qual === "m") {
    const min = p.root + "m";
    if (CHORDS[min as keyof typeof CHORDS]) return min;
    const maj = p.root;
    if (CHORDS[maj as keyof typeof CHORDS]) return maj;
  }
  if (p.qual === "dim") {
    const dim = p.root + "dim";
    if (CHORDS[dim as keyof typeof CHORDS]) return dim;
    const min = p.root + "m";
    if (CHORDS[min as keyof typeof CHORDS]) return min;
    const maj = p.root;
    if (CHORDS[maj as keyof typeof CHORDS]) return maj;
  }
  return "C";
}

/** ===== App ===== */
export default function App() {
  /* ===== Header / Layout responsivo ===== */
  const [instrument, setInstrument] = useState<InstrumentName>("acoustic_guitar_nylon");
  const { playMidi, ensure, startSine, stopSine, ctxRef } = useSF(instrument);

  /* ===== Execução ===== */
  const [patternId, setPatternId] = useState("folk1");
  const [bpm] = useState(92);
  const [swing] = useState(0.08);
  const [strumMs] = useState(12);
  const [sustain] = useState(0.24);

  /* ===== Seleção rápida ===== */
  const [chordKey, setChordKey] = useState("C");
  const [variantIdx, setVariantIdx] = useState(0);

  /* ===== Tonalidade e Progressão ===== */
  const [key, setKey] = useState("C");
  const [progression, setProgression] = useState("I-V-vi-IV");

  /* ===== Sequência (dinâmica) ===== */
  type SeqItem = { key: string; varIdx: number; degreeIdx: number };
  const initialSeqSymbols = buildSequenceFromProgression("C", "I-V-vi-IV");
  const initialSeq: SeqItem[] = initialSeqSymbols.map((sym, i) => ({ key: mapSymbolToDictKey(sym), varIdx: 0, degreeIdx: i }));
  const [sequence, setSequence] = useState<SeqItem[]>(initialSeq);
  const [currentBar, setCurrentBar] = useState<number>(-1);
  const [loopSequence, setLoopSequence] = useState<boolean>(true);

  /* ===== Acorde individual com loop ===== */
  const [loopSingle, setLoopSingle] = useState<boolean>(false);
  const [isPlayingSingle, setIsPlayingSingle] = useState(false);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);

  const pattern = useMemo(() => PATTERNS.find(p => p.id === patternId)!, [patternId]);
  const currentVoicing = CHORDS[chordKey].variants[Math.min(variantIdx, CHORDS[chordKey].variants.length-1)];

  const singleTimerRef = useRef<number | null>(null);
  const singleStepIdxRef = useRef(0);

  const seqTimerRef = useRef<number | null>(null);
  const seqStepIdxRef = useRef(0);
  const seqBarIdxRef = useRef(0);

  const startAudio = async () => { await ensure(); if (ctxRef.current?.state !== "running") await ctxRef.current?.resume(); };

  const playChordStrum = async (voicing: Voicing, accentMap: boolean[], isDown: boolean, stepIdx: number) => {
    const order = isDown ? [0,1,2,3,4,5] : [5,4,3,2,1,0];
    const baseVel = 0.9;
    for (let i=0;i<order.length;i++) {
      const s = order[i]; const v = voicing.shape[s]; if (v === "x") continue;
      const midi = TUNING_MIDI[s] + Number(v);
      const swingPush = (stepIdx % 2 === 1) ? swing * (60 / bpm) / 2 : 0;
      const when = i * (strumMs/1000) + swingPush;
      const vel = baseVel * (isDown ? (1 - i*0.05) : (1 - i*0.04)) * (accentMap[stepIdx%8] ? 1.0 : 0.85);
      await playMidi(midi, when, sustain, Math.max(0.1, Math.min(1, vel)));
    }
  };

  // Raiz no tempo 1 (reforça o groove)
  const voicingMidis = (voicing: Voicing): number[] => {
    const out: number[] = [];
    for (let s=0;s<6;s++) {
      const v = voicing.shape[s];
      if (v === "x") continue;
      out.push(TUNING_MIDI[s] + Number(v));
    }
    return out;
  };
  const findRootMidi = (midis: number[], rootName: string): number => {
    const targetPc = toIndex(rootName);
    const candidates = midis.filter(m => ((m % 12)+12)%12 === targetPc);
    return (candidates.length ? Math.min(...candidates) : Math.min(...midis));
  };
  const playRootHit = async (voicing: Voicing, rootName: string) => {
    const mids = voicingMidis(voicing);
    if (mids.length === 0) return;
    const m = findRootMidi(mids, rootName);
    await playMidi(m, 0, Math.max(0.22, sustain), 1.0);
  };

  // ========== ACORDE INDIVIDUAL ==========
  const playSingleChordBar = () => {
    const accents = pattern.accents ?? [];
    const accMap = Array(8).fill(false).map((_,i)=>accents.includes(i));
    const steps = pattern.steps;
    const stepMs = (60_000 / bpm) / 2;
    const rootName = parseChordSymbol(chordKey).root;

    singleStepIdxRef.current = 0;

    singleTimerRef.current = window.setInterval(() => {
      const idx = singleStepIdxRef.current % 8;
      const st = steps[idx];
      if (idx === 0) { void playRootHit(currentVoicing, rootName); }
      if (st !== "-") void playChordStrum(currentVoicing, accMap, st === "D", singleStepIdxRef.current);
      singleStepIdxRef.current += 1;

      if (singleStepIdxRef.current >= 8) {
        if (loopSingle) {
          singleStepIdxRef.current = 0;
        } else {
          clearInterval(singleTimerRef.current!);
          singleTimerRef.current = null;
          setIsPlayingSingle(false);
        }
      }
    }, stepMs);
  };

  const handlePlaySingle = async () => {
    await startAudio();
    if (seqTimerRef.current) { clearInterval(seqTimerRef.current); seqTimerRef.current = null; }
    if (singleTimerRef.current) { clearInterval(singleTimerRef.current); singleTimerRef.current = null; }

    setIsPlayingSequence(false);
    setIsPlayingSingle(true);
    setCurrentBar(-1);

    playSingleChordBar();
  };

  const handleStopSingle = () => {
    if (singleTimerRef.current) { clearInterval(singleTimerRef.current); singleTimerRef.current = null; }
    setIsPlayingSingle(false);
  };

  // ========== SEQUÊNCIA ==========
  const playSequenceBar = (barIdx: number) => {
    const item = sequence[barIdx];
    const voicing = CHORDS[item.key].variants[Math.min(item.varIdx, CHORDS[item.key].variants.length-1)];
    const accents = pattern.accents ?? [];
    const accMap = Array(8).fill(false).map((_,i)=>accents.includes(i));
    const steps = pattern.steps;
    const stepMs = (60_000 / bpm) / 2;
    const rootName = parseChordSymbol(item.key).root;

    setCurrentBar(barIdx);
    seqStepIdxRef.current = 0;

    seqTimerRef.current = window.setInterval(() => {
      const idx = seqStepIdxRef.current % 8;
      const st = steps[idx];
      if (idx === 0) { void playRootHit(voicing, rootName); }
      if (st !== "-") void playChordStrum(voicing, accMap, st === "D", seqStepIdxRef.current);
      seqStepIdxRef.current += 1;

      if (seqStepIdxRef.current >= 8) {
        clearInterval(seqTimerRef.current!);
        seqTimerRef.current = null;
        seqBarIdxRef.current += 1;

        if (seqBarIdxRef.current >= sequence.length) {
          if (loopSequence) {
            seqBarIdxRef.current = 0;
            playSequenceBar(0);
          } else {
            setCurrentBar(-1);
            setIsPlayingSequence(false);
          }
        } else {
          playSequenceBar(seqBarIdxRef.current);
        }
      }
    }, stepMs);
  };

  const handlePlaySequence = async () => {
    await startAudio();
    if (singleTimerRef.current) { clearInterval(singleTimerRef.current); singleTimerRef.current = null; }
    if (seqTimerRef.current) { clearInterval(seqTimerRef.current); seqTimerRef.current = null; }

    setIsPlayingSingle(false);
    setIsPlayingSequence(true);
    seqBarIdxRef.current = 0;

    playSequenceBar(0);
  };

  const handleStopSequence = () => {
    if (seqTimerRef.current) { clearInterval(seqTimerRef.current); seqTimerRef.current = null; }
    setCurrentBar(-1);
    setIsPlayingSequence(false);
  };

  const handleKeyChange = (newKey: string) => {
    setKey(newKey);
    const symbols = buildSequenceFromProgression(newKey, progression);
    setSequence(symbols.map((sym, i) => ({ key: mapSymbolToDictKey(sym), varIdx: 0, degreeIdx: i })));
  };

  const handleProgressionChange = (newProg: string) => {
    setProgression(newProg);
    const symbols = buildSequenceFromProgression(key, newProg);
    setSequence(symbols.map((sym, i) => ({ key: mapSymbolToDictKey(sym), varIdx: 0, degreeIdx: i })));
  };

  const getAlternativesForDegree = (degreeIdx: number): string[] => {
    const prog = PROGRESSIONS[progression];
    if (!prog || degreeIdx >= prog.degrees.length) return [];
    const deg = prog.degrees[degreeIdx];
    const base = toPc(key);
    const root = nameForPc(base + deg.semitones);
    const alternatives: string[] = [];

    let mainSymbol = root;
    if (deg.quality === "m") mainSymbol += "m";
    else if (deg.quality === "7") mainSymbol += "7";
    else if (deg.quality === "m7") mainSymbol += "m7";
    else if (deg.quality === "maj7") mainSymbol += "maj7";
    else if (deg.quality === "dim") mainSymbol += "dim";
    alternatives.push(mainSymbol);

    if (deg.alternatives) {
      deg.alternatives.forEach(alt => {
        let symbol = root;
        if (alt === "m") symbol += "m";
        else if (alt === "7") symbol += "7";
        else if (alt === "m7") symbol += "m7";
        else if (alt === "maj7") symbol += "maj7";
        else if (alt === "dim") symbol += "dim";
        alternatives.push(symbol);
      });
    }

    return alternatives.filter(sym => CHORDS[mapSymbolToDictKey(sym)]);
  };

  // Preview arpejado ao trocar voicing (parado)
  useEffect(() => {
    if (singleTimerRef.current || seqTimerRef.current) return;
    (async () => {
      await startAudio(); let i=0;
      for (let s=0; s<6; s++) { const v = currentVoicing.shape[s]; if (v === "x" || v === 0) continue; const midi = TUNING_MIDI[s] + Number(v); await playMidi(midi, i*0.05, 0.18, 0.85); i++; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordKey, variantIdx, instrument]);

  /* ===== Afinador Cromático ===== */
  const tuner = useChromaticTuner();
  const centsClamped = Math.max(-50, Math.min(50, tuner.cents));
  const needleRot = (centsClamped / 50) * 40; // ±40°

  /* ===== UI ===== */
  return (
    <div className="min-h-screen w-full" style={{ background: "linear-gradient(135deg,#f8fafc,#eef2ff)", color: "#0f172a" }}>
      {/* Header sticky */}
      <div style={{ position:"sticky", top:0, zIndex:20, backdropFilter:"blur(8px)", background:"linear-gradient(135deg,rgba(255,255,255,.85),rgba(238,242,255,.85))", borderBottom:"1px solid #e5e7eb" }}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-baseline gap-3 mb-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Kamilly Play</h1>
            <span className="text-xs md:text-sm text-slate-600">Acordes · Ritmos · Sequência · Afinadores</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-xs text-slate-600">
            <span className="font-medium">Ritmo: {pattern.label}</span>
            <span>·</span>
            <span>Instrumento: {instrument.replaceAll('_', ' ')}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 grid gap-6">
        {/* Configurações globais */}
        <section className="grid sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl" style={{background:'#ffffffd9', boxShadow:'0 2px 10px rgba(0,0,0,.06)'}}>
            <label className="block text-sm font-medium mb-2">Instrumento</label>
            <select className="w-full rounded-xl border p-2" value={instrument} onChange={(e)=>setInstrument(e.target.value as InstrumentName)}>
              {INSTRUMENTS.map(n=> <option key={n} value={n}>{n.replaceAll('_',' ')}</option>)}
            </select>
          </div>
          <div className="p-4 rounded-2xl" style={{background:'#ffffffd9', boxShadow:'0 2px 10px rgba(0,0,0,.06)'}}>
            <label className="block text-sm font-medium mb-2">Ritmo</label>
            <select className="w-full rounded-xl border p-2" value={patternId} onChange={(e)=>setPatternId(e.target.value)}>
              {PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </section>

        {/* ACORDE INDIVIDUAL */}
        <section className="p-4 rounded-2xl" style={{background:'#ffffffd9', boxShadow:'0 2px 10px rgba(0,0,0,.06)', border: isPlayingSingle ? '2px solid #4f46e5' : '2px solid transparent'}}>
          <div className="mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              🎸 Acorde Individual
              {isPlayingSingle && <span className="text-xs px-2 py-1 rounded-full" style={{background:'#4f46e5', color:'#fff'}}>Tocando</span>}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Escolha um acorde e toque em loop ou uma vez</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1">Acorde</label>
                  <select className="w-full rounded-xl border p-2" value={chordKey} onChange={(e)=>{setChordKey(e.target.value); setVariantIdx(0);}}>
                    {CHORD_KEYS.map(k => <option key={k} value={k}>{CHORDS[k].name}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1">Voicing</label>
                  <select className="w-full rounded-xl border p-2" value={variantIdx} onChange={(e)=>setVariantIdx(Number(e.target.value))}>
                    {CHORDS[chordKey].variants.map((v,i)=> <option key={i} value={i}>{v.label.split(' ')[0]}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs flex items-center gap-2">
                  <input type="checkbox" checked={loopSingle} onChange={e=>setLoopSingle(e.target.checked)} />
                  Loop (repetir)
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handlePlaySingle}
                  disabled={isPlayingSequence}
                  className="flex-1 px-4 py-3 rounded-xl font-medium disabled:opacity-50"
                  style={{background:'#4f46e5',color:'#fff', boxShadow:'0 2px 6px rgba(79,70,229,.3)'}}
                >
                  {isPlayingSingle ? '🔄 Tocando...' : '▶️ Tocar Acorde'}
                </button>
                <button
                  onClick={handleStopSingle}
                  disabled={!isPlayingSingle}
                  className="px-4 py-3 rounded-xl font-medium disabled:opacity-30"
                  style={{background:'#dc2626',color:'#fff'}}
                >
                  ⏹️
                </button>
              </div>
            </div>

            <div>
              <Fretboard shape={currentVoicing.shape} fingers={currentVoicing.fingers} barre={currentVoicing.barre} />
              <p style={{fontSize:11, textAlign:'center', marginTop:8, color:'#475569'}}>
                {CHORDS[chordKey].name} · {CHORDS[chordKey].variants[variantIdx].label}
              </p>
            </div>
          </div>
        </section>

        {/* SEQUÊNCIA DE ACORDES */}
        <section className="space-y-3 p-4 rounded-2xl" style={{background:'#ffffffd9', boxShadow:'0 2px 10px rgba(0,0,0,.06)', border: isPlayingSequence ? '2px solid #16a34a' : '2px solid transparent'}}>
          <div className="mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              🎼 Sequência de Acordes
              {isPlayingSequence && <span className="text-xs px-2 py-1 rounded-full" style={{background:'#16a34a', color:'#fff'}}>Tocando</span>}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Escolha uma tonalidade e progressão. Os acordes se ajustam automaticamente. Use alternativas para variar o som.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tonalidade</label>
              <select className="w-full rounded-xl border p-2" value={key} onChange={(e)=>handleKeyChange(e.target.value)}>
                {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Progressão (preset)</label>
              <select className="w-full rounded-xl border p-2" value={progression} onChange={(e)=>handleProgressionChange(e.target.value)}>
                {Object.entries(PROGRESSIONS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs flex items-center gap-2">
              <input type="checkbox" checked={loopSequence} onChange={e=>setLoopSequence(e.target.checked)} />
              Loop (repetir)
            </label>
            <div className="ml-auto flex gap-2">
              <button
                onClick={handlePlaySequence}
                disabled={isPlayingSingle}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{background:'#16a34a',color:'#fff', boxShadow:'0 2px 6px rgba(22,163,74,.3)'}}
              >
                {isPlayingSequence ? '🔄 Tocando...' : '▶️ Tocar Sequência'}
              </button>
              <button
                onClick={handleStopSequence}
                disabled={!isPlayingSequence}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-30"
                style={{background:'#dc2626',color:'#fff'}}
              >
                ⏹️
              </button>
            </div>
          </div>

          {/* Fretboard da sequência */}
          {isPlayingSequence && currentBar >= 0 && currentBar < sequence.length && (
            <div className="p-4 rounded-xl" style={{background:'#e0e7ff', border:'2px solid #4f46e5'}}>
              <div className="text-sm font-medium mb-2 text-center">
                Acorde atual: {getChordDisplaySymbol(sequence[currentBar].key)} (Compasso {currentBar + 1})
              </div>
              <Fretboard
                shape={CHORDS[sequence[currentBar].key].variants[Math.min(sequence[currentBar].varIdx, CHORDS[sequence[currentBar].key].variants.length-1)].shape}
                fingers={CHORDS[sequence[currentBar].key].variants[Math.min(sequence[currentBar].varIdx, CHORDS[sequence[currentBar].key].variants.length-1)].fingers}
                barre={CHORDS[sequence[currentBar].key].variants[Math.min(sequence[currentBar].varIdx, CHORDS[sequence[currentBar].key].variants.length-1)].barre}
              />
              <p style={{fontSize:11, textAlign:'center', marginTop:8, color:'#475569'}}>
                {CHORDS[sequence[currentBar].key].name} · {CHORDS[sequence[currentBar].key].variants[sequence[currentBar].varIdx].label}
              </p>
            </div>
          )}

          {/* faixa de roots sincronizada */}
          <div className="flex gap-2 flex-wrap items-center text-xs">
            {sequence.map((it, idx) => {
              const display = getChordDisplaySymbol(it.key);
              const active = currentBar===idx;
              return (
                <span key={idx} className="px-2 py-1 rounded-full" style={{background: active? '#4f46e5' : '#e2e8f0', color: active? '#fff' : '#0f172a'}}>
                  {display}
                </span>
              );
            })}
          </div>

          <div className="flex justify-end mb-2">
            <button
              className="px-3 py-1.5 rounded-xl text-xs"
              style={{background:'#e2e8f0'}}
              onClick={()=>setSequence([...sequence, { key: sequence.at(-1)?.key ?? 'C', varIdx: 0, degreeIdx: -1 }])}
            >+ Adicionar compasso</button>
          </div>

          <div className="w-full" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2 min-w-full" style={{ paddingBottom: 8 }}>
              {sequence.map((it, idx) => {
                const alternatives = it.degreeIdx >= 0 ? getAlternativesForDegree(it.degreeIdx) : [];
                const hasAlternatives = alternatives.length > 1;

                return (
                  <div key={idx} className="rounded-xl border" style={{ minWidth: 240, padding: 10, background: currentBar===idx? '#e0e7ff' : 'rgba(255,255,255,.9)', borderColor: currentBar===idx? '#4f46e5' : '#e5e7eb', boxShadow: currentBar===idx? '0 2px 8px rgba(79,70,229,.25)' : 'none' }}>
                    <div className="text-[11px] text-neutral-600 mb-2 flex items-center justify-between">
                      <span>{idx + 1}º compasso</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px]" style={{background:'#f1f5f9'}}>
                        {getChordDisplaySymbol(it.key)}
                      </span>
                    </div>

                    {hasAlternatives && (
                      <div className="mb-2">
                        <label className="text-[10px] text-neutral-500 block mb-1">Alternativas</label>
                        <div className="flex gap-1 flex-wrap">
                          {alternatives.map((alt, altIdx) => {
                            const altKey = mapSymbolToDictKey(alt);
                            const isSelected = altKey === it.key;
                            return (
                              <button
                                key={altIdx}
                                className="px-2 py-0.5 rounded text-xs"
                                style={{
                                  background: isSelected ? '#4f46e5' : '#e2e8f0',
                                  color: isSelected ? '#fff' : '#0f172a'
                                }}
                                onClick={() => {
                                  const copy = [...sequence];
                                  copy[idx] = { ...copy[idx], key: altKey };
                                  setSequence(copy);
                                }}
                              >
                                {alt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {!hasAlternatives && (
                        <select className="flex-1 text-sm" value={it.key} onChange={(e)=>{ const v = e.target.value; const copy=[...sequence]; copy[idx] = { ...copy[idx], key:v }; setSequence(copy); }}>
                          {CHORD_KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
                        </select>
                      )}
                      <select className={`${hasAlternatives ? 'flex-1' : 'w-[110px]'} text-sm`} value={it.varIdx} onChange={(e)=>{ const v = Number(e.target.value); const copy=[...sequence]; copy[idx] = { ...copy[idx], varIdx:v }; setSequence(copy); }}>
                        {CHORDS[(sequence[idx].key in CHORDS ? sequence[idx].key : "C") as keyof typeof CHORDS].variants.map((v,i)=> <option key={i} value={i}>{v.label.split(' ')[0]}</option>)}
                      </select>
                      <button className="text-xs px-2 py-1 rounded" style={{background:'#fee2e2'}} onClick={()=>{ const copy=[...sequence]; copy.splice(idx,1); setSequence(copy.length?copy:[{key:'C',varIdx:0, degreeIdx: 0}]); }}>−</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Afinadores */}
        <section className="grid lg:grid-cols-2 gap-6">
          {/* Referência de tom */}
          <div className="p-4 rounded-2xl" style={{background:'#ffffffd9', boxShadow:'0 2px 10px rgba(0,0,0,.06)'}}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium mr-2">Afinador (tons de referência)</span>
              {[
                {name:'E6 (E2)', mid:40},
                {name:'A (A2)', mid:45},
                {name:'D (D3)', mid:50},
                {name:'G (G3)', mid:55},
                {name:'B (B3)', mid:59},
                {name:'e (E4)', mid:64},
              ].map((s,i)=> (
                <button key={i} onClick={()=>startSine(midiToHz(s.mid))} className="px-3 py-2 rounded-xl" style={{background:'#f1f5f9'}}>{s.name}</button>
              ))}
              <button onClick={stopSine} className="px-3 py-2 rounded-xl" style={{background:'#fee2e2'}}>Parar</button>
            </div>
          </div>

          {/* Cromático (microfone) */}
          <div className="p-4 rounded-2xl" style={{background:'#ffffffd9', boxShadow:'0 2px 10px rgba(0,0,0,.06)'}}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Afinador cromático (microfone)</span>
              {!tuner.running ? (
                <button onClick={tuner.start} className="px-3 py-2 rounded-xl" style={{background:'#0ea5e9', color:'#fff'}}>🎤 Iniciar</button>
              ) : (
                <button onClick={tuner.stop} className="px-3 py-2 rounded-xl" style={{background:'#dc2626', color:'#fff'}}>Parar</button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 items-center">
              <div className="text-center">
                <div className="text-xs text-slate-500">Nota</div>
                <div className="text-2xl font-bold" style={{letterSpacing:1}}>{tuner.note}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Freq</div>
                <div className="text-lg font-semibold">{tuner.freq? tuner.freq.toFixed(1)+" Hz" : "—"}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Cents</div>
                <div className="text-lg font-semibold">{tuner.freq? `${tuner.cents>0?'+':''}${tuner.cents}` : '—'}</div>
              </div>
            </div>
            {/* needle */}
            <div className="mt-3 flex items-center justify-center">
              <svg width="220" height="110" viewBox="0 0 220 110">
                <defs>
                  <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444"/>
                    <stop offset="50%" stopColor="#22c55e"/>
                    <stop offset="100%" stopColor="#ef4444"/>
                  </linearGradient>
                </defs>
                <path d="M10,100 A100,100 0 0,1 210,100" fill="none" stroke="url(#g)" strokeWidth="10"/>
                <g transform={`translate(110,100) rotate(${needleRot})`}>
                  <line x1={0} y1={0} x2={0} y2={-80} stroke="#0f172a" strokeWidth={3}/>
                  <circle cx={0} cy={0} r={5} fill="#0f172a"/>
                </g>
                <text x={110} y={108} textAnchor="middle" fontSize={10} fill="#64748b">-50¢                                                0¢                                                +50¢</text>
              </svg>
            </div>
            <div className="text-xs text-slate-500 text-center">Dica: use fones e um local silencioso para melhor leitura.</div>
          </div>
        </section>

        <footer className="text-xs text-slate-500 text-center pb-6">Kamilly Play — feito para funcionar bem em smartphones (layout rolável, botões grandes, header fixo).</footer>
      </div>
    </div>
  );
}
