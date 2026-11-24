// Ported from src/engine/signals.ts by scripts/port-engine.mjs (types stripped, nothing else changed). Do not edit by hand.
import { isDirected } from "./directed.js"

/** Copy, then the tab hidden within this long, is "took it somewhere to work it out". */
export const COPY_LEAVE_S = 10
/** Dwell counts as long when it passes this many times the student's own usual dwell. */
export const DWELL_FACTOR = 2
/** The student's usual dwell needs this many finished visits before it is trusted. */
export const MIN_VISITS = 3
/** Visits shorter than this are skimming past, not reading; they stay out of the student's usual. */
export const MIN_VISIT_S = 5
/** A student is marked on a paragraph at this much strength: one strong signal, or two medium. */
export const MARK_AT = 2

const median = (xs          ) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** One student's events (sorted by t) to the signals they gave. Reads in order, so it can be re-run on a growing stream. */
export function studentSignals(events              , ctx               )           {
  const out           = []
  const w = (p        ) => ctx.words?.[p - 1] ?? 1
  const usual           = [] // finished visits, seconds per word
  let cur = 0
  let start = 0
  let hiddenAt                = null
  let hiddenSum = 0
  let dwellFired = false
  let copy                                  = null

  const visible = (t        ) => t - start - hiddenSum - (hiddenAt === null ? 0 : t - hiddenAt)
  for (const e of events) {
    const p = e.paragraph ?? cur
    switch (e.kind) {
      case "position": {
        if (e.paragraph === undefined) break
        if (cur) {
          const d = visible(e.t)
          if (d >= MIN_VISIT_S) usual.push(d / w(cur))
        }
        // Going back: to an earlier paragraph than the one just left, which the class has already moved past.
        if (cur && e.paragraph < cur && e.paragraph < ctx.classAt(e.t) && !isDirected(ctx.directed, e.paragraph, e.t))
          out.push({ t: e.t, paragraph: e.paragraph, weight: 1, kind: "goBack" })
        cur = e.paragraph
        start = e.t
        hiddenSum = 0
        hiddenAt = hiddenAt === null ? null : e.t
        dwellFired = false
        break
      }
      case "copy":
        if (p) copy = { t: e.t, p }
        break
      case "tabHidden":
        if (copy && e.t - copy.t <= COPY_LEAVE_S) out.push({ t: e.t, paragraph: copy.p, weight: 2, kind: "copyLeave" })
        copy = null
        hiddenAt ??= e.t
        break
      case "tabVisible":
        if (hiddenAt !== null) hiddenSum += e.t - hiddenAt
        hiddenAt = null
        break
      case "wordLookup":
        if (p) out.push({ t: e.t, paragraph: p, weight: 2, kind: "lookup" })
        break
      case "activity":
        // Long dwell counts only with the tab visible and the student doing something right now, so a tab left open doesn't count.
        if (cur && !dwellFired && hiddenAt === null && usual.length >= MIN_VISITS && visible(e.t) / w(cur) > DWELL_FACTOR * median(usual)) {
          dwellFired = true
          out.push({ t: e.t, paragraph: cur, weight: 1, kind: "dwell" })
        }
        break
    }
  }
  return out
}

/** Strength per paragraph (sum of weights) from signals in (now - windowS, now]. */
export function strengthByParagraph(signals          , now        , windowS        )                      {
  const m = new Map                ()
  for (const s of signals) if (s.t <= now && s.t > now - windowS) m.set(s.paragraph, (m.get(s.paragraph) ?? 0) + s.weight)
  return m
}

/** Students marked per paragraph (index 0 = paragraph 1) at `now`: a mark is MARK_AT strength inside the window. */
export function markedCounts(perStudent            , now        , windowS        , paragraphs        )           {
  const counts = new Array        (paragraphs).fill(0)
  for (const sigs of perStudent) for (const [p, s] of strengthByParagraph(sigs, now, windowS)) if (s >= MARK_AT && p >= 1 && p <= paragraphs) counts[p - 1]++
  return counts
}
