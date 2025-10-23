import { useEffect, useMemo, useRef, useState } from "react";
import Soundfont from "soundfont-player";

/**
 * Toque Comigo — Acordes + Ritmos + Fretboard (dedos/pestana) + Sequência (dinâmica) + Afinadores
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
type DrumHit = "k" | "s" | "h" | "o" | "-";
type DrumPattern = { kick: DrumHit[]; snare: DrumHit[]; hihat: DrumHit[]; label: string };

const PATTERNS: Pattern[] = [
  { id: "down8", label: "D D D D D D D D", steps: ["D","D","D","D","D","D","D","D"], accents: [0,4] },
  { id: "folk1", label: "D - D U - U D U (Folk)", steps: ["D","-","D","U","-","U","D","U"], accents: [0,2,6] },
  { id: "pop1",  label: "D - U U - U - U (Pop)",  steps: ["D","-","U","U","-","U","-","U"], accents: [0,2,5] },
  { id: "rock1", label: "D D U - U D U - (Rock)", steps: ["D","D","U","-","U","D","U","-"], accents:[0,1,5] },
  { id: "reggae",label: "- U - U - U - U (Reggae)",steps: ["-","U","-","U","-","U","-","U"], accents: [1,3,5,7] },
  { id: "bossa", label: "D - D U - U - U (Bossa)", steps: ["D","-","D","U","-","U","-","U"], accents: [0,2,5] },
];

const DRUM_PATTERNS: Record<string, DrumPattern> = {
  rock: {
    label: "Rock Básico",
    kick:  ["k","-","-","-","k","-","-","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","h","-","h","-","h","-","h","-","h","-","h","-","h","-"]
  },
  pop: {
    label: "Pop",
    kick:  ["k","-","-","-","k","-","k","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","h","-","h","-","h","-","h","-","h","-","h","-","h","-"]
  },
  funk: {
    label: "Funk",
    kick:  ["k","-","k","-","-","-","k","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","s","-","-","s","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","o","h","h","h","h","h","h","h","o","h","h","h"]
  },
  disco: {
    label: "Disco",
    kick:  ["k","-","-","-","k","-","-","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  reggae: {
    label: "Reggae",
    kick:  ["-","-","-","-","k","-","-","-","-","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","-","-","-","-","s","-","-","-","-","-","-","-"],
    hihat: ["-","h","-","h","-","h","-","h","-","h","-","h","-","h","-","h"]
  },
  ballad: {
    label: "Balada",
    kick:  ["k","-","-","-","-","-","-","-","k","-","-","-","-","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","-","h","-","-","h","-","h","-","-","h","-","-","h","-"]
  },
  jazz: {
    label: "Jazz Swing",
    kick:  ["k","-","-","k","-","-","k","-","-","k","-","-","k","-","-","-"],
    snare: ["-","-","s","-","-","s","-","-","s","-","-","s","-","-","s","-"],
    hihat: ["h","-","h","h","-","h","h","-","h","h","-","h","h","-","h","h"]
  },
  blues: {
    label: "Blues Shuffle",
    kick:  ["k","-","-","-","-","-","k","-","k","-","-","-","-","-","k","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","h","h","-","h","h","-","h","h","-","h","h","-","h","h"]
  },
  latin: {
    label: "Latin/Samba",
    kick:  ["k","-","k","-","k","-","-","-","k","-","k","-","k","-","-","-"],
    snare: ["-","-","-","s","-","-","s","-","-","-","-","s","-","-","s","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  country: {
    label: "Country",
    kick:  ["k","-","-","-","k","k","-","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","-","h","-","-","h","-","h","-","-","h","-","-","h","-"]
  },
  rock2: {
    label: "Rock Pesado",
    kick:  ["k","-","k","-","k","-","k","-","k","-","k","-","k","-","k","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  punk: {
    label: "Punk Rock",
    kick:  ["k","k","k","k","k","k","k","k","k","k","k","k","k","k","k","k"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","h","-","h","-","h","-","h","-","h","-","h","-","h","-"]
  },
  metal: {
    label: "Metal",
    kick:  ["k","-","k","k","-","-","k","k","k","-","k","k","-","-","k","k"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  hiphop: {
    label: "Hip Hop",
    kick:  ["k","-","-","-","-","-","k","-","k","-","-","-","-","-","k","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","h","h","-","h","h","-","h","-","h","h","-","h","h","-"]
  },
  trap: {
    label: "Trap",
    kick:  ["k","-","-","-","k","-","-","k","-","-","k","-","-","-","k","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  dnb: {
    label: "Drum & Bass",
    kick:  ["k","-","-","-","-","-","-","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","s","-","-","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  house: {
    label: "House",
    kick:  ["k","-","-","-","k","-","-","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  techno: {
    label: "Techno",
    kick:  ["k","-","-","-","k","-","-","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","s","-","-","-","s","-","-","-","s","-","-","-","s","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  edm: {
    label: "EDM",
    kick:  ["k","-","k","-","k","-","k","-","k","-","k","-","k","-","k","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["o","h","o","h","o","h","o","h","o","h","o","h","o","h","o","h"]
  },
  dubstep: {
    label: "Dubstep",
    kick:  ["k","-","-","-","-","-","-","-","k","-","-","k","-","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  afrobeat: {
    label: "Afrobeat",
    kick:  ["k","-","-","k","-","-","k","-","k","-","-","k","-","-","k","-"],
    snare: ["-","-","s","-","-","s","-","-","-","-","s","-","-","s","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  rumba: {
    label: "Rumba",
    kick:  ["k","-","-","-","k","-","k","-","k","-","-","-","k","-","k","-"],
    snare: ["-","-","-","s","-","-","-","-","-","-","-","s","-","-","-","-"],
    hihat: ["h","-","h","-","h","-","h","-","h","-","h","-","h","-","h","-"]
  },
  calypso: {
    label: "Calypso",
    kick:  ["k","-","-","k","-","-","-","-","k","-","-","k","-","-","-","-"],
    snare: ["-","-","s","-","-","-","s","-","-","-","s","-","-","-","s","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  ska: {
    label: "Ska",
    kick:  ["k","-","-","-","k","-","-","-","k","-","-","-","k","-","-","-"],
    snare: ["-","s","-","s","-","s","-","s","-","s","-","s","-","s","-","s"],
    hihat: ["-","h","-","h","-","h","-","h","-","h","-","h","-","h","-","h"]
  },
  gospel: {
    label: "Gospel",
    kick:  ["k","-","-","-","k","-","k","-","k","-","-","-","k","-","-","-"],
    snare: ["-","-","-","-","s","-","-","s","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","h","h","-","h","h","-","h","-","h","h","-","h","h","-"]
  },
  rnb: {
    label: "R&B",
    kick:  ["k","-","-","-","k","-","k","-","k","-","-","-","-","-","k","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  soul: {
    label: "Soul",
    kick:  ["k","-","-","-","k","-","-","-","k","-","-","-","k","-","-","k"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","h","-","h","-","h","-","h","-","h","-","h","-","h","-"]
  },
  motown: {
    label: "Motown",
    kick:  ["k","-","-","-","k","-","k","-","k","-","-","-","k","-","k","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  },
  waltz: {
    label: "Valsa 3/4",
    kick:  ["k","-","-","-","-","-","-","-","-","k","-","-","-","-","-","-"],
    snare: ["-","-","-","s","-","-","s","-","-","-","-","-","s","-","-","s"],
    hihat: ["h","-","-","h","-","-","h","-","-","h","-","-","h","-","-","h"]
  },
  march: {
    label: "Marcha",
    kick:  ["k","-","k","-","k","-","k","-","k","-","k","-","k","-","k","-"],
    snare: ["-","-","s","-","-","-","s","-","-","-","s","-","-","-","s","-"],
    hihat: ["-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-"]
  },
  tango: {
    label: "Tango",
    kick:  ["k","-","k","-","-","-","-","-","k","-","k","-","-","-","-","-"],
    snare: ["-","-","-","-","s","-","-","-","-","-","-","-","s","-","-","-"],
    hihat: ["h","-","h","-","h","-","h","-","h","-","h","-","h","-","h","-"]
  },
  bolero: {
    label: "Bolero",
    kick:  ["k","-","-","-","-","-","k","-","-","-","k","-","-","-","-","-"],
    snare: ["-","-","s","-","-","-","-","-","s","-","-","-","-","-","s","-"],
    hihat: ["h","-","h","-","h","-","h","-","h","-","h","-","h","-","h","-"]
  },
  flamenco: {
    label: "Flamenco",
    kick:  ["k","-","-","k","-","k","-","-","k","-","-","k","-","k","-","-"],
    snare: ["-","s","-","-","s","-","s","-","-","s","-","-","s","-","s","-"],
    hihat: ["h","h","h","h","h","h","h","h","h","h","h","h","h","h","h","h"]
  }
};

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

/** ===== Drum Sampler (Synthetic) ===== */
function useDrumSampler() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensure = async () => {
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AudioCtx({ latencyHint: "interactive" });
    }
    if (ctxRef.current.state !== "running") await ctxRef.current.resume();
  };

  const playSample = async (sampleName: string, when = 0, gain = 0.8) => {
    await ensure();
    if (!ctxRef.current) return;

    const ctx = ctxRef.current;
    const now = ctx.currentTime + Math.max(0, when);

    if (sampleName === "kick") {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.5);
      gainNode.gain.setValueAtTime(gain, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (sampleName === "snare") {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1000;
      gainNode.gain.setValueAtTime(gain * 0.7, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.2);
    } else if (sampleName === "hihat") {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 7000;
      gainNode.gain.setValueAtTime(gain * 0.4, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.05);
    } else if (sampleName === "openhat") {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 7000;
      gainNode.gain.setValueAtTime(gain * 0.4, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.3);
    }
  };

  return { playSample, ensure, ctxRef };
}

/** ===== SoundFont Player ===== */
type SFInstrument = Awaited<ReturnType<typeof Soundfont.instrument>>;
function useSF(instrumentName: InstrumentName, reverbMix: number, instrumentVolume: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const instRef = useRef<SFInstrument | null>(null);
  const loadingRef = useRef(false);
  const currentInstrumentRef = useRef<InstrumentName | null>(null);
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  const ensure = async () => {
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AudioCtx({ latencyHint: "interactive" });

      const ctx = ctxRef.current;
      const sampleRate = ctx.sampleRate;
      const length = sampleRate * 2;
      const impulse = ctx.createBuffer(2, length, sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);

      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2);
        left[i] = (Math.random() * 2 - 1) * decay;
        right[i] = (Math.random() * 2 - 1) * decay;
      }

      const convolver = ctx.createConvolver();
      convolver.buffer = impulse;
      reverbNodeRef.current = convolver;

      dryGainRef.current = ctx.createGain();
      wetGainRef.current = ctx.createGain();
      masterGainRef.current = ctx.createGain();

      dryGainRef.current.gain.value = 1 - reverbMix;
      wetGainRef.current.gain.value = reverbMix;
      masterGainRef.current.gain.value = 1.2;

      dryGainRef.current.connect(masterGainRef.current);
      wetGainRef.current.connect(convolver);
      convolver.connect(masterGainRef.current);
      masterGainRef.current.connect(ctx.destination);
    }
    if (ctxRef.current.state !== "running") await ctxRef.current.resume();
    if (currentInstrumentRef.current !== instrumentName) {
      instRef.current = null;
      currentInstrumentRef.current = instrumentName;
    }
    if (!instRef.current && !loadingRef.current) {
      loadingRef.current = true;
      try {
        instRef.current = await Soundfont.instrument(ctxRef.current, instrumentName, {
          gain: 1.0,
          soundfont: 'MusyngKite',
          destination: dryGainRef.current!
        });
        if (wetGainRef.current) {
          instRef.current.connect(wetGainRef.current as never);
        }
      } catch (e) {
        console.error('Failed to load instrument:', e);
      }
      loadingRef.current = false;
    }
  };

  const updateReverbMix = (mix: number) => {
    if (dryGainRef.current && wetGainRef.current) {
      dryGainRef.current.gain.value = 1 - mix;
      wetGainRef.current.gain.value = mix;
    }
  };

  const playMidi = async (midi: number, when = 0, dur = 0.25, vel = 0.9) => {
    await ensure();
    if (!ctxRef.current || !instRef.current) return;
    const now = ctxRef.current.currentTime;
    instRef.current.play(midi.toString(), now + Math.max(0, when), { gain: vel * instrumentVolume, duration: dur });
  };

  // Afinador por tom de referência (seno contínuo)
  const sineHold = useRef<OscillatorNode | null>(null);
  const startSine = async (hz: number) => {
    await ensure();
    stopSine();
    const ctx = ctxRef.current!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.5;
    osc.type = "sine";
    osc.frequency.value = hz;
    osc.connect(g); g.connect(ctx.destination);
    osc.start();
    sineHold.current = osc;
  };
  const stopSine = () => { sineHold.current?.stop(); sineHold.current = null; };

  return { playMidi, ensure, startSine, stopSine, ctxRef, updateReverbMix };
}

/** ===== Fretboard vertical (dedos + pestana) ===== */
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

  const width = 70, height = 130, strings = 6;
  const fretsCount = endFret - startFret + 1;
  const margin = 10, innerW = width - margin * 2, innerH = height - margin * 2;
  const fretH = innerH / fretsCount, stringW = innerW / (strings - 1);
  const dots = [3,5,7,9,12,15];
  const fretY = (fretAbs: number) => (fretAbs - startFret + 1) * fretH - fretH / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[85px] mx-auto">
      <defs>
        <filter id="cardShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
        </filter>
      </defs>
      <rect x={0} y={0} width={width} height={height} rx={6} fill="#fff" filter="url(#cardShadow)" />
      <rect x={1} y={1} width={width-2} height={height-2} rx={5} fill="none" stroke="#d4d4d4" strokeWidth="1.5" />
      <g transform={`translate(${margin},${margin})`}>
        {Array.from({ length: fretsCount + 1 }).map((_, i) => {
          const y = i * fretH; const fretNumber = startFret + i - 1;
          return (
            <g key={i}>
              <line x1={0} y1={y} x2={innerW} y2={y} stroke={i===0 && showNut? "#888":"#c9c9c9"} strokeWidth={i===0 && showNut? 2.5:0.8} />
              {i>0 && dots.includes(fretNumber) && (
                <circle cx={innerW/2} cy={y - fretH/2} r={1.8} fill="#a3a3a3" />
              )}
              {i>0 && fretNumber===12 && (
                <>
                  <circle cx={innerW/3} cy={y - fretH/2} r={1.5} fill="#a3a3a3" />
                  <circle cx={(innerW/3)*2} cy={y - fretH/2} r={1.5} fill="#a3a3a3" />
                </>
              )}
            </g>
          );
        })}
        {Array.from({ length: strings }).map((_, s) => {
          const x = s * stringW; const sw = 0.6 + (strings - s) * 0.12;
          return <line key={s} x1={x} y1={0} x2={x} y2={innerH} stroke="#666" strokeWidth={sw} />;
        })}
        {shape.map((v, s) => {
          const x = s * stringW;
          if (v === "x") return <text key={`x-${s}`} x={x} y={-3} textAnchor="middle" fill="#dc2626" fontSize={6.5}>x</text>;
          if (v === 0)   return <text key={`o-${s}`} x={x} y={-3} textAnchor="middle" fill="#065f46" fontSize={6.5}>0</text>;
          return null;
        })}
        {barre && (
          <g>
            <rect x={barre.from*stringW - 3.5} y={fretY(barre.fret) - 4.5} width={(barre.to - barre.from)*stringW + 7} height={9} rx={4.5} fill="#111827" opacity={0.6} />
            <text x={barre.from*stringW - 7} y={fretY(barre.fret) + 2} textAnchor="middle" fill="#fff" fontSize={5.5}>{barre.finger}</text>
          </g>
        )}
        {shape.map((v, s) => {
          if (typeof v !== "number" || v === 0) return null;
          const cx = s * stringW; const cy = fretY(v); const finger = fingers?.[s];
          return (
            <g key={`f-${s}`}>
              <circle cx={cx} cy={cy} r={5} fill="#4f46e5" />
              {finger ? (
                <text x={cx} y={cy+2} textAnchor="middle" fill="#fff" fontSize={5.5}>{finger}</text>
              ) : (
                <circle cx={cx} cy={cy} r={2.2} fill="#fff" />
              )}
            </g>
          );
        })}
        {!(showNut) && (
          <text x={-4} y={4} fill="#737373" fontSize={6}>{startFret}fr</text>
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
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AudioCtx();
    }
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
  const [reverbMix, setReverbMix] = useState(0.3);
  const [instrumentVolume, setInstrumentVolume] = useState(1.5);
  const { playMidi, ensure, startSine, stopSine, ctxRef, updateReverbMix } = useSF(instrument, reverbMix, instrumentVolume);
  const drums = useDrumSampler();

  useEffect(() => {
    updateReverbMix(reverbMix);
  }, [reverbMix]);

  /* ===== Execução ===== */
  const [patternId, setPatternId] = useState("folk1");
  const [drumPatternId, setDrumPatternId] = useState("rock");
  const [drumsEnabled, setDrumsEnabled] = useState(true);
  const [drumVolume, setDrumVolume] = useState(0.7);
  const [bassEnabled, setBassEnabled] = useState(false);
  const [bassPattern, setBassPattern] = useState("root-fifth");
  const [bassVolume, setBassVolume] = useState(0.6);
  const [bpm] = useState(92);
  const [swing] = useState(0.08);
  const [strumMs, setStrumMs] = useState(12);
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
  const playBassNote = (rootMidi: number, pattern: string, stepIdx: number) => {
    if (!bassEnabled) return;
    const idx = stepIdx % 8;
    let noteMidi = rootMidi;
    let shouldPlay = true;

    switch(pattern) {
      case "root-fifth":
        if (idx === 2 || idx === 6) noteMidi += 7;
        break;
      case "walking":
        if (idx === 1) noteMidi += 2;
        else if (idx === 2) noteMidi += 4;
        else if (idx === 3) noteMidi += 5;
        else if (idx === 4) noteMidi += 7;
        else if (idx === 5) noteMidi += 5;
        else if (idx === 6) noteMidi += 4;
        else if (idx === 7) noteMidi += 2;
        break;
      case "swing":
        if (idx === 0 || idx === 3 || idx === 6) {}
        else if (idx === 2 || idx === 5) noteMidi += 7;
        else shouldPlay = false;
        break;
      case "bossa":
        if (idx === 0 || idx === 3 || idx === 5) {}
        else if (idx === 2) noteMidi += 7;
        else shouldPlay = false;
        break;
      case "steady":
        break;
      case "octave":
        if (idx % 2 === 1) noteMidi += 12;
        break;
      case "arpeggio":
        if (idx === 1 || idx === 5) noteMidi += 4;
        else if (idx === 2 || idx === 6) noteMidi += 7;
        else if (idx === 3 || idx === 7) noteMidi += 12;
        break;
      case "reggae":
        if (idx === 1 || idx === 3 || idx === 5 || idx === 7) shouldPlay = false;
        break;
      case "disco":
        if (idx % 2 === 1) shouldPlay = false;
        break;
      case "funk":
        if (idx === 2) noteMidi += 7;
        else if (idx === 4 || idx === 5) shouldPlay = false;
        break;
      case "rock":
        if (idx === 4) noteMidi += 7;
        break;
      case "jazz-walk":
        if (idx === 1) noteMidi += 2;
        else if (idx === 2) noteMidi += 3;
        else if (idx === 3) noteMidi += 5;
        else if (idx === 4) noteMidi += 7;
        else if (idx === 5) noteMidi += 9;
        else if (idx === 6) noteMidi += 11;
        else if (idx === 7) noteMidi += 10;
        break;
      case "blues":
        if (idx === 2) noteMidi -= 2;
        else if (idx === 4) noteMidi += 7;
        else if (idx === 6) noteMidi += 5;
        break;
      case "latin":
        if (idx === 1 || idx === 3 || idx === 5 || idx === 7) noteMidi += 7;
        break;
      case "country":
        if (idx === 2 || idx === 6) noteMidi += 5;
        else if (idx === 4) noteMidi += 7;
        break;
      case "metal":
        if (idx % 2 === 0) {}
        else shouldPlay = false;
        break;
      case "punk":
        break;
      case "hiphop":
        if (idx === 3 || idx === 7) noteMidi += 7;
        else if (idx === 1 || idx === 5) shouldPlay = false;
        break;
      case "trap":
        if (idx === 0 || idx === 4) {}
        else if (idx === 2 || idx === 6) noteMidi -= 12;
        else shouldPlay = false;
        break;
      case "dnb":
        if (idx % 2 === 0) noteMidi += (idx % 4 === 0 ? 0 : 7);
        else shouldPlay = false;
        break;
      case "techno":
        break;
      case "house":
        if (idx % 2 === 1) shouldPlay = false;
        break;
      case "dubstep":
        if (idx === 0 || idx === 4) {}
        else if (idx === 2 || idx === 6) noteMidi -= 12;
        else shouldPlay = false;
        break;
      case "ska":
        if (idx % 2 === 0) shouldPlay = false;
        break;
      default:
        break;
    }

    if (shouldPlay) {
      void playMidi(noteMidi - 12, 0, 0.5, 1.2 * bassVolume);
    }
  };

  const playDrumStep = (stepIdx: number) => {
    if (!drumsEnabled) return;
    const drumPat = DRUM_PATTERNS[drumPatternId];
    if (!drumPat) return;

    const idx = stepIdx % 16;
    const k = drumPat.kick[idx];
    const s = drumPat.snare[idx];
    const h = drumPat.hihat[idx];

    if (k === "k") void drums.playSample("kick", 0, 0.9 * drumVolume);
    if (s === "s") void drums.playSample("snare", 0, 0.7 * drumVolume);
    if (h === "h") void drums.playSample("hihat", 0, 0.5 * drumVolume);
    if (h === "o") void drums.playSample("openhat", 0, 0.6 * drumVolume);
  };

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

      playDrumStep(singleStepIdxRef.current * 2);

      const mids = voicingMidis(currentVoicing);
      if (mids.length > 0) {
        const rootMidi = findRootMidi(mids, rootName);
        playBassNote(rootMidi, bassPattern, singleStepIdxRef.current);
      }

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
    await drums.ensure();
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

      playDrumStep(seqStepIdxRef.current * 2);

      const mids = voicingMidis(voicing);
      if (mids.length > 0) {
        const rootMidi = findRootMidi(mids, rootName);
        playBassNote(rootMidi, bassPattern, seqStepIdxRef.current);
      }

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
    await drums.ensure();
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
    let cancelled = false;
    (async () => {
      try {
        await startAudio();
        if (cancelled) return;
        let i=0;
        for (let s=0; s<6; s++) {
          if (cancelled) return;
          const v = currentVoicing.shape[s];
          if (v === "x" || v === 0) continue;
          const midi = TUNING_MIDI[s] + Number(v);
          await playMidi(midi, i*0.05, 0.18, 0.85);
          i++;
        }
      } catch (e) {
        console.error('Preview error:', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordKey, variantIdx, instrument]);

  /* ===== Afinador Cromático ===== */
  const tuner = useChromaticTuner();
  const centsClamped = Math.max(-50, Math.min(50, tuner.cents));

  /* ===== UI ===== */
  return (
    <div className="min-h-screen w-full" style={{ background: "#1a1a1a", color: "#e0e0e0" }}>
      <div className="max-w-7xl mx-auto px-6 py-6 grid gap-6">
        {/* Mixer - Fonte & Padrões */}
        <section className="p-6 rounded-xl" style={{background:'linear-gradient(180deg, #2d2d2d 0%, #242424 100%)', boxShadow:'inset 0 2px 1px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.6)', border: '2px solid #1a1a1a'}}>
          <div className="mb-2 pb-1" style={{borderBottom: '1px solid #333'}}>
            <h3 className="text-[9px] font-bold tracking-wider" style={{color:'#888', textTransform:'uppercase', letterSpacing:'1.5px'}}>SOURCE & PATTERNS</h3>
          </div>
          <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-6">
            <div>
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #f59e0b'}}>
                INSTRUMENTO
              </label>
              <select className="w-full rounded border p-4 text-base font-medium" style={{borderColor:'#555', background:'#0d0d0d', color:'#e0e0e0', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}} value={instrument} onChange={(e)=>setInstrument(e.target.value as InstrumentName)}>
              <option value="acoustic_guitar_nylon">Violão Nylon</option>
              <option value="acoustic_guitar_steel">Violão Aço</option>
              <option value="electric_guitar_clean">Guitarra Clean</option>
              <option value="electric_guitar_jazz">Guitarra Jazz</option>
              <option value="electric_guitar_muted">Guitarra Muted</option>
              <option value="overdriven_guitar">Guitarra Overdrive</option>
              <option value="distortion_guitar">Guitarra Distorção</option>
              <option value="acoustic_grand_piano">Piano</option>
            </select>
            </div>
            <div>
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #10b981'}}>
                RITMO VIOLÃO
              </label>
              <select className="w-full rounded border p-4 text-base font-medium" style={{borderColor:'#555', background:'#0d0d0d', color:'#e0e0e0', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}} value={patternId} onChange={(e)=>setPatternId(e.target.value)}>
              {PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            </div>
            <div>
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #ec4899'}}>
                DRUMS PATTERN
              </label>
              <select className="w-full rounded border p-4 text-base mb-3 font-medium" style={{borderColor:'#555', background:'#0d0d0d', color:'#e0e0e0', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}} value={drumPatternId} onChange={(e)=>setDrumPatternId(e.target.value)}>
              {Object.entries(DRUM_PATTERNS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
              <label className="flex items-center justify-center gap-2 text-xs mt-2" style={{color:'#aaa'}}>
                <input type="checkbox" className="w-3 h-3" checked={drumsEnabled} onChange={e=>setDrumsEnabled(e.target.checked)} />
                ENABLE
              </label>
            </div>
            <div>
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #0ea5e9'}}>
                BASS PATTERN
              </label>
              <select className="w-full rounded border p-4 text-base mb-3 font-medium" style={{borderColor:'#555', background:'#0d0d0d', color:'#e0e0e0', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}} value={bassPattern} onChange={(e)=>setBassPattern(e.target.value)}>
                <option value="steady">1. Steady (Fundamental)</option>
                <option value="root-fifth">2. Fundamental + Quinta</option>
                <option value="octave">3. Oitavas Alternadas</option>
                <option value="walking">4. Walking Bass Clássico</option>
                <option value="jazz-walk">5. Walking Jazz Cromático</option>
                <option value="arpeggio">6. Arpejo Ascendente</option>
                <option value="swing">7. Swing Jazz</option>
                <option value="bossa">8. Bossa Nova</option>
                <option value="reggae">9. Reggae (Batidas 1 e 3)</option>
                <option value="disco">10. Disco (Batidas Pares)</option>
                <option value="funk">11. Funk Syncopated</option>
                <option value="rock">12. Rock Alternado</option>
                <option value="blues">13. Blues Shuffle</option>
                <option value="latin">14. Latin/Salsa</option>
                <option value="country">15. Country</option>
                <option value="metal">16. Metal (Colcheias)</option>
                <option value="punk">17. Punk (Contínuo)</option>
                <option value="hiphop">18. Hip Hop</option>
                <option value="trap">19. Trap (Sub Bass)</option>
                <option value="dnb">20. Drum & Bass</option>
                <option value="techno">21. Techno (Four-on-Floor)</option>
                <option value="house">22. House</option>
                <option value="dubstep">23. Dubstep (Wobble)</option>
                <option value="ska">24. Ska (Upbeat)</option>
              </select>
              <label className="flex items-center justify-center gap-2 text-xs mt-2" style={{color:'#aaa'}}>
                <input type="checkbox" className="w-3 h-3" checked={bassEnabled} onChange={e=>setBassEnabled(e.target.checked)} />
                ENABLE
              </label>
            </div>
          </div>
        </section>

        {/* Mixer - Faders */}
        <section className="p-6 rounded-xl" style={{background:'linear-gradient(180deg, #2d2d2d 0%, #242424 100%)', boxShadow:'inset 0 2px 1px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.6)', border: '2px solid #1a1a1a'}}>
          <div className="mb-4 pb-3" style={{borderBottom: '1px solid #333'}}>
            <h3 className="text-xs font-bold tracking-wider" style={{color:'#888', textTransform:'uppercase', letterSpacing:'2px'}}>FADERS & CONTROLS</h3>
          </div>
          <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-8">
            <div className="flex flex-col items-center">
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #f59e0b'}}>
                INST VOLUME
              </label>
              <div className="mb-3 text-center">
                <span className="text-4xl font-mono font-bold" style={{color:'#f59e0b'}}>{Math.round(instrumentVolume * 100)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="4"
                step="0.1"
                value={instrumentVolume}
                onChange={e=>setInstrumentVolume(parseFloat(e.target.value))}
                className="w-full"
                style={{accentColor:'#f59e0b', height:'6px'}}
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #10b981'}}>
                DRUMS VOLUME
              </label>
              <div className="mb-3 text-center">
                <span className="text-4xl font-mono font-bold" style={{color:'#10b981'}}>{Math.round(drumVolume * 100)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={drumVolume}
                onChange={e=>setDrumVolume(parseFloat(e.target.value))}
                className="w-full"
                style={{accentColor:'#10b981', height:'6px'}}
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #0ea5e9'}}>
                BASS VOLUME
              </label>
              <div className="mb-3 text-center">
                <span className="text-4xl font-mono font-bold" style={{color:'#0ea5e9'}}>{Math.round(bassVolume * 100)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={bassVolume}
                onChange={e=>setBassVolume(parseFloat(e.target.value))}
                className="w-full"
                style={{accentColor:'#0ea5e9', height:'6px'}}
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #8b5cf6'}}>
                STRUM SPEED
              </label>
              <div className="mb-3 text-center">
                <span className="text-4xl font-mono font-bold" style={{color:'#8b5cf6'}}>{strumMs}</span>
                <span className="text-sm" style={{color:'#666'}}>ms</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="1"
                value={strumMs}
                onChange={e=>setStrumMs(parseFloat(e.target.value))}
                className="w-full"
                style={{accentColor:'#8b5cf6', height:'6px'}}
              />
              <div className="flex justify-between text-xs mt-2 w-full" style={{color:'#555'}}>
                <span>FAST</span>
                <span>SLOW</span>
              </div>
            </div>
          </div>
        </section>

        {/* Mixer - FX */}
        <section className="p-6 rounded-xl" style={{background:'linear-gradient(180deg, #2d2d2d 0%, #242424 100%)', boxShadow:'inset 0 2px 1px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.6)', border: '2px solid #1a1a1a'}}>
          <div className="mb-4 pb-3" style={{borderBottom: '1px solid #333'}}>
            <h3 className="text-xs font-bold tracking-wider" style={{color:'#888', textTransform:'uppercase', letterSpacing:'2px'}}>EFFECTS</h3>
          </div>
          <div className="grid lg:grid-cols-1 gap-8">
            <div className="flex flex-col items-center">
              <label className="block mb-3 pb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700', borderBottom:'2px solid #06b6d4'}}>
                REVERB MIX
              </label>
              <div className="mb-3 text-center">
                <span className="text-4xl font-mono font-bold" style={{color:'#06b6d4'}}>{Math.round(reverbMix * 100)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={reverbMix}
                onChange={e=>setReverbMix(parseFloat(e.target.value))}
                className="w-full"
                style={{accentColor:'#06b6d4', height:'6px'}}
              />
              <div className="flex justify-between text-xs mt-2 w-full" style={{color:'#555'}}>
                <span>DRY</span>
                <span>WET</span>
              </div>
            </div>
          </div>
        </section>

        {/* ACORDE INDIVIDUAL */}
        <section className="p-6 rounded-lg" style={{background:'linear-gradient(180deg, #2d2d2d 0%, #242424 100%)', boxShadow:'inset 0 2px 1px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.6)', border: isPlayingSingle ? '3px solid #10b981' : '2px solid #1a1a1a'}}>
          <div className="mb-4 pb-3 flex items-center justify-between" style={{borderBottom: '1px solid #333'}}>
            <h3 className="text-xs font-bold tracking-wider" style={{color:'#888', textTransform:'uppercase', letterSpacing:'2px'}}>SINGLE CHORD</h3>
            {isPlayingSingle && <span className="text-xs px-3 py-1 rounded" style={{background:'#10b981', color:'#000', fontWeight:'700', letterSpacing:'1px'}}>PLAYING</span>}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block mb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700'}}>ACORDE</label>
                  <select className="w-full rounded border p-3 text-base font-medium" style={{borderColor:'#555', background:'#0d0d0d', color:'#e0e0e0', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}} value={chordKey} onChange={(e)=>{setChordKey(e.target.value); setVariantIdx(0);}}>
                    {CHORD_KEYS.map(k => <option key={k} value={k}>{CHORDS[k].name}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block mb-2 text-center" style={{color:'#999', textTransform:'uppercase', fontSize:'10px', letterSpacing:'1.5px', fontWeight:'700'}}>VOICING</label>
                  <select className="w-full rounded border p-3 font-medium" style={{borderColor:'#555', background:'#0d0d0d', color:'#e0e0e0', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}} value={variantIdx} onChange={(e)=>setVariantIdx(Number(e.target.value))}>
                    {CHORDS[chordKey].variants.map((v,i)=> <option key={i} value={i}>{v.label.split(' ')[0]}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 my-4">
                <label className="text-xs flex items-center gap-2" style={{color:'#aaa', textTransform:'uppercase', letterSpacing:'1px'}}>
                  <input type="checkbox" className="w-3 h-3" checked={loopSingle} onChange={e=>setLoopSingle(e.target.checked)} />
                  LOOP
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handlePlaySingle}
                  disabled={isPlayingSequence}
                  className="flex-1 px-5 py-3 rounded font-bold text-sm disabled:opacity-50"
                  style={{background:'linear-gradient(180deg, #10b981 0%, #059669 100%)',color:'#000', boxShadow:'0 2px 8px rgba(16,185,129,.4)', border:'1px solid #10b981', textTransform:'uppercase', letterSpacing:'1px'}}
                >
                  {isPlayingSingle ? 'PLAYING...' : 'PLAY'}
                </button>
                <button
                  onClick={handleStopSingle}
                  disabled={!isPlayingSingle}
                  className="px-5 py-3 rounded font-bold disabled:opacity-30"
                  style={{background:'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',color:'#fff', boxShadow:'0 2px 8px rgba(220,38,38,.4)', border:'1px solid #dc2626', textTransform:'uppercase', letterSpacing:'1px'}}
                >
                  STOP
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
        <section className="space-y-3 p-6 rounded-lg" style={{background:'linear-gradient(180deg, #2d2d2d 0%, #242424 100%)', boxShadow:'inset 0 2px 1px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.6)', border: isPlayingSequence ? '3px solid #16a34a' : '2px solid #1a1a1a'}}>
          <div className="mb-4 pb-3 flex items-center justify-between" style={{borderBottom: '1px solid #333'}}>
            <h3 className="text-xs font-bold tracking-wider" style={{color:'#888', textTransform:'uppercase', letterSpacing:'2px'}}>CHORD SEQUENCE</h3>
            {isPlayingSequence && <span className="text-xs px-3 py-1 rounded" style={{background:'#16a34a', color:'#000', fontWeight:'700', letterSpacing:'1px'}}>PLAYING</span>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tonalidade</label>
              <select className="w-full rounded-xl border p-3 text-base" value={key} onChange={(e)=>handleKeyChange(e.target.value)}>
                {["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Progressão (preset)</label>
              <select className="w-full rounded-xl border p-3 text-base" value={progression} onChange={(e)=>handleProgressionChange(e.target.value)}>
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
              style={{background:'#1a1a1a', border: '1px solid #333'}}
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
                      <span className="px-2 py-0.5 rounded-full text-[10px]" style={{background:'#0d0d0d', border: '1px solid #555', color:'#ccc', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}}>
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
                      <button className="text-xs px-2 py-1 rounded" style={{background:'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444'}} onClick={()=>{ const copy=[...sequence]; copy.splice(idx,1); setSequence(copy.length?copy:[{key:'C',varIdx:0, degreeIdx: 0}]); }}>−</button>
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
          <div className="p-4 rounded-2xl" style={{background:'linear-gradient(180deg, #353535 0%, #2a2a2a 100%)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.5)', border: '1px solid #1a1a1a'}}>
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
                <button key={i} onClick={()=>startSine(midiToHz(s.mid))} className="px-3 py-2 rounded-xl" style={{background:'#0d0d0d', border: '1px solid #555', color:'#ccc', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}}>{s.name}</button>
              ))}
              <button onClick={stopSine} className="px-3 py-2 rounded-xl" style={{background:'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444'}}>Parar</button>
            </div>
          </div>

          {/* Cromático (microfone) */}
          <div className="p-4 rounded-2xl" style={{background:'linear-gradient(180deg, #353535 0%, #2a2a2a 100%)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.5)', border: '1px solid #1a1a1a'}}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Afinador cromático (microfone)</span>
              {!tuner.running ? (
                <button onClick={tuner.start} className="px-3 py-2 rounded-xl" style={{background:'#0ea5e9', color:'#fff'}}>🎤 Iniciar</button>
              ) : (
                <button onClick={tuner.stop} className="px-3 py-2 rounded-xl" style={{background:'#dc2626', color:'#fff'}}>Parar</button>
              )}
            </div>
            <div className="text-center mb-4">
              <div className="text-sm text-slate-500 mb-2">Nota detectada</div>
              <div
                className="text-6xl font-bold inline-block px-6 py-3 rounded-2xl"
                style={{
                  letterSpacing: 2,
                  background: tuner.note !== '—' ? '#10b981' : '#e2e8f0',
                  color: tuner.note !== '—' ? '#fff' : '#64748b',
                  boxShadow: tuner.note !== '—' ? '0 4px 20px rgba(16, 185, 129, 0.4)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {tuner.note}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="text-center p-3 rounded-xl" style={{background:'#0d0d0d', border: '1px solid #555', color:'#ccc', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}}>
                <div className="text-xs text-gray-500 mb-1">Frequência</div>
                <div className="text-xl font-semibold">{tuner.freq? tuner.freq.toFixed(1)+" Hz" : "—"}</div>
              </div>
              <div className="text-center p-3 rounded-xl" style={{background:'#0d0d0d', border: '1px solid #555', color:'#ccc', boxShadow:'inset 0 2px 4px rgba(0,0,0,0.5)'}}>
                <div className="text-xs text-gray-500 mb-1">Cents</div>
                <div className="text-xl font-semibold" style={{color: Math.abs(tuner.cents) < 5 ? '#10b981' : '#ef4444'}}>{tuner.freq? `${tuner.cents>0?'+':''}${tuner.cents}` : '—'}</div>
              </div>
            </div>
            {/* tuner bar */}
            <div className="mt-4 px-4">
              <div className="relative h-12 rounded" style={{background:'linear-gradient(90deg, #ef4444 0%, #22c55e 50%, #ef4444 100%)'}}>
                <div
                  className="absolute top-0 bottom-0 w-1 transition-all duration-75"
                  style={{
                    left: `${50 + (centsClamped / 50) * 50}%`,
                    background:'#fff',
                    boxShadow:'0 0 8px rgba(255,255,255,0.8)'
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-mono font-bold" style={{color:'#000'}}>
                  <span>-50¢</span>
                  <span>0¢</span>
                  <span>+50¢</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-500 text-center">Dica: use fones e um local silencioso para melhor leitura.</div>
          </div>
        </section>

        <footer className="text-xs text-gray-500 text-center pb-6">
          <p>Kamilly Play — feito para funcionar bem em smartphones (layout rolável, botões grandes, header fixo).</p>
          <p className="mt-2" style={{ color: '#666', fontSize: '11px' }}>App criado e desenvolvido por <span style={{ color: '#888', fontWeight: '600' }}>Julio Rogerio Almeida de Souza</span></p>
        </footer>
      </div>
    </div>
  );
}
