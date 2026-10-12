export type RunGate = 'spec' | 'deploy' | 'push'

export type StageMark = 'done' | 'now' | 'fail' | 'todo'

export type Criterion = { id: string; status: string; evidence: string }

export type RunView = {
  id: string
  title: string
  state: string
  iteration: number
  maxIterations: number
  branch: string
  devSha: string | null
  updatedAt: string
  gate: RunGate | null
  stages: StageMark[]
  qaOverall: string | null
  review: string | null
  criteria: Criterion[]
  pr: string | null
}

export type CallOutcome = 'ok' | 'error' | 'blocked'

export type AgentCall = {
  tool: string
  target: string
  outcome: CallOutcome
  reason: string
}

export type AgentView = {
  id: string
  type: string
  description: string
  status: string
  startedAt: number
  durationMs: number | null
  calls: AgentCall[]
  callCount: number
  blockCount: number
}

export type ContextView = {
  initialized: boolean
  stale: boolean
  changed: string[]
}

export type PaneTab = 'runs' | 'agents'

declare module 'claude-code' {
  interface PluginState {
    'workflow-ui': {
      runs: RunView[]
      agents: AgentView[]
      context: ContextView | null
      tab: PaneTab
      dismissedGate: string | null
      announced: string[]
    }
  }
}
