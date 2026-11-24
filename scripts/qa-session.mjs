#!/usr/bin/env node
// QA only (never loaded by the page). Scripts one real reading session in headless Chrome and saves a screenshot per state.
// node scripts/qa-session.mjs <url> <width> <height> <light|dark> <wheel|touch> <out-prefix>
// Scrolling is real input: wheel ticks on a laptop, touch swipes on a phone (Input.synthesizeScrollGesture). The one test-side
// shim: performance.now gets a skew the script can add to, standing in for four minutes of reading (the engine counts no
// go-backs until it has seen three whole minutes of your own reading). The page's code is not changed. Self-kill at 70 s.
import { open } from "./cdp.mjs";
import fs from "node:fs";

const [url, W, H, theme, input, out] = process.argv.slice(2);
const w = +W, h = +H, touch = input === "touch";
const HARD = 9, FRONT = 12, QUICK = 10;
const log = [];
const note = (m) => (log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`), console.log(log.at(-1)));
const t0 = Date.now();
const b = await open({ w, h, dpr: 2 });
const kill = setTimeout(() => (note("SELF-KILL at 70 s"), process.exit(3)), 70000);
// the browser always closes: on success, on a thrown error, on a signal
let closed = false;
const closeOnce = () => { if (!closed) (closed = true), b.close(); };
process.on("exit", closeOnce);
for (const sig of ["SIGINT", "SIGTERM", "SIGPIPE", "SIGHUP"]) process.on(sig, () => process.exit(4));
process.on("uncaughtException", (e) => (console.error("ERROR", e.message), process.exit(5)));
process.on("unhandledRejection", (e) => (console.error("ERROR", e?.message ?? e), process.exit(5)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
b.onEvent((m) => {
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) errors.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
});
await b.send("Log.enable");
await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
if (touch) {
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 3, mobile: true });
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await b.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
}
await b.send("Page.addScriptToEvaluateOnNewDocument", {
  source: "(()=>{const o=performance.now.bind(performance);let k=0;performance.now=()=>o()+k;window.__qaSkew=(ms)=>{k+=ms}})()",
});
await b.nav(url);
await wait(600);

const shot = async (name) => {
  const { data } = await b.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${out}-${name}.png`, Buffer.from(data, "base64"));
  note(`shot ${name}`);
};
const state = () => b.ev(`(() => { const u = (n) => document.querySelector('.u[data-u="'+n+'"]');
  const line = innerHeight * 0.4, us = [...document.querySelectorAll('.u')];
  const at = us.findIndex((x) => { const r = x.getBoundingClientRect(); return r.top <= line && r.bottom > line; }) + 1;
  return { at, dots: [...document.querySelectorAll('.u-dot.is-in')].map((d) => +d.closest('.u').dataset.u),
    fired: [...document.querySelectorAll('.u.is-fired')].map((x) => +x.dataset.u),
    text: u(${HARD}).querySelector('.s').textContent.trim(), light: u(${HARD}).querySelector('.s').dataset.light,
    pressed: [...u(${HARD}).querySelectorAll('.seg button[aria-pressed=true]')].map((x) => x.textContent),
    overflowX: document.documentElement.scrollWidth - innerWidth }; })()`);
// Scroll with real input until paragraph n's first line sits just under the reading line.
// Chrome applies the device scale to synthesized gesture distances here, so the first gesture measures the factor.
let gain = 0;
async function goTo(n, speed = 1400) {
  for (let k = 0; k < 4; k++) {
    const d = await b.ev(`(() => { const r = document.querySelector('.u[data-u="${n}"]').getBoundingClientRect(); return Math.round(r.top - innerHeight * 0.4 + 12) || 0; })()`);
    if (process.env.QA_DEBUG) note(`goTo ${n} try ${k} d=${d}`);
    if (Math.abs(d) < 24) break;
    const ts = Date.now(), y0 = await b.ev("scrollY"), ask = gain ? d / gain : d;
    const params = { x: Math.round(w / 2), y: Math.round(h * 0.6), yDistance: -Math.round(ask), speed, gestureSourceType: touch ? "touch" : "mouse", preventFling: true, repeatCount: 1 };
    try { await b.send("Input.synthesizeScrollGesture", params); } catch (e) { throw new Error(`gesture ${JSON.stringify(params)} gain ${gain}: ${e.message}`); }
    await wait(120);
    if (!gain && Math.abs(ask) > 50) gain = ((await b.ev("scrollY")) - y0) / ask || 1;
    if (process.env.QA_DEBUG) note(`gesture ${Date.now() - ts} ms, gain ${gain.toFixed(2)}`);
  }
}

await shot("1-top");
// read forward, about a second a paragraph; after paragraph 3, the clock gets four minutes (the engine's warm-up)
for (let n = 1; n <= FRONT; n++) {
  await goTo(n);
  await wait(n === FRONT ? 1100 : 700);
  if (n === 3) await b.ev("window.__qaSkew(240000)"), note("skew +240 s (warm-up)");
}
note(`front: ${JSON.stringify(await state())}`);

// a quick look back: up to ¶10 for 1.5 s, then back. Must leave no dot.
await goTo(QUICK);
await wait(1500);
await goTo(FRONT);
await wait(3600);
const q = await state();
note(`after quick look back: dots ${JSON.stringify(q.dots)}`);
const quickOk = q.dots.length === 0;

// first real stay: back to ¶9 for 7 s, then on to the front
await goTo(HARD);
await wait(7000);
const s1 = await state();
note(`after stay 1 on ¶${s1.at}: dots ${JSON.stringify(s1.dots)}`);
await goTo(FRONT);
await wait(2500);
// second stay: the dot should appear during it (at about 6 s)
await goTo(HARD);
await wait(7000);
const s2 = await state();
note(`after stay 2 on ¶${s2.at}: dots ${JSON.stringify(s2.dots)} fired ${JSON.stringify(s2.fired)}`);
const dotOk = s1.dots.length === 0 && s2.dots.includes(HARD) && !s2.fired.includes(HARD);
await shot("2-dot");
// on, then back: the plainer sentence
await goTo(FRONT);
await wait(2000);
await goTo(HARD);
let s3 = null;
for (let k = 0; k < 14; k++) {
  await wait(500);
  s3 = await state();
  if (s3.fired.includes(HARD) && s3.text === s3.light) break;
}
await wait(900);
s3 = await state();
note(`after return: fired ${JSON.stringify(s3.fired)} light shown ${s3.text === s3.light} pressed ${JSON.stringify(s3.pressed)}`);
const plainOk = s3.fired.includes(HARD) && s3.text === s3.light && s3.pressed[0] === "Light";
// centre the sentence for the pictures
await b.ev(`(() => { const s = document.querySelector('.u[data-u="${HARD}"] .s').getBoundingClientRect(); scrollBy(0, s.top - innerHeight * 0.3); })()`);
await wait(700);
await shot("3-light");
// Original / Light: real taps or clicks on the buttons
const tap = async (label) => {
  const p = await b.ev(`(() => { const x = [...document.querySelectorAll('.u[data-u="${HARD}"] .seg button')].find((e) => e.textContent === '${label}'); if (!x) return null; x.scrollIntoView({ block: 'nearest' }); const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!p) return note(`no ${label} button`);
  if (touch) {
    await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
  }
  await wait(900);
};
await tap("Original");
const o = await b.ev(`(() => { const u = document.querySelector('.u[data-u="${HARD}"]'); return { text: u.querySelector('.s').textContent.trim(), pressed: [...u.querySelectorAll('.seg button[aria-pressed=true]')].map((x) => x.textContent) }; })()`);
await shot("4-original");
await tap("Light");
const l = await b.ev(`(() => { const u = document.querySelector('.u[data-u="${HARD}"]'); return { text: u.querySelector('.s').textContent.trim(), light: u.querySelector('.s').dataset.light, pressed: [...u.querySelectorAll('.seg button[aria-pressed=true]')].map((x) => x.textContent) }; })()`);
const toggleOk = o.pressed[0] === "Original" && o.text !== l.light && o.text.startsWith("According to Ali Jinnah Hussin") && o.text.includes("although") && l.text === l.light && l.pressed[0] === "Light";
note(`toggle: original pressed ${JSON.stringify(o.pressed)} has 'although' ${o.text.includes("although")}; light pressed ${JSON.stringify(l.pressed)} matches ${l.text === l.light}`);
const final = await state();
if (process.env.QA_DEBUG) note(`events ${await b.ev("JSON.stringify((window.__events || []).map((e) => [Math.round(e.t * 10) / 10, e.kind === 'position' ? e.paragraph : e.kind]))")}`);
const res = { url, w, h, theme, input, quickOk, dotOk, plainOk, toggleOk, overflowX: final.overflowX, errors, pass: quickOk && dotOk && plainOk && toggleOk && errors.length === 0 && final.overflowX <= 0 };
note(`RESULT ${JSON.stringify(res)}`);
fs.writeFileSync(`${out}-result.json`, JSON.stringify({ ...res, log }, null, 1));
clearTimeout(kill);
process.exit(res.pass ? 0 : 1);
