// Cognisia reader. The rules are the real engine (./engine, ported from the case study's tested code and never edited here); this
// file only feeds it your reading and draws what it decides:
//  - gate 1: a paragraph you go back to and stay on, beyond your own habit, gets a dot in the margin (paragraphTiers);
//  - gate 2: when you come back to it after that, its hardest sentence turns plainer in place (changeAt), with the original
//    one click away.
// Reading position = the paragraph at the reading line (the case-study reader's pane.ts), reported once it has rested there.
// The word swap, band, rule and highlight are the case study's Try-it card (tryit.js), adapted from a scroll box to the page.
// Nothing leaves the browser: no network, no storage.
import { changeAt, habitSignals, paragraphTiers } from "./engine/habit.js";

const WINDOW_S = 150; // sim.ts STUCK_WINDOW_S: signals older than this stop counting
const READING_LINE = 0.4; // pane.ts: where you are reading, as a fraction of the window's height from the top
// A paragraph counts once the reading line has rested in it this long, and counts from when it arrived. The case-study reader
// (pane.ts) used 300 ms; on a whole page, scrolling back past a paragraph often rests there longer than that, the engine then
// counts the pass as a go-back, and its focus rule (rereads >= half of all go-backs in a minute) turns down real rereads. The
// gesture traces model a trip back as a direct jump and their shortest modelled stop is 1.5 s, so 1 s keeps every trace's input.
const SETTLE_MS = 1000;
const T = { rule: 120, out: 160, in: 240, stagger: 30, dwell: 400, fade: 150 }; // tryit.js timings, ms

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const wide = matchMedia("(min-width: 1100px)");
const hasHL = typeof CSS !== "undefined" && !!CSS.highlights && typeof Highlight === "function";
const HL = hasHL ? new Highlight() : null;
const el = (tag, cls, text) => {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text != null) x.textContent = text;
  return x;
};
const tokens = (s) => s.trim().match(/\S+\s*/g) || [];
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); // punctuation and case changes are not "changed words"
const word = (t) => {
  const s = el("span", "w", t);
  s.dataset.w = norm(t);
  return s;
};
const live = document.getElementById("live");
const say = (msg) => {
  live.textContent = "";
  requestAnimationFrame(() => (live.textContent = msg));
};

// ---- the paragraphs ------------------------------------------------------------------------------------------------------
const units = [...document.querySelectorAll(".u")].map((u) => {
  const host = u.querySelector(".has-s"), s = host.querySelector(".s");
  const orig = s.textContent, light = s.dataset.light;
  s.replaceChildren(...tokens(orig).map(word));
  const band = el("span", "band"), rule = el("span", "rule"), srA = el("span", "sr"), srB = el("span", "sr");
  band.setAttribute("aria-hidden", "true");
  rule.setAttribute("aria-hidden", "true");
  s.before(srA);
  s.after(srB);
  host.prepend(band);
  host.append(rule);
  return { n: +u.dataset.u, u, host, s, orig, light, band, rule, srA, srB, dot: null, ctl: null, markedAt: null, due: false, fired: false, shown: "orig", timer: 0, dwell: 0, ranges: [], swept: false };
});
const N = units.length;

// ---- the engine's inputs -------------------------------------------------------------------------------------------------
// Reading alone: there is no class to be ahead of you and no teacher sending everyone back, so every go-back is your own.
const ctx = { classAt: () => N + 1, directed: [] };
const counts = new Array(N).fill(0);
const events = [];
const clock = () => performance.now() / 1000;

function evaluate() {
  if (!events.length) return;
  const t = clock();
  paragraphTiers(habitSignals(events, ctx, t), t, WINDOW_S, counts, null).forEach((tier, i) => {
    if (tier !== "none" && units[i].markedAt === null) mark(units[i], t);
  });
  for (const st of units) if (st.markedAt !== null && !st.due && !st.fired && changeAt(events, st.n, st.markedAt, t) !== null) st.due = true;
  check();
}
function push(e) {
  events.push(e);
  evaluate();
}

// The paragraph at the reading line: the one crossing it, else the next one down, else the last (pane.ts anchorIndex).
function anchorIndex(boxes, y) {
  if (!boxes.length) return -1;
  const crossing = boxes.findIndex((b) => b.top <= y && b.bottom > y);
  if (crossing !== -1) return crossing;
  const below = boxes.findIndex((b) => b.top > y);
  return below === -1 ? boxes.length - 1 : below;
}
let current = 0, cand = -1, since = 0, recheck = 0;
function settle(t) { // the candidate has rested long enough: report it, stamped with when it arrived
  if (cand === -1 || t - since < SETTLE_MS || cand + 1 === current) return;
  current = cand + 1;
  push({ t: since / 1000, kind: "position", paragraph: current });
  rail.mark();
}
function locate() {
  if (document.visibilityState === "hidden") return;
  const i = anchorIndex(units.map((st) => st.u.getBoundingClientRect()), innerHeight * READING_LINE);
  if (i === -1) return;
  const t = performance.now();
  if (i !== cand) settle(t), (cand = i), (since = t);
  clearTimeout(recheck);
  settle(t);
  // Scrolling may stop here, so look again once it has had time to settle.
  if (i + 1 !== current) recheck = setTimeout(locate, SETTLE_MS - (t - since) + 20);
}
document.addEventListener("visibilitychange", () => {
  const hidden = document.visibilityState === "hidden";
  if (hidden) settle(performance.now()), clearTimeout(recheck), (cand = -1); // a paragraph not yet settled starts again on return
  push({ t: clock(), kind: hidden ? "tabHidden" : "tabVisible" });
  if (!hidden) locate();
});
setInterval(() => document.visibilityState === "visible" && evaluate(), 1000);

// ---- gate 1: the dot -----------------------------------------------------------------------------------------------------
function mark(st, t) {
  st.markedAt = t;
  const b = el("button", "u-dot");
  b.type = "button";
  b.setAttribute("aria-label", `Paragraph ${st.n}: show a plainer version of its hardest sentence`);
  b.addEventListener("click", () => fire(st));
  st.u.append(b);
  st.dot = b;
  requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add("is-in")));
  rail.dot(st);
  say(`A dot appeared beside paragraph ${st.n}.`);
}

// ---- gate 2: the plainer sentence, when you are back and it is in view ----------------------------------------------------
// The engine says when you came back; the swap then waits until half the sentence (or half the screen, for a sentence taller
// than it) has been in view for 400 ms, so it always happens where you are looking (tryit.js check()).
const frac = (r, base) => Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / base;
function check() {
  for (const st of units) {
    if (!st.due || st.fired) continue;
    const r = st.s.getBoundingClientRect();
    if (frac(r, Math.min(r.height, innerHeight)) >= 0.5) {
      if (!st.dwell) st.dwell = setTimeout(() => ((st.dwell = 0), fire(st)), T.dwell);
    } else if (st.dwell) clearTimeout(st.dwell), (st.dwell = 0);
  }
}

function fire(st) {
  if (st.fired) return;
  st.fired = true;
  st.due = false;
  clearTimeout(st.dwell);
  if (st.dot) st.dot.tabIndex = -1, st.dot.setAttribute("aria-hidden", "true");
  placeRule(st);
  st.u.classList.add("is-fired"); // the rule slides in (120 ms), then the words swap
  const go = () => {
    buildCtl(st);
    show(st, "light");
  };
  reduced() ? go() : setTimeout(go, T.rule);
}

// ---- the swap (tryit.js, unchanged in behaviour) --------------------------------------------------------------------------
function keepMap(a, b) { // longest common subsequence on normalized words: new index -> old index
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const map = new Map();
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) map.set(j, i), i++, j++;
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return map;
}
const lineH = (st) => parseFloat(getComputedStyle(st.host).lineHeight);
// The band: the whole rewritten sentence as one soft block (line boxes joined), behind the stronger marks on the changed words.
function placeBand(st) {
  const pr = st.host.getBoundingClientRect(), lh = lineH(st), lines = [];
  for (const r of st.s.getClientRects()) {
    if (r.width < 1) continue;
    const top = r.top - pr.top - (lh - r.height) / 2, last = lines[lines.length - 1];
    if (last && Math.abs(last.top - top) < 2) {
      last.right = Math.max(last.right, r.right - pr.left);
      continue;
    }
    lines.push({ top, left: r.left - pr.left, right: r.right - pr.left });
  }
  const step = lines.length > 1 ? Math.min(70, 360 / (lines.length - 1)) : 0;
  st.band.replaceChildren(...lines.map((l, i) => {
    const x = document.createElement("i");
    const h = i < lines.length - 1 ? lines[i + 1].top - l.top + 1 : lh; // 1 px overlap: no hairline seams between lines
    x.style.top = `${l.top}px`;
    x.style.left = `${l.left - 3}px`;
    x.style.width = `${l.right - l.left + 6}px`;
    x.style.height = `${h}px`;
    x.style.setProperty("--d", `${Math.round(i * step)}ms`);
    return x;
  }));
}
function placeRule(st) { // the rule spans the sentence's lines, measured inside its paragraph
  const pr = st.host.getBoundingClientRect(), rs = [...st.s.getClientRects()].filter((r) => r.width >= 1);
  if (!rs.length) return;
  const half = (lineH(st) - rs[0].height) / 2;
  st.rule.style.top = `${rs[0].top - pr.top - half}px`;
  st.rule.style.height = `${rs[rs.length - 1].bottom - rs[0].top + 2 * half}px`;
}
function paint() { // the soft highlight on the changed words of every sentence showing Light
  if (!hasHL) return;
  HL.clear();
  for (const st of units) if (st.shown === "light") for (const r of st.ranges) HL.add(r);
  if (HL.size) CSS.highlights.set("cog", HL);
  else CSS.highlights.delete("cog");
}
// What changed, as the reader should see it: new words, and the seam of each new sentence (its full stop through the first word
// after it), so a sentence that was only split shows its new break. A lone changed comma is not marked.
const END = /[.?!]["”’)\]]*$/u, PUNCT = /[^\p{L}\p{N}]+$/u;
function runs(st, marks) {
  st.ranges = [];
  const kids = [...st.s.children];
  let start = null, end = null;
  const flush = () => {
    if (start) {
      const r = new Range();
      r.setStart(...start);
      r.setEnd(...end);
      st.ranges.push(r);
    }
    start = end = null;
  };
  kids.forEach((k, i) => {
    const m = marks.get(k), tn = k.firstChild, txt = k.textContent.replace(/\s+$/, "");
    if (!m) return flush();
    if (m === "seam" && !start) {
      const p = kids[i - 1], pt = p.textContent.replace(/\s+$/, "");
      start = [p.firstChild, pt.length - pt.match(END)[0].length];
    }
    if (!start) start = [tn, 0];
    end = [tn, txt.length];
  });
  flush();
  if (!hasHL) for (const k of kids) k.classList.toggle("cog-mark", marks.has(k));
}
// Kept words are the same nodes and never animate; removed words (and kept words whose letters change) clear in 160 ms, the
// DOM swaps once, and new words come in over 240 ms with a 30 ms stagger per run. Reduced motion: a 150 ms crossfade.
function swap(st, text, done) {
  clearTimeout(st.timer);
  const r = reduced(), cur = [...st.s.children], was = cur.map((x) => x.textContent), next = tokens(text);
  const map = keepMap(cur.map((x) => x.dataset.w), next.map(norm)), kept = new Set(map.values());
  const letters = (t) => t.trim().replace(PUNCT, "");
  const same = (i, t) => letters(was[i]) === letters(t);
  const rebuild = () => {
    const frag = document.createDocumentFragment(), fresh = new Set(), marks = new Map();
    let g = -1, prevNew = false;
    next.forEach((t, j) => {
      const i = map.has(j) ? map.get(j) : -1;
      const x = i >= 0 ? cur[i] : word(t);
      if (i >= 0 && x.textContent !== t) x.textContent = t;
      x.classList.remove("is-out");
      const newStart = j > 0 && END.test(next[j - 1].trim()) && /^\p{Lu}/u.test(t) && !(i > 0 && END.test(was[i - 1].trim()));
      const changed = i < 0 || !same(i, t);
      if (newStart) marks.set(x, "seam");
      else if (changed && /[\p{L}\p{N}]/u.test(t)) marks.set(x, "word");
      if (changed) {
        if (!prevNew) g++;
        prevNew = true;
        if (!r) x.classList.add("is-pre");
        x._g = g;
        fresh.add(x);
      } else prevNew = false;
      frag.append(x);
    });
    st.s.replaceChildren(frag);
    if (r) st.s.classList.remove("is-fading");
    const lit = text === st.light;
    runs(st, lit ? marks : new Map());
    const n = st.ranges.length;
    st.srA.textContent = lit ? `Plainer sentence, ${n} change${n === 1 ? "" : "s"}: ` : "";
    st.srB.textContent = lit ? " End of plainer sentence." : "";
    paint();
    placeRule(st);
    placeBand(st);
    placeCtl(st);
    if (lit) {
      const sweep = !st.swept && !r;
      st.band.classList.toggle("is-sweep", sweep);
      st.swept = true;
      if (sweep) setTimeout(() => st.band.classList.remove("is-sweep"), 360 + 320 + 50);
      st.host.classList.add("is-banded");
      requestAnimationFrame(() => requestAnimationFrame(() => st.s.classList.add("is-lit")));
    }
    if (!r && fresh.size)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const x of fresh) (x.style.transitionDelay = `${x._g * T.stagger}ms`), x.classList.remove("is-pre");
        st.timer = setTimeout(() => { for (const x of fresh) x.style.transitionDelay = ""; }, T.in + (g + 1) * T.stagger + 50);
      }));
    rail.layout();
    done && done();
  };
  st.s.classList.remove("is-lit");
  st.host.classList.remove("is-banded");
  if (r) {
    st.s.classList.add("is-fading");
    st.timer = setTimeout(rebuild, T.fade / 2);
    return;
  }
  cur.forEach((x, i) => !kept.has(i) && x.classList.add("is-out"));
  map.forEach((i, j) => !same(i, next[j]) && cur[i].classList.add("is-out"));
  st.timer = setTimeout(rebuild, T.out);
}
function show(st, target) {
  if (target === st.shown) return;
  st.shown = target;
  st.u.classList.toggle("is-light", target === "light");
  for (const b of st.ctl.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === target));
  swap(st, target === "light" ? st.light : st.orig, () => {
    const n = st.ranges.length;
    say(target === "light" ? `Paragraph ${st.n}: plainer sentence shown, ${n} change${n === 1 ? "" : "s"} marked. Original available.` : `Paragraph ${st.n}: original sentence shown.`);
  });
}

// ---- Original / Light -----------------------------------------------------------------------------------------------------
function buildCtl(st) {
  const wrap = el("div", "ctl"), inner = el("div"), seg = el("div", "seg");
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", `Wording of paragraph ${st.n}’s hardest sentence`);
  const bo = el("button", null, "Original"), bl = el("button", null, "Light");
  for (const [b, v] of [[bo, "orig"], [bl, "light"]]) {
    b.type = "button";
    b.dataset.v = v;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => show(st, v));
  }
  seg.append(el("span", "seg-label", "Hardest sentence"), bo, bl);
  inner.append(seg);
  wrap.append(inner);
  st.host.after(wrap);
  st.ctl = wrap;
  placeCtl(st);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("is-in")));
}
function placeCtl(st) { // wide screens: in the margin, level with the sentence's first line; otherwise under the paragraph
  if (!st.ctl) return;
  if (!wide.matches) return void (st.ctl.style.top = "");
  const r = [...st.s.getClientRects()].find((x) => x.width >= 1);
  if (!r) return;
  const ur = st.u.getBoundingClientRect(), lh = lineH(st);
  st.ctl.style.top = `${r.top - ur.top - (lh - r.height) / 2 + (lh - 32) / 2}px`;
}

// ---- the rail: where you are, and the paragraphs with a dot (wide screens, decorative) -----------------------------------
const rail = (() => {
  const box = el("div", "rail"), you = el("u");
  box.setAttribute("aria-hidden", "true");
  const segs = units.map(() => el("i")), dots = units.map(() => el("b"));
  box.append(...segs, ...dots, you);
  document.body.append(box);
  let geo = null;
  const layout = () => {
    if (!wide.matches) return void (geo = null);
    const H = box.clientHeight, first = units[0].u.getBoundingClientRect(), last = units[N - 1].u.getBoundingClientRect();
    const top = first.top + scrollY, span = last.bottom - first.top || 1;
    geo = { top, span, H };
    units.forEach((st, i) => {
      const r = st.u.getBoundingClientRect(), y = ((r.top + scrollY - top) / span) * H, h = (r.height / span) * H;
      segs[i].style.top = `${y}px`;
      segs[i].style.height = `${Math.max(2, h - 3)}px`;
      dots[i].style.top = `${y + Math.max(2, h - 3) / 2 - 4}px`;
    });
    move();
  };
  const move = () => {
    if (!geo) return;
    const y = ((scrollY + innerHeight * READING_LINE - geo.top) / geo.span) * geo.H;
    you.style.top = `${Math.max(0, Math.min(geo.H, y))}px`;
  };
  return {
    layout,
    move,
    mark: () => {
      segs.forEach((s, i) => s.classList.toggle("is-read", i < current - 1));
      box.classList.add("is-in");
    },
    dot: (st) => dots[st.n - 1].classList.add("is-in"),
  };
})();

// ---- wiring --------------------------------------------------------------------------------------------------------------
let frame = 0;
addEventListener("scroll", () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    locate();
    check();
    rail.move();
  });
}, { passive: true });
const relayout = () => {
  for (const st of units) if (st.fired) placeRule(st), placeBand(st), placeCtl(st);
  rail.layout();
  locate();
  check();
};
addEventListener("resize", relayout, { passive: true });
wide.addEventListener("change", relayout);
document.fonts?.ready.then(relayout);
rail.layout();
locate();
