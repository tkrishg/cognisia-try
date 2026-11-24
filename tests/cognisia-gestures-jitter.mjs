#!/usr/bin/env node
// Jitter robustness test for tests/cognisia-gestures.test.mjs: node tests/cognisia-gestures-jitter.mjs [-v]
// Ported copy: the only change from the original is that it imports the browser engine in assets/js/engine/ (no TS loader).
// Every event time in every trace (own events, classmates' events, directed windows, the classAt step) is moved by uniform noise,
// 50 runs per trace at +-0.3 s and 50 at +-1.0 s. Order of a trace's events is preserved (clamped to the previous event) and times
// stay >= 0. A run "keeps" when the tier verdict equals the trace's written `expect` and each gate-2 change time is within the
// jitter of the written `change` time (or both null). Evaluation (run) is the existing test's loop, copied unchanged except that
// it takes the jittered trace. Pass marks: +-0.3 s >= 95% of traces keep in all 50 runs and every flip is explained by a named
// threshold (done by hand in JITTER-RESULT.md from the flip report this prints); +-1.0 s is report only.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const H = await imp("assets/js/engine/habit.js");
const { findDirected } = await imp("assets/js/engine/directed.js");
const { TRACES } = await imp("tests/cognisia-gesture-traces.mjs");

const SEED = 20261123;
const RUNS = 50;
const LEVELS = [0.3, 1.0];
const WINDOW_S = 150; // sim.ts STUCK_WINDOW_S
const PARAGRAPHS = 12;
const RANK = { none: 0, dot: 1, swap: 2 };

// ---- evaluation: identical to the existing test's run() -------------------------------------------------------------------
function run(tr) {
  const directed = tr.others ? findDirected([tr.events, ...tr.others]) : tr.directed;
  const ctx = { classAt: tr.classAt ?? (() => 8), directed };
  const counts = Array.from({ length: PARAGRAPHS }, (_, i) => tr.counts?.[i + 1] ?? 0);
  const threshold = tr.threshold ?? 6;
  const t0 = tr.events[0].t;
  const end = tr.end ?? tr.events.at(-1).t + 25;
  const times = [...new Set([...Array.from({ length: Math.floor(end - t0) + 1 }, (_, i) => t0 + i), ...tr.events.map((e) => e.t)])].sort((a, b) => a - b);
  const best = Array(PARAGRAPHS).fill("none");
  const markAt = Array(PARAGRAPHS).fill(null);
  for (const t of times) {
    const evs = tr.events.filter((e) => e.t <= t);
    H.paragraphTiers(H.habitSignals(evs, ctx, t), t, WINDOW_S, counts, threshold).forEach((x, i) => {
      if (RANK[x] > RANK[best[i]]) best[i] = x;
      if (x !== "none" && markAt[i] === null) markAt[i] = t;
    });
  }
  const tierFails = best.map((x, i) => [i + 1, x, tr.expect[i + 1] ?? "none"]).filter(([, got, want]) => got !== want);
  const gate2 = Object.entries(tr.change ?? {}).map(([p, want]) => {
    const m = markAt[p - 1];
    const got = typeof H.changeAt !== "function" ? "not built" : m === null ? "no mark" : H.changeAt(tr.events, Number(p), m);
    return { p: Number(p), want, got, mark: m, ok: got === want };
  });
  return { best, markAt, tierFails, gate2 };
}

// ---- seeded noise ---------------------------------------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const r3 = (x) => Math.round(x * 1000) / 1000; // 1 ms grid keeps clamps exact

/** Jitter a time-sorted event list: each t += U(-J,J), clamped to >= 0 and to >= the previous event's new time. */
function jitterEvents(events, J, rnd) {
  let prev = 0;
  return events.map((e) => {
    const t = Math.max(prev, 0, r3(e.t + (rnd() * 2 - 1) * J));
    prev = t;
    return { ...e, t };
  });
}
function jitterTrace(tr, J, rnd) {
  const out = { ...tr, events: jitterEvents(tr.events, J, rnd) };
  if (tr.others) out.others = tr.others.map((o) => jitterEvents(o, J, rnd));
  if (tr.directed) out.directed = tr.directed.map((d) => {
    const a = Math.max(0, r3(d.t0 + (rnd() * 2 - 1) * J));
    const b = Math.max(a, r3(d.t1 + (rnd() * 2 - 1) * J));
    return { ...d, t0: a, t1: b };
  });
  if (tr.classAt) { const d = r3((rnd() * 2 - 1) * J); out.classAt = (t) => tr.classAt(t - d); } // the step's edges move by d
  return out;
}

// ---- keep test ------------------------------------------------------------------------------------------------------------
const EPS = 1e-6;
function verdict(r, J) {
  const reasons = [];
  for (const [p, got, want] of r.tierFails) reasons.push(`tier p${p} got ${got} want ${want}`);
  for (const g of r.gate2) {
    const ok = g.want === null ? g.got === null : typeof g.got === "number" && Math.abs(g.got - g.want) <= J + EPS;
    if (!ok) reasons.push(`change p${g.p} got ${g.got === "no mark" ? "no mark" : g.got} want ${g.want}`);
  }
  return reasons;
}

// baseline (no noise) must equal the written verdicts
const base = TRACES.filter((tr) => verdict(run(tr), 0).length);
if (base.length) { console.log("BASELINE FAILS (jitter test void):", base.map((t) => t.id).join(", ")); process.exit(2); }

const report = { seed: SEED, runs: RUNS, levels: {} };
for (const J of LEVELS) {
  const lvl = { kept: 0, byCat: {}, flips: [] };
  for (const tr of TRACES) {
    const rnd = mulberry32(SEED ^ hash(`${tr.id}@${J}`));
    const fails = new Map();
    let n = 0;
    for (let k = 0; k < RUNS; k++) {
      const reasons = verdict(run(jitterTrace(tr, J, rnd)), J);
      if (reasons.length) { n++; for (const x of reasons) fails.set(x, (fails.get(x) ?? 0) + 1); }
    }
    const c = (lvl.byCat[tr.cat] ??= { n: 0, kept: 0 });
    c.n++;
    if (n === 0) { lvl.kept++; c.kept++; } else lvl.flips.push({ id: tr.id, cat: tr.cat, what: tr.what, flipRuns: n, how: [...fails].map(([x, v]) => `${x} (${v})`) });
  }
  report.levels[J] = lvl;
  console.log(`\n=== +-${J} s: kept ${lvl.kept}/${TRACES.length} (${((100 * lvl.kept) / TRACES.length).toFixed(1)}%), seed ${SEED}, ${RUNS} runs per trace`);
  for (const [cat, c] of Object.entries(lvl.byCat)) console.log(`  ${cat.padEnd(18)} ${c.kept}/${c.n}`);
  for (const f of lvl.flips) console.log(`  FLIP ${f.id} [${f.cat}] ${f.flipRuns}/${RUNS} runs: ${f.how.join("; ")}\n       ${f.what}`);
}
if (process.argv.includes("--json")) console.log(JSON.stringify(report));
const pass = report.levels[0.3].kept / TRACES.length >= 0.95;
console.log(`\n+-0.3 s kept-in-all-runs >= 95%: ${pass ? "yes" : "NO"} (flip explanations are checked by hand against the thresholds)`);
