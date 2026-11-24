// Scripted gesture traces for spec 4b "1. Noticing (two gates)". Verdicts written BEFORE the NEW rules (hand slip, quick reference)
// were built; they are the spec's answer, not the engine's. Do not edit a verdict to make a run pass.
// One student per trace. Times are seconds; paragraphs count from 1. Unless a trace says otherwise the class is on paragraph 8
// (it has moved on), the class count is 0 and the alert threshold is 6.
// expect: highest tier the paragraph ever reaches during the trace (every paragraph not listed must stay "none").
// change: gate 2, the time the plainer sentence would apply (first return to the paragraph after the mark), or null for never.

const pos = (t, paragraph) => ({ t, kind: "position", paragraph });
const ev = (t, kind, paragraph) => (paragraph === undefined ? { t, kind } : { t, kind, paragraph });
const seq = (...parts) => parts.flat().sort((a, b) => a.t - b.t);
/** A quiet reader: paragraphs 1 to 6, 50 s each, no go-backs. On paragraph 6 from 250 s; 4 whole quiet minutes before 300 s. */
const P = [pos(0, 1), pos(50, 2), pos(100, 3), pos(150, 4), pos(200, 5), pos(250, 6)];
/** Up to `to`, stay `stay` seconds, then back home (default paragraph 6, the front). */
const trip = (t, to, stay, home = 6) => [pos(t, to), pos(t + stay, home)];
const trips = (ts, to, stay, home = 6) => ts.flatMap((t) => trip(t, to, stay, home));
/** A skim from 6 up to 2 and back down, 1.5 s per paragraph, no stop anywhere; not back at 6 until 10.5 s later. */
const skim = (t) => [5, 4, 3, 2, 3, 4, 5, 6].map((p, i) => pos(t + 1.5 * i, p));
const activity = (from, to, every = 5) => Array.from({ length: Math.floor((to - from) / every) }, (_, i) => ev(from + every * (i + 1), "activity"));

// Habitual scroller, focused kind: reads 60 s per paragraph (paragraph 6 from 300 s), and every minute from minute 1 goes back to
// the paragraph just behind twice, 5 s each, then home. Their own bar becomes 4.
const habitPrelude = [1, 2, 3, 4, 5, 6].map((p, i) => pos(60 * i, p));
const habitTrips = [1, 2, 3, 4, 5].flatMap((m) => [20, 40].flatMap((o) => trip(60 * m + o, m, 5, m + 1)));
// Habitual scroller, spread kind: same reading pace, five trips a minute to different paragraphs behind, 3-5 s stops.
const spreadTrips = Array.from({ length: 9 }, (_, k) => k + 1).flatMap((m) => {
  const front = Math.min(6, m + 1);
  return [5, 15, 25, 35, 45].flatMap((o, j) => (front < 2 ? [] : trip(60 * m + o, 1 + ((m + j) % (front - 1)), 3 + (j % 3), front)));
});

export const TRACES = [
  // --- hand slip (rule 2, NEW) ---------------------------------------------------------------------------------------------
  { id: "S1", cat: "hand slip", what: "slip up one paragraph, corrected in 1 s", events: seq(P, trip(300, 5, 1)), expect: {} },
  { id: "S2", cat: "hand slip", what: "slip up two paragraphs, 2.5 s there, corrected", events: seq(P, trip(300, 4, 2.5)), expect: {} },
  { id: "S3", cat: "hand slip", what: "four slips to p4 in one minute, 2.5 s each, all corrected within 3 s", events: seq(P, trips([300, 315, 330, 345], 4, 2.5)), expect: {} },
  {
    id: "S4", cat: "hand slip", what: "burst up over three paragraphs, 2.1 s on p3, back to p6 within 3 s; twice",
    events: seq(P, [pos(300, 5), pos(300.4, 4), pos(300.8, 3), pos(302.9, 6), pos(330, 5), pos(330.4, 4), pos(330.8, 3), pos(332.9, 6)]), expect: {},
  },
  {
    id: "S5", cat: "hand slip", what: "slip to p4 then tab hidden within 3 s (2.8 s, 2.9 s visible); twice",
    events: seq(P, [pos(300, 4), ev(302.8, "tabHidden"), ev(330, "tabVisible"), pos(331, 6), pos(335, 4), ev(337.9, "tabHidden"), ev(350, "tabVisible"), pos(351, 6)]), expect: {},
  },
  { id: "S6", cat: "hand slip", what: "slip NOT corrected, hands off: reads p5 for 40 s with no input (one return is never enough)", events: seq(P, trip(300, 5, 40)), expect: {} },
  { id: "S7", cat: "hand slip", what: "slip NOT corrected, tab hidden after 5 s (outside 3 s): one return", events: seq(P, [pos(300, 5), ev(305, "tabHidden"), ev(360, "tabVisible"), pos(362, 6)]), expect: {} },
  {
    id: "S8", cat: "hand slip", what: "control: same as S3 but 3.5 s each (not a slip) = four quick references = one medium x2 -> dot",
    events: seq(P, trips([300, 315, 330, 345], 4, 3.5), trip(400, 4, 30)), expect: { 4: "dot" }, change: { 4: 400 },
  },
  {
    id: "S9", cat: "hand slip", what: "a slip between two full returns to p4 doesn't break them",
    events: seq(P, trip(300, 4, 25), trip(330, 5, 1), trip(340, 4, 25), trip(420, 4, 30)), expect: { 4: "dot" }, change: { 4: 420 },
  },

  // --- skim (rule 3, built) ------------------------------------------------------------------------------------------------
  { id: "K1", cat: "skim", what: "skim up to p2 and back down, no 2 s stop", events: seq(P, skim(300)), expect: {} },
  { id: "K2", cat: "skim", what: "four skims in one minute", events: seq(P, skim(300), skim(315), skim(330), skim(345)), expect: {} },
  { id: "K3", cat: "skim", what: "a skim, then one full return to p4", events: seq(P, skim(300), trip(320, 4, 30)), expect: {} },

  // Q2, Q4, Q5, Q8, Q9 and M1: stops changed 8 s -> 4 s on 2026-11-03 after REFERENCE_MAX_STOP_S = 6 (spec 4b; an 8 s stop is
  // now a reread). Verdicts unchanged. Q1 and Q3 keep 8 s: their verdicts (none) hold either way.
  // --- quick reference (rule 4, NEW) ---------------------------------------------------------------------------------------
  { id: "Q1", cat: "quick reference", what: "one quick reference: up to p3, 8 s, back to the front", events: seq(P, trip(300, 3, 8)), expect: {} },
  { id: "Q2", cat: "quick reference", what: "two quick references to p3 = one medium, not a mark", events: seq(P, trips([300, 330], 3, 4)), expect: {} },
  { id: "Q3", cat: "quick reference", what: "two quick references to different paragraphs", events: seq(P, trip(300, 3, 8), trip(330, 2, 8)), expect: {} },
  { id: "Q4", cat: "quick reference", what: "three quick references to p3 in a minute = 1.5 medium", events: seq(P, trips([300, 320, 340], 3, 4)), expect: {} },
  {
    id: "Q5", cat: "quick reference", what: "four quick references to p3 in a minute = two medium -> dot",
    events: seq(P, trips([300, 314, 328, 342], 3, 4), trip(400, 3, 30)), expect: { 3: "dot" }, change: { 3: 400 },
  },
  {
    id: "Q6", cat: "quick reference", what: "back only to p5 (not the front) within 20 s, front after 30 s: full returns; twice -> dot",
    events: seq(P, [pos(300, 3), pos(310, 5), pos(330, 6), pos(335, 3), pos(345, 5), pos(365, 6)], trip(420, 3, 30)), expect: { 3: "dot" }, change: { 3: 420 },
  },
  { id: "Q7", cat: "quick reference", what: "back to the front after 25 s (outside 20 s): full returns; twice -> dot", events: seq(P, trips([300, 330], 3, 25), trip(420, 3, 30)), expect: { 3: "dot" }, change: { 3: 420 } },
  { id: "Q8", cat: "quick reference", what: "one quick reference + one full return to p3 = 1.5", events: seq(P, trip(300, 3, 4), trip(320, 3, 25)), expect: {} },
  {
    id: "Q9", cat: "quick reference", what: "two quick references + one full return to p3 = 2 -> dot",
    events: seq(P, trips([300, 315], 3, 4), trip(330, 3, 25), trip(420, 3, 30)), expect: { 3: "dot" }, change: { 3: 420 },
  },

  // --- teacher-directed jump (rule 1, built) -------------------------------------------------------------------------------
  {
    id: "D1", cat: "teacher-directed", what: "directed jump to p4 (heard) + one own return later",
    events: seq(P, trip(305, 4, 30), trip(345, 4, 25)), directed: [{ paragraph: 4, t0: 300, t1: 310 }], expect: {},
  },
  {
    id: "D2", cat: "teacher-directed", what: "teacher scrolls back to p4 for 100 s; two full returns to p4 meanwhile",
    events: seq(P, trip(302, 4, 25), trip(330, 4, 25)), classAt: (t) => (t >= 300 && t < 400 ? 4 : 8), expect: {},
  },
  {
    id: "D3", cat: "teacher-directed", what: "class jump to p4 found from 3 classmates landing within 10 s + one own return",
    events: seq(P, trip(301, 4, 30), trip(340, 4, 25)),
    others: [300, 302, 305].map((t) => seq(P, trip(t, 4, 30))), expect: {},
  },
  {
    id: "D4", cat: "teacher-directed", what: "directed jump, then two own full returns in the next minute -> dot",
    events: seq(P, trip(305, 4, 20), trip(340, 4, 25), trip(370, 4, 25), trip(450, 4, 30)), directed: [{ paragraph: 4, t0: 300, t1: 310 }],
    expect: { 4: "dot" }, change: { 4: 450 },
  },

  // --- one reread (rule 5, built) ------------------------------------------------------------------------------------------
  { id: "R1", cat: "one reread", what: "one full reread of p4", events: seq(P, trip(300, 4, 30)), expect: {} },
  { id: "R2", cat: "one reread", what: "one reread + copy without leaving the tab", events: seq(P, pos(300, 4), ev(310, "copy", 4), pos(330, 6)), expect: {} },
  { id: "R3", cat: "one reread", what: "one long reread with activity (dwell only)", events: seq(P, pos(300, 4), activity(300, 395), pos(400, 6)), expect: {} },

  // --- focused returns beyond own habit (rule 6, built) --------------------------------------------------------------------
  {
    id: "H1", cat: "beyond habit", what: "quiet student, two full returns to p4 in a minute, active input",
    events: seq(P, trips([300, 330], 4, 25), activity(300, 324), activity(330, 354), trip(420, 4, 30)), expect: { 4: "dot" }, change: { 4: 420 },
  },
  {
    id: "H2", cat: "beyond habit", what: "same returns while the class count on p4 is at the threshold -> swap",
    events: seq(P, trips([300, 330], 4, 25), trip(420, 4, 30)), counts: { 4: 6 }, expect: { 4: "swap" }, change: { 4: 420 },
  },
  { id: "H3", cat: "beyond habit", what: "two full returns to p4 in different minutes", events: seq(P, trip(300, 4, 25), trip(400, 4, 25)), expect: {} },
  {
    id: "H4", cat: "beyond habit", what: "focus vs spread: two full returns to p4 among three other go-backs that minute",
    // 6 -> 5 -> 3 -> 1 (4 s on p1) -> 6: no step is followed by a return to its prior paragraph within 3 s, so none is a slip.
    events: seq(P, trip(300, 4, 25), [pos(326, 5), pos(327.5, 3), pos(329, 1), pos(333, 6)], trip(340, 4, 25)), expect: {},
  },

  // --- still reader (stops without input still count) ----------------------------------------------------------------------
  { id: "T1", cat: "still reader", what: "two full returns to p4, hands off, no input events at all", events: seq(P, trips([300, 330], 4, 25), trip(420, 4, 30)), expect: { 4: "dot" }, change: { 4: 420 } },
  { id: "T2", cat: "still reader", what: "four quick references to p3, 5 s hands-off stops", events: seq(P, trips([300, 314, 328, 342], 3, 5), trip(400, 3, 30)), expect: { 3: "dot" }, change: { 3: 400 } },

  // --- habitual scroller ---------------------------------------------------------------------------------------------------
  { id: "B1", cat: "habitual scroller", what: "goes back twice a minute (bar 4), then two full returns to p4", events: seq(habitPrelude, habitTrips, trips([360, 390], 4, 25)), expect: {} },
  { id: "B2", cat: "habitual scroller", what: "five go-backs a minute to different paragraphs for 9 minutes", events: seq(habitPrelude, spreadTrips), end: 600, expect: {} },
  {
    id: "B3", cat: "habitual scroller", what: "B1's scroller looks a word up on p4: strong signals skip the habit check",
    events: seq(habitPrelude, habitTrips, trip(360, 4, 25), ev(365, "wordLookup", 4), trip(390, 4, 25)), expect: { 4: "swap" }, change: { 4: 390 },
  },

  // --- warm-up minutes -----------------------------------------------------------------------------------------------------
  {
    id: "W1", cat: "warm-up", what: "two full returns in minute 2 (go-backs don't count before 3 minutes)",
    events: seq([pos(0, 1), pos(30, 2), pos(60, 3), pos(90, 4)], trips([100, 130], 2, 25, 4)), expect: {},
  },
  {
    id: "W2", cat: "warm-up", what: "four quick references in minute 2",
    events: seq([pos(0, 1), pos(30, 2), pos(60, 3), pos(90, 4)], trips([95, 108, 121, 134], 2, 6, 4)), expect: {},
  },
  {
    id: "W3", cat: "warm-up", what: "word lookup in minute 1 counts (strong), never comes back",
    events: seq([pos(0, 1), pos(30, 2), ev(40, "wordLookup", 2), pos(60, 3), pos(90, 4)]), end: 200, expect: { 2: "swap" }, change: { 2: null },
  },
  {
    id: "W4", cat: "warm-up", what: "copy then leave in minute 1, back to p2 later",
    events: seq([pos(0, 1), pos(30, 2), ev(45, "copy", 2), ev(48, "tabHidden"), ev(80, "tabVisible"), pos(85, 3), pos(120, 2), pos(150, 3)]),
    expect: { 2: "swap" }, change: { 2: 120 },
  },

  // --- copy-then-leave -----------------------------------------------------------------------------------------------------
  {
    id: "C1", cat: "copy-then-leave", what: "copy on p4, tab hidden 5 s later, returns to p4 at 300",
    events: seq([pos(0, 1), pos(50, 2), pos(100, 3), pos(150, 4), ev(170, "copy", 4), ev(175, "tabHidden"), ev(205, "tabVisible"), pos(210, 5), pos(260, 6), pos(300, 4), pos(330, 6)]),
    expect: { 4: "swap" }, change: { 4: 300 },
  },
  {
    id: "C2", cat: "copy-then-leave", what: "copy, tab hidden 15 s later (outside 10 s)",
    events: seq([pos(0, 1), pos(50, 2), pos(100, 3), pos(150, 4), ev(170, "copy", 4), ev(185, "tabHidden"), ev(215, "tabVisible"), pos(220, 5), pos(260, 6)]), expect: {},
  },
  {
    id: "C3", cat: "copy-then-leave", what: "copy and leave, then reads forward only (no change ever)",
    events: seq([pos(0, 1), pos(50, 2), pos(100, 3), pos(150, 4), ev(170, "copy", 4), ev(175, "tabHidden"), ev(205, "tabVisible"), pos(210, 5), pos(260, 6), pos(310, 7)]),
    end: 400, expect: { 4: "swap" }, change: { 4: null },
  },

  // --- word lookup ---------------------------------------------------------------------------------------------------------
  { id: "L1", cat: "word lookup", what: "lookup on p5 while reading it, then forward only", events: seq(P, ev(220, "wordLookup", 5)), end: 400, expect: { 5: "swap" }, change: { 5: null } },
  {
    id: "L2", cat: "word lookup", what: "lookup on p5; a 1 s slip onto p5 is not the return; the real return at 340 is",
    events: seq(P, ev(220, "wordLookup", 5), trip(300, 5, 1), trip(340, 5, 20)), expect: { 5: "swap" }, change: { 5: 340 },
  },
  {
    id: "L3", cat: "word lookup", what: "lookup on p5; a skim passes back through p5 at 300 (re-enters view)",
    events: seq(P, ev(220, "wordLookup", 5), skim(300)), expect: { 5: "swap" }, change: { 5: 300 },
  },

  // --- mixes ---------------------------------------------------------------------------------------------------------------
  { id: "M1", cat: "mix", what: "slip + quick reference + full return to p4 = 0 + 0.5 + 1", events: seq(P, trip(300, 4, 1), trip(310, 4, 4), trip(325, 4, 25)), expect: {} },
  {
    id: "M2", cat: "mix", what: "two full returns to p4 with four slips between: slips dilute focus (2 of 6 is under half) -> none; re-ruled 2026-11-03 (slips count as fidgeting, never as returns; a stuck fidgeter is caught by strong signals)",
    events: seq(P, trip(300, 4, 25), trips([327, 330, 333, 336], 5, 1), trip(340, 4, 25), trip(420, 4, 30)), expect: {},
  },
  { id: "M3", cat: "mix", what: "tab away 40 s with nothing copied, then one reread", events: seq(P, ev(300, "tabHidden"), ev(340, "tabVisible"), trip(345, 4, 30)), expect: {} },
  {
    id: "M4", cat: "mix", what: "one quick reference to p3 + a word lookup on p5",
    events: seq(P, trip(300, 3, 8), pos(320, 5), ev(325, "wordLookup", 5), pos(340, 6), trip(400, 5, 20)), expect: { 5: "swap" }, change: { 5: 400 },
  },
  { id: "M5", cat: "mix", what: "fast reader ahead of the class (class on p3) goes back to p5 twice", events: seq(P, trips([300, 330], 5, 25)), classAt: () => 3, expect: {} },
  {
    id: "M6", cat: "mix", what: "slip to p4 then tab hidden; on return looks a word up on p4: change waits for a real return",
    events: seq(P, pos(300, 4), ev(301, "tabHidden"), ev(340, "tabVisible"), ev(345, "wordLookup", 4), pos(350, 6), trip(400, 4, 20)),
    expect: { 4: "swap" }, change: { 4: 400 },
  },

  // --- reread vs glance (added 11-03 after the class regression; written before REFERENCE_MAX_STOP_S was built) -------------
  // Coordinator's ruling: a stop of 6 s or more is a reread (an ordinary focused return) even if the student is back at the front
  // within 20 s; only stops under 6 s are quick references. Expected = what the pre-4b engine gave for rereads.
  { id: "N1", cat: "reread vs glance", what: "two 9 s rereads of p3, each back to the front within 20 s -> dot", events: seq(P, trips([300, 330], 3, 9), trip(420, 3, 30)), expect: { 3: "dot" }, change: { 3: 420 } },
  { id: "N2", cat: "reread vs glance", what: "rereads of p4 for 8 s and 10 s, back to the front -> dot", events: seq(P, trip(300, 4, 8), trip(330, 4, 10), trip(420, 4, 30)), expect: { 4: "dot" }, change: { 4: 420 } },
  { id: "N3", cat: "reread vs glance", what: "habitual scroller (bar 4) makes two 9 s rereads of p4 -> none", events: seq(habitPrelude, habitTrips, trips([360, 390], 4, 9)), expect: {} },
  { id: "N4", cat: "reread vs glance", what: "two 9 s rereads of p3 while the class count there is at the threshold -> swap", events: seq(P, trips([300, 330], 3, 9), trip(420, 3, 30)), counts: { 3: 6 }, expect: { 3: "swap" }, change: { 3: 420 } },
  { id: "N5", cat: "reread vs glance", what: "two glances back to p3 (3.5 s and 5 s), back to the front: still references", events: seq(P, trip(300, 3, 3.5), trip(330, 3, 5)), expect: {} },
  { id: "N6", cat: "reread vs glance", what: "four 4 s glances to p3 in a minute = two medium -> dot", events: seq(P, trips([300, 314, 328, 342], 3, 4), trip(400, 3, 30)), expect: { 3: "dot" }, change: { 3: 400 } },
  { id: "N7", cat: "reread vs glance", what: "boundary: two 5.9 s stops on p3, back to the front -> references -> none", events: seq(P, trips([300, 330], 3, 5.9)), expect: {} },
  { id: "N8", cat: "reread vs glance", what: "boundary: two 6.0 s stops on p3, back to the front -> rereads -> dot", events: seq(P, trips([300, 330], 3, 6), trip(420, 3, 30)), expect: { 3: "dot" }, change: { 3: 420 } },
  { id: "N9", cat: "reread vs glance", what: "rule order: two 2.5 s stops that return within 3 s are still slips", events: seq(P, trips([300, 330], 3, 2.5)), expect: {} },
  { id: "N10", cat: "reread vs glance", what: "rule order: four 2.5 s slips to p3 plus two 9 s rereads of p3 -> none (slips dilute: 2 of 6 under half); re-ruled 2026-11-03, same reason as M2", events: seq(P, trips([300, 304, 308, 312], 3, 2.5), trips([320, 340], 3, 9), trip(420, 3, 30)), expect: {} },
  // Slips still count as go-backs in the focus-share denominator (coordinator ruling 2026-11-03): fidgety jumps make real returns
  // look less focused, never more. Two slips beside two full returns: 2 of 4 go-backs, still focused enough.
  { id: "N11", cat: "reread vs glance", what: "two full returns to p4 with two slips between -> dot (slips dilute, but 2 of 4 is enough)", events: seq(P, trip(300, 4, 25), trips([327, 333], 5, 1), trip(340, 4, 25), trip(420, 4, 30)), expect: { 4: "dot" }, change: { 4: 420 } },
];
