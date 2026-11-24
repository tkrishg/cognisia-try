// minimal own-launch headless Chrome CDP helper (copied from the portfolio's handoff-11-07b/tools; close() made safe to call on exit)
import { spawn } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function open({ w, h, dpr = 1 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cogtry-cdp-"));
  const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--hide-scrollbars", "--lang=en-US", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res) => { let b = ""; proc.stderr.on("data", (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); });
  const port = new URL(wsUrl).port;
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pending = new Map(), ls = [];
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else if (m.method) ls.forEach((l) => l(m)); });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  const nav = async (url) => { const loaded = new Promise((r) => ls.push((m) => m.method === "Page.loadEventFired" && r())); await send("Page.navigate", { url }); await loaded; await ev("document.fonts.ready.then(()=>1)"); };
  const close = () => { try { proc.kill("SIGKILL"); } catch {} try { ws.close(); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
  const onEvent = (f) => ls.push(f);
  return { send, ev, nav, close, onEvent };
}
