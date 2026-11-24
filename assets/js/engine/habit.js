// Ported from src/engine/habit.ts by scripts/port-engine.mjs (types stripped, nothing else changed). Do not edit by hand.
// Habit vs stuck (spec 6: "general scrolling up and down: not used alone"). Some students scroll up and down all the time and are
// never confused, so a go-back only counts when it is FOCUSED (the same paragraph again and again, with real stops) and beyond
// what this student usually does. Pure logic; times are seconds, paragraphs count from 1.
import { isDirected } from "./directed.js"
import { studentSignals } from "./signals.js"

/** A return counts only if the student stops on the paragraph this long with the tab visible; shorter is passing through. */
export const RETURN_STOP_S = 2
/** Habit is measured in one-minute bins, and a paragraph's returns are counted over the last minute. */
export const HABIT_BIN_S = 60
/** Fewer finished minutes of the student's own reading than this, and the conservative default bar is used. */
export const MIN_HISTORY_BINS = 3
/**
 * The default bar before the habit is known: go-backs don't count at all (strong signals still do). Like the dwell rule's
 * MIN_VISITS, a student is not judged against a usual we haven't seen; a scroller in minute 2 has only ¶1 to go back to.
 */
export const DEFAULT_RETURNS = Infinity
/** However quiet the student's habit, one return is never enough. */
export const MIN_RETURNS = 2
/** Beyond habit = more than median + MAD_K x MAD of the student's own minutes... */
export const MAD_K = 1.5
/** ...and at least HABIT_FACTOR x their median. */
export const HABIT_FACTOR = 2
/** Focus vs spread: returns to this paragraph must be at least this share of all go-backs (passes included) in that minute. */
export const FOCUS_SHARE = 0.5
/**
 * Hand slip (spec 4b rule 2): a move up followed within this long by a return to the paragraph it left (or further), or by the tab
 * hidden, is ignored: not a go-back, not a stop. Until this long has passed the move is held back, so a slip never fires a mark.
 */
export const SLIP_S = 3
/**
 * Quick reference (spec 4b rule 4): up, a stop, then back to the student's front (furthest paragraph reached) within this long.
 * Until this long has passed without coming back, a return is treated as a reference (the weaker reading), never as a full one.
 */
export const REFERENCE_S = 20
/** A quick reference is half a medium signal: two references to one paragraph = one focused return. */
export const REFERENCE_WEIGHT = 0.5
/**
 * Only a glance is a quick reference: a stop shorter than this (checking a word or term). Rereading a ~40-word sentence takes about
 * 10 s at normal reading speed, so a stop of this long or more is an ordinary focused return even if the student is back at the
 * front within REFERENCE_S. A starting guess; tune in the prototype session.
 */
export const REFERENCE_MAX_STOP_S = 6

/** One move to a lower paragraph. `stop` = seconds stayed with the tab visible (up to `now` if still there). */

const median = (xs          ) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mad = (xs          ) => {
  const m = median(xs)
  return median(xs.map((x) => Math.abs(x - m)))
}

/** Every backward move a student made, with how long they stayed. Events sorted by t, all at or before `now`. */
export function backMoves(events              , ctx               , now = events.at(-1)?.t ?? 0)             {
  const out             = []
  const eligible            = []
  const fronts           = [] // furthest paragraph reached before each move
  const visits                             = []
  let furthest = 0
  let cur = 0
  let start = 0
  let hiddenSum = 0
  let hiddenAt                = null
  let open = -1
  const close = (t        ) => {
    if (open >= 0) out[open].stop = t - start - hiddenSum - (hiddenAt === null ? 0 : t - hiddenAt)
    open = -1
  }
  for (const e of events) {
    if (e.kind === "tabHidden") hiddenAt ??= e.t
    else if (e.kind === "tabVisible") {
      if (hiddenAt !== null) hiddenSum += e.t - hiddenAt
      hiddenAt = null
    } else if (e.kind === "position" && e.paragraph !== undefined) {
      close(e.t)
      if (cur && e.paragraph < cur) {
        open = out.push({ t: e.t, paragraph: e.paragraph, stop: 0, focused: false, reference: false }) - 1
        eligible[open] = e.paragraph < ctx.classAt(e.t) && !isDirected(ctx.directed, e.paragraph, e.t)
        fronts[open] = furthest
      }
      visits.push({ t: e.t, p: e.paragraph })
      furthest = Math.max(furthest, e.paragraph)
      cur = e.paragraph
      start = e.t
      hiddenSum = 0
      if (hiddenAt !== null) hiddenAt = e.t
    }
  }
  close(now)
  out.forEach((m, i) => {
    m.focused = eligible[i] && m.stop >= RETURN_STOP_S
    m.reference = m.stop < REFERENCE_MAX_STOP_S && (now - m.t < REFERENCE_S || visits.some((v) => v.t > m.t && v.t <= m.t + REFERENCE_S && v.p >= fronts[i]))
  })
  return out
}

/**
 * Events with hand slips taken out (spec 4b rule 2): a move up, then within SLIP_S a return to the paragraph it left (or further)
 * or the tab hidden. The slip's positions are dropped; the student stays, as far as the rules know, where they were. A move up
 * younger than SLIP_S at `now` is held back too. Copies, lookups, activity and tab events are kept.
 */
export function dropSlips(events              , now = events.at(-1)?.t ?? 0)               {
  const out               = []
  let cur = 0
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.kind !== "position" || e.paragraph === undefined) {
      out.push(e)
      continue
    }
    if (!cur || e.paragraph >= cur) {
      out.push(e)
      cur = e.paragraph
      continue
    }
    let end = i + 1
    while (end < events.length && events[end].t - e.t <= SLIP_S && events[end].kind !== "tabHidden" && !(events[end].kind === "position" && (events[end].paragraph ?? 0) >= cur)) end++
    const resolved = end < events.length && events[end].t - e.t <= SLIP_S
    if (!resolved && now - e.t >= SLIP_S) {
      out.push(e) // a real move up
      cur = e.paragraph
      continue
    }
    for (let j = i + 1; j < (resolved ? end : events.length); j++) if (events[j].kind !== "position") out.push(events[j])
    if (!resolved) break
    // A return to exactly the paragraph left is part of the slip; a tabHidden or a return further on is handled by the loop.
    i = events[end].kind === "position" && events[end].paragraph === cur ? end : end - 1
  }
  return out
}

/** The student's own habit from whole minutes in [from, until). */
export function habitBaseline(moves            , from        , until        )           {
  const bins = Math.max(0, Math.floor((until - from) / HABIT_BIN_S))
  const spread           = []
  const focus           = []
  for (let b = 0; b < bins; b++) {
    const inBin = moves.filter((m) => m.t >= from + b * HABIT_BIN_S && m.t < from + (b + 1) * HABIT_BIN_S)
    const per = new Map                ()
    for (const m of inBin) if (m.focused) per.set(m.paragraph, (per.get(m.paragraph) ?? 0) + 1)
    spread.push(inBin.length)
    focus.push(Math.max(0, ...per.values()))
  }
  const med = median(focus)
  const d = mad(focus)
  const bar = bins < MIN_HISTORY_BINS ? DEFAULT_RETURNS : Math.max(MIN_RETURNS, Math.floor(med + MAD_K * d) + 1, Math.ceil(HABIT_FACTOR * med))
  return { bins, perMinute: median(spread), perParagraph: { median: med, mad: d }, bar }
}

/**
 * Go-back signals that pass the habit rule: inside one minute, focused returns to the same paragraph reach the student's own bar
 * and are at least FOCUS_SHARE of all their go-backs. A quick reference counts REFERENCE_WEIGHT towards both; the bar itself still
 * counts every focused return as 1 (habit = how often this student goes back and stops). When a paragraph passes, each of its
 * returns in that minute becomes a signal: a medium goBack, or a half-weight reference. The bar comes only from earlier minutes.
 */
export function focusedReturns(events              , ctx               , now = events.at(-1)?.t ?? 0, slips           = [])           {
  const moves = backMoves(events, ctx, now)
  const from = events[0]?.t ?? 0
  const done = new Set          ()
  const out           = []
  const bars = new Map                () // the bar only changes once per finished minute
  const barAt = (t        ) => {
    const k = Math.floor((t - HABIT_BIN_S - from) / HABIT_BIN_S)
    if (!bars.has(k)) bars.set(k, habitBaseline(moves, from, t - HABIT_BIN_S).bar)
    return bars.get(k)
  }
  for (const m of moves) {
    if (!m.focused) continue
    const minute = moves.filter((x) => x.t > m.t - HABIT_BIN_S && x.t <= m.t)
    const same = minute.filter((x) => x.focused && x.paragraph === m.paragraph)
    const count = same.reduce((a, x) => a + (x.reference ? REFERENCE_WEIGHT : 1), 0)
    // Slips are never returns, but they are still go-backs here: lots of tiny jumps make real returns look less focused, never more.
    const goBacks = minute.length + slips.filter((t) => t > m.t - HABIT_BIN_S && t <= m.t).length
    if (count < barAt(m.t) || count < FOCUS_SHARE * goBacks) continue
    for (const x of same)
      if (!done.has(x)) done.add(x), out.push(x.reference ? { t: x.t, paragraph: x.paragraph, weight: REFERENCE_WEIGHT, kind: "reference" } : { t: x.t, paragraph: x.paragraph, weight: 1, kind: "goBack" })
  }
  return out
}

/**
 * studentSignals with hand slips taken out and its raw go-backs replaced by the habit-checked ones. This is what feeds marks and
 * tiers. Gestures in spec 4b order: teacher-directed (ctx.directed), hand slip (dropSlips), skim (RETURN_STOP_S), quick reference
 * (REFERENCE_WEIGHT), then the habit bar (one return is never enough) and the strong signals.
 */
export function habitSignals(events              , ctx               , now = events.at(-1)?.t ?? 0)           {
  const kept = dropSlips(events, now)
  return [...studentSignals(kept, ctx).filter((s) => s.kind !== "goBack"), ...focusedReturns(kept, ctx, now, slipUps(events, kept))].sort((a, b) => a.t - b.t)
}

/** Times of the moves up that dropSlips took out (each step of a burst counts, as every go-back did before spec 4b). */
export function slipUps(events              , kept              )           {
  const keep = new Set(kept)
  const out           = []
  let prev = 0
  for (const e of events) {
    if (e.kind !== "position" || e.paragraph === undefined) continue
    if (prev && e.paragraph < prev && !keep.has(e)) out.push(e.t)
    prev = e.paragraph
  }
  return out
}

/**
 * One student, one paragraph. `studentSignals` = that student's habit-checked signals on the paragraph, inside the window.
 * swap: a strong signal (copy-then-leave, word lookup), or focused returns while the class count there is at the threshold.
 * dot: focused returns beyond the student's own habit. none: anything else (scrolling, passes, dwell alone).
 */
export function tier(studentSignals          , classStuckCount        , threshold               )       {
  if (studentSignals.some((s) => s.kind === "copyLeave" || s.kind === "lookup")) return "swap"
  if (!studentSignals.some((s) => s.kind === "goBack" || s.kind === "reference")) return "none"
  return threshold !== null && classStuckCount >= threshold ? "swap" : "dot"
}

/** A student's tier on every paragraph at `now`. counts[i] = students marked on paragraph i+1. */
export function paragraphTiers(signals          , now        , windowS        , counts          , threshold               )         {
  return counts.map((c, i) => tier(signals.filter((s) => s.paragraph === i + 1 && s.t <= now && s.t > now - windowS), c, threshold))
}

/**
 * Gate 2 (spec 4b): the plainer sentence goes in only when the student comes back to the paragraph after the mark is showing.
 * Returns the time of the first arrival on `paragraph` after `markedAt`, from another paragraph, once the student has been past it;
 * null = they never came back (reading forward changes nothing). Hand slips are not arrivals. The engine sees only the paragraph
 * at the reading line, so this is when the paragraph reaches that line, not when its target lines re-enter the viewport.
 */
export function changeAt(events              , paragraph        , markedAt        , now = events.at(-1)?.t ?? markedAt)                {
  let cur = 0
  let furthest = 0
  for (const e of dropSlips(events, now)) {
    if (e.kind !== "position" || e.paragraph === undefined) continue
    if (e.t > markedAt && e.paragraph === paragraph && cur !== paragraph && furthest > paragraph) return e.t
    cur = e.paragraph
    furthest = Math.max(furthest, cur)
  }
  return null
}
