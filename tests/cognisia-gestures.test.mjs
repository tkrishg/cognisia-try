#!/usr/bin/env node
// Gesture trace test for spec 4b "1. Noticing (two gates)": node tests/cognisia-gestures.test.mjs [-v]
// Ported copy: the only change from the original is that it imports the browser engine in assets/js/engine/ (no TS loader).
// Runs every trace in tests/cognisia-gesture-traces.mjs through the real engine the way the live page would: at every second
// (and every event time) it judges the student from only the events so far. Gate 1 = the highest tier each paragraph reaches;
// gate 2 = when the change would apply (H.changeAt), checked only where a trace names it. Verdicts were written before the rules.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const H = await imp("assets/js/engine/habit.js");
const { findDirected } = await imp("assets/js/engine/directed.js");
const { TRACES } = await imp("tests/cognisia-gesture-traces.mjs");

const WINDOW_S = 150; // sim.ts STUCK_WINDOW_S
const PARAGRAPHS = 12;
const RANK = { none: 0, dot: 1, swap: 2 };
const verbose = process.argv.includes("-v");

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

const rows = TRACES.map((tr) => ({ tr, ...run(tr) }));
const byCat = new Map();
let g1 = 0, g2 = 0, g2n = 0;
for (const r of rows) {
  const ok1 = r.tierFails.length === 0;
  const ok2 = r.gate2.every((x) => x.ok);
  g1 += ok1;
  g2n += r.gate2.length;
  g2 += r.gate2.filter((x) => x.ok).length;
  const c = byCat.get(r.tr.cat) ?? { n: 0, pass: 0 };
  c.n++, (c.pass += ok1 && ok2 ? 1 : 0), byCat.set(r.tr.cat, c);
  const tiers = r.tierFails.map(([p, got, want]) => `p${p} got ${got}, want ${want}`).join("; ");
  const ch = r.gate2.filter((x) => !x.ok).map((x) => `change p${x.p} got ${x.got}, want ${x.want} (mark at ${x.mark})`).join("; ");
  if (!ok1 || !ok2 || verbose) {
    const marks = r.markAt.map((m, i) => (m === null ? "" : `p${i + 1} ${r.best[i]} from ${m}`)).filter(Boolean).join(", ");
    console.log(`${ok1 && ok2 ? "PASS" : "FAIL"}  ${r.tr.id} [${r.tr.cat}] ${r.tr.what}${tiers ? `  -- ${tiers}` : ""}${ch ? `  -- ${ch}` : ""}${verbose ? `  {${marks || "no marks"}}` : ""}`);
  }
}
console.log("\nby category (trace passes only if gate 1 and any gate 2 check pass):");
for (const [cat, c] of byCat) console.log(`  ${cat.padEnd(18)} ${c.pass}/${c.n}`);
const all = rows.filter((r) => r.tierFails.length === 0 && r.gate2.every((x) => x.ok)).length;
console.log(`\ngate 1 (tiers): ${g1}/${rows.length}   gate 2 (change time): ${g2}/${g2n}   traces fully passing: ${all}/${rows.length}`);
process.exit(all === rows.length ? 0 : 1);
