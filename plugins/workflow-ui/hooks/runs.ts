// Pure helpers: turn the factory's run files and the session's tool calls into
// the small views the band, pane and status line draw. No `$` here, so every
// function is testable on plain values.

import type {
  AgentCall,
  CallOutcome,
  ContextView,
  Criterion,
  RunGate,
  RunView,
  StageMark,
} from '../types'

export const STAGES = ['spec', 'dev', 'qa', 'review', 'PR'] as const

// Index in STAGES of the stage a run.json state belongs to.
const STAGE_OF: Record<string, number> = {
  init: 0,
  spec_ready: 0,
  spec_approved: 1,
  developing: 1,
  dev_done: 1,
  awaiting_deploy: 2,
  deployed: 2,
  testing: 2,
  qa_done: 2,
  qa_invalid: 2,
  reviewing: 3,
  review_done: 4,
  done: 5,
}

const TERMINAL_FAILURES = new Set(['failed', 'blocked', 'qa_invalid', 'aborted'])

export function gateOf(state: string): RunGate | null {
  if (state === 'spec_ready') return 'spec'
  if (state === 'awaiting_deploy') return 'deploy'
  if (state === 'review_done') return 'push'
  return null
}

type History = readonly { state?: unknown }[]

// The stage a failed run stopped in is the last non-terminal state it reached.
function failedStage(history: History): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const state = String(history[i]?.state ?? '')
    if (!TERMINAL_FAILURES.has(state) && state in STAGE_OF) return STAGE_OF[state] ?? 0
  }
  return 0
}

export function stagesOf(state: string, history: History = []): StageMark[] {
  if (TERMINAL_FAILURES.has(state) && state !== 'qa_invalid') {
    const at = failedStage(history)
    return STAGES.map((_, i) => (i < at ? 'done' : i === at ? 'fail' : 'todo'))
  }
  const at = STAGE_OF[state] ?? 0
  const failedHere = state === 'qa_invalid'
  return STAGES.map((_, i) =>
    i < at ? 'done' : i === at ? (failedHere ? 'fail' : 'now') : 'todo',
  )
}

export function reviewVerdict(markdown: string | null): string | null {
  if (!markdown) return null
  const match = /^\s*\**Verdict:?\**\s*:?\s*([a-z-]+)/im.exec(markdown)
  return match?.[1] ?? null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function criteriaOf(verdict: Record<string, unknown>): Criterion[] {
  const list = Array.isArray(verdict.criteria) ? verdict.criteria : []
  return list.map(raw => {
    const c = asRecord(raw)
    const evidence = Array.isArray(c.evidence) ? String(c.evidence[0] ?? '') : ''
    return { id: String(c.id ?? '?'), status: String(c.status ?? '?'), evidence }
  })
}

// Builds one run's view from run.json, verdict.json and review.md (the last
// two absent until QA and the reviewer have written them).
export function parseRun(
  runJson: string,
  verdictJson: string | null,
  reviewMd: string | null,
): RunView | null {
  let run: Record<string, unknown>
  try {
    run = asRecord(JSON.parse(runJson))
  } catch {
    return null
  }
  if (typeof run.run_id !== 'string') return null

  let verdict: Record<string, unknown> = {}
  if (verdictJson) {
    try {
      verdict = asRecord(JSON.parse(verdictJson))
    } catch {
      verdict = {}
    }
  }

  const state = String(run.state ?? 'init')
  const history = Array.isArray(run.history) ? (run.history as History) : []
  const last = asRecord(history[history.length - 1])
  const qaOverall =
    typeof verdict.overall === 'string'
      ? verdict.overall
      : typeof run.qa_overall === 'string'
        ? run.qa_overall
        : null

  return {
    id: run.run_id,
    title: typeof run.title === 'string' && run.title ? run.title : run.run_id,
    state,
    iteration: Number(run.iteration ?? 0),
    maxIterations: Number(run.max_iterations ?? 3),
    branch: String(run.feature_branch ?? `factory/${run.run_id}`),
    devSha: typeof run.dev_sha === 'string' ? run.dev_sha : null,
    updatedAt: String(last.at ?? run.created_at ?? ''),
    gate: gateOf(state),
    stages: stagesOf(state, history),
    qaOverall,
    review: reviewVerdict(reviewMd),
    criteria: criteriaOf(verdict),
    pr: typeof run.pr === 'string' && run.pr !== 'none' ? run.pr : null,
  }
}

// Run ids start with a UTC timestamp, so a reverse sort is newest first.
export function newestFirst(names: readonly string[]): string[] {
  return [...names].sort().reverse()
}

export function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : '-'
}

export function gateLabel(gate: RunGate): string {
  return gate === 'spec' ? 'GATE 1' : gate === 'deploy' ? 'DEPLOY' : 'GATE 2'
}

export function gateText(run: RunView): string {
  if (run.gate === 'spec') return `${run.title} · spec listo, esperando tu aprobación`
  if (run.gate === 'deploy') {
    return `${run.title} · desplegá ${shortSha(run.devSha)} (${run.branch}) y confirmá`
  }
  if (run.gate === 'push') {
    const qa = run.qaOverall ?? '?'
    const review = run.review ?? '?'
    return `${run.title} · QA ${qa}, review ${review} · decidí push / PR`
  }
  return run.title
}

export function contextText(context: ContextView | null): string | null {
  if (!context || !context.initialized) return null
  if (!context.stale) return 'ctx: fresh'
  const dirs = [...new Set(context.changed.map(path => path.split('/')[0] ?? path))]
  const shown = dirs.slice(0, 3).join(', ')
  return dirs.length ? `ctx: STALE (${shown}${dirs.length > 3 ? ', …' : ''})` : 'ctx: STALE'
}

export function runText(run: RunView | undefined): string | null {
  if (!run) return null
  const iter = run.iteration > 0 ? ` ${run.iteration}/${run.maxIterations}` : ''
  return `factory: ${run.state}${iter}`
}

// The status line: context freshness and the newest run, either one alone when
// the other has nothing to say.
export function statusText(runs: readonly RunView[], context: ContextView | null): string | undefined {
  const parts = [contextText(context), runText(runs[0])].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

export function parseContext(stdout: string): ContextView | null {
  try {
    const raw = asRecord(JSON.parse(stdout))
    return {
      initialized: raw.initialized === true,
      stale: raw.stale === true,
      changed: Array.isArray(raw.changed_files) ? raw.changed_files.map(String) : [],
    }
  } catch {
    return null
  }
}

// Paths inside a factory worktree read better from the worktree down:
// `.../.factory/worktrees/<run-id>/dev.wt/src/a.ts` becomes `dev.wt/src/a.ts`.
export function shortPath(path: string, root: string): string {
  const inWorktree = /\.factory\/worktrees\/[^/]+\/(.+)$/.exec(path)
  if (inWorktree?.[1]) return inWorktree[1]
  if (root && path.startsWith(root + '/')) return path.slice(root.length + 1)
  return path
}

function oneLine(text: string, max = 90): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

// What a call acts on, from the tool's own input fields.
export function callTarget(input: Record<string, unknown>, root: string): string {
  const pick = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  const path = pick('file_path') || pick('notebook_path') || pick('path')
  if (pick('command')) return oneLine(pick('command'))
  if (path && pick('pattern')) return oneLine(`${pick('pattern')} in ${shortPath(path, root)}`)
  if (path) return shortPath(path, root)
  if (pick('pattern')) return oneLine(pick('pattern'))
  if (pick('url')) return oneLine(pick('url'))
  if (pick('description')) return oneLine(pick('description'))
  return ''
}

type CallResult = { deny?: string; isError?: true; text?: string }

const GUARD = /software-factory guard|blocked|denied|not allowed/i

export function outcomeOf(result: CallResult): { outcome: CallOutcome; reason: string } {
  if (typeof result.deny === 'string') return { outcome: 'blocked', reason: oneLine(result.deny) }
  if (result.isError) {
    const text = result.text ?? ''
    return { outcome: GUARD.test(text) ? 'blocked' : 'error', reason: oneLine(text) }
  }
  return { outcome: 'ok', reason: '' }
}

// `software-factory:factory-dev` and `factory-dev` are the same role.
export function roleOf(type: string): string {
  return type.split(':').pop() ?? type
}

export function isFactoryRole(type: string): boolean {
  return roleOf(type).startsWith('factory-')
}

export function pushCall(calls: readonly AgentCall[], call: AgentCall, keep = 8): AgentCall[] {
  return [...calls, call].slice(-keep)
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
