// Ported from src/engine/directed.ts by scripts/port-engine.mjs (types stripped, nothing else changed). Do not edit by hand.
export const DIRECTED_WINDOW_S = 10
export const DIRECTED_SHARE = 0.5
/** Fewer landings than this is never "the teacher sent us back", whatever the share (1 of 1 is 100%). */
export const MIN_LANDERS = 3
/** A student counts as active if anything came from their page in this many seconds. */
export const ACTIVE_S = 60

/** Every time a student moved to a lower paragraph than the one they were on. */
function backLandings(streams                )            {
  const out            = []
  streams.forEach((events, s) => {
    let prev = 0
    for (const e of events) {
      if (e.kind !== "position" || e.paragraph === undefined) continue
      if (prev && e.paragraph < prev) out.push({ s, t: e.t, paragraph: e.paragraph })
      prev = e.paragraph
    }
  })
  return out.sort((a, b) => a.t - b.t)
}

const activeAt = (streams                , t        ) =>
  streams.filter((ev) => ev.some((e) => e.t <= t && e.t >= t - ACTIVE_S)).length

/**
 * Teacher-directed jumps: at least half of the active students (and at least MIN_LANDERS) go back to the same paragraph within
 * 10 s. Those aren't independent, so the go-backs they cause don't count as signals.
 */
export function findDirected(streams                )             {
  const lands = backLandings(streams)
  const out             = []
  for (const first of lands) {
    const win = lands.filter((l) => l.paragraph === first.paragraph && l.t >= first.t && l.t <= first.t + DIRECTED_WINDOW_S)
    const who = new Set(win.map((l) => l.s))
    const t1 = Math.max(...win.map((l) => l.t))
    if (who.size < MIN_LANDERS || who.size < DIRECTED_SHARE * activeAt(streams, first.t + DIRECTED_WINDOW_S)) continue
    if (!out.some((d) => d.paragraph === first.paragraph && d.t0 <= first.t && first.t <= d.t1)) out.push({ paragraph: first.paragraph, t0: first.t, t1 })
  }
  return out
}

export const isDirected = (list                        , paragraph        , t        ) =>
  Boolean(list?.some((d) => d.paragraph === paragraph && t >= d.t0 && t <= d.t1))
