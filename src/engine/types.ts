// Cognisia v3 class signals (spec 2026-10-14, sections 6 and 7). Pure logic, no UI. Times are seconds on one clock; paragraphs count from 1.
export type EventKind = "position" | "copy" | "tabHidden" | "tabVisible" | "wordLookup" | "activity"

/** One thing a student's page reported. `position` always carries the paragraph now at the reading line; copy and wordLookup may. */
export interface ClassEvent {
  t: number
  kind: EventKind
  paragraph?: number
}

export type SignalKind = "copyLeave" | "lookup" | "goBack" | "reference" | "dwell"

/** weight 2 = strong, 1 = medium, 0.5 = a quick reference (half a medium; spec 4b rule 4). */
export interface Signal {
  t: number
  paragraph: number
  weight: 0.5 | 1 | 2
  kind: SignalKind
}

/** A moment the teacher sent most of the class back to one paragraph. Go-backs to it inside [t0, t1] are not confusion. */
export interface Directed {
  paragraph: number
  t0: number
  t1: number
}
