// workflow-ui: a read-only view of software-factory runs and contextly freshness.
//
// It never writes to the repository and never blocks a call: the tool.call,
// agent.spawn and turn.complete hooks pass every event through untouched and
// only record what they saw. Everything it draws comes from `$.state`, which
// a poll over `.factory/runs/` and the hooks below keep current.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentView, ContextView, PaneTab, RunView, StageMark } from '../types'
import {
  STAGES,
  callTarget,
  duration,
  gateLabel,
  gateText,
  isFactoryRole,
  newestFirst,
  outcomeOf,
  parseContext,
  parseRun,
  pushCall,
  roleOf,
  shortSha,
  statusText,
} from './runs'

const PANE = 'workflow-ui'
const MAX_RUNS = 5
const MAX_AGENTS = 10
const RUNS_EVERY_MS = 3000
const CONTEXT_EVERY_MS = 30000

const runsAtom = atom({ plugin: 'workflow-ui', key: 'runs' } as const, [])
const agentsAtom = atom({ plugin: 'workflow-ui', key: 'agents' } as const, [])
const contextAtom = atom({ plugin: 'workflow-ui', key: 'context' } as const, null)
const tabAtom = atom({ plugin: 'workflow-ui', key: 'tab' } as const, 'runs')
const dismissedAtom = atom({ plugin: 'workflow-ui', key: 'dismissedGate' } as const, null)
const announcedAtom = atom({ plugin: 'workflow-ui', key: 'announced' } as const, [])

type $ = EngineInterface

// Per-load working values; everything drawn lives in $.state, which survives a reload.
const local = {
  root: '',
  contextScript: undefined as string | null | undefined,
  lastStatus: undefined as string | undefined,
  lastStates: new Map<string, string>(),
}

async function readOptional($: $, path: string): Promise<string | null> {
  try {
    return (await $.fs.exists(path)) ? await $.fs.read(path) : null
  } catch {
    return null
  }
}

async function loadRuns($: $): Promise<RunView[]> {
  const dir = `${local.root}/.factory/runs`
  if (!local.root || !(await $.fs.exists(dir))) return []
  const entries = await $.fs.list(dir)
  const names = newestFirst(entries.filter(e => e.kind === 'dir').map(e => e.name))
  const views: RunView[] = []
  for (const name of names.slice(0, MAX_RUNS)) {
    const runJson = await readOptional($, `${dir}/${name}/run.json`)
    if (!runJson) continue
    const view = parseRun(
      runJson,
      await readOptional($, `${dir}/${name}/verdict.json`),
      await readOptional($, `${dir}/${name}/review.md`),
    )
    if (view) views.push(view)
  }
  return views
}

async function announce($: $, runs: readonly RunView[]) {
  const announced = await read($, announcedAtom)
  const context = await read($, contextAtom)
  const fresh: string[] = []
  for (const run of runs) {
    const key = `${run.id}:${run.state}`
    const before = local.lastStates.get(run.id)
    local.lastStates.set(run.id, run.state)
    if (run.gate && !announced.includes(key)) {
      const text = `${gateLabel(run.gate)} · ${gateText(run)}`
      $.ui.toast(text, { timeoutMs: 8000 })
      void $.ui.notify(text, { title: 'software-factory' }).catch(() => undefined)
      fresh.push(key)
    }
    // Only a run seen finishing in this session earns the reminder.
    if (run.state === 'done' && before && before !== 'done' && context?.initialized) {
      $.ui.toast(`${run.title} terminó · corré /contextly:update cuando se mergee`, {
        timeoutMs: 10000,
      })
    }
  }
  if (fresh.length) await update($, announcedAtom, list => [...list, ...fresh].slice(-50))
}

async function refreshStatus($: $) {
  const text = statusText(await read($, runsAtom), await read($, contextAtom))
  if (text !== local.lastStatus) {
    local.lastStatus = text
    $.ui.status(text)
  }
}

async function refreshAgentStatus($: $) {
  const agents = await read($, agentsAtom)
  if (!agents.some(a => a.status === 'running' || a.status === 'waiting')) return
  const live = new Map((await $.agent.list()).map(info => [info.id, info.status]))
  await update($, agentsAtom, list =>
    list.map(a => {
      const status = live.get(a.id)
      return status && status !== a.status ? { ...a, status } : a
    }),
  )
}

async function pollRuns($: $) {
  try {
    const runs = await loadRuns($)
    if (JSON.stringify(runs) !== JSON.stringify(await read($, runsAtom))) {
      await update($, runsAtom, () => runs)
    }
    await announce($, runs)
    await refreshAgentStatus($)
    await refreshStatus($)
  } catch {
    // A view must never break the session it describes.
  }
}

// Prefers the repository's own copy (this marketplace), then the newest
// installed contextly plugin.
async function findContextly($: $): Promise<string | null> {
  const repoCopy = `${local.root}/plugins/contextly/scripts/contextly.py`
  if (await $.fs.exists(repoCopy)) return repoCopy
  const found = await $.process.run([
    'sh',
    '-c',
    'ls -dt "$HOME"/.claude/plugins/cache/*/contextly/*/scripts/contextly.py 2>/dev/null | head -1',
  ])
  return found.stdout.trim() || null
}

async function pollContext($: $) {
  try {
    if (!local.root || !(await $.fs.exists(`${local.root}/.context/index.md`))) return
    if (local.contextScript === undefined) local.contextScript = await findContextly($)
    if (!local.contextScript) return
    const out = await $.process.run(['python3', local.contextScript, 'status', '--json'], {
      cwd: local.root,
      timeoutMs: 15000,
    })
    const context: ContextView | null = parseContext(out.stdout)
    if (JSON.stringify(context) !== JSON.stringify(await read($, contextAtom))) {
      await update($, contextAtom, () => context)
    }
    await refreshStatus($)
  } catch {
    // Same rule as the runs poll.
  }
}

async function newAgent($: $, id: string, type?: string, description?: string): Promise<AgentView> {
  const info = type ? undefined : (await $.agent.list()).find(a => a.id === id)
  return {
    id,
    type: type ?? info?.type ?? 'agent',
    description: description ?? info?.description ?? '',
    status: 'running',
    startedAt: await $.clock.now(),
    durationMs: null,
    calls: [],
    callCount: 0,
    blockCount: 0,
  }
}

async function openPane($: $, tab?: PaneTab): Promise<string> {
  if (tab) await update($, tabAtom, () => tab)
  try {
    const placed = await $.ui.open({ id: PANE, title: 'Factory' })
    return placed.isPlaced ? '' : placed.reason
  } catch (error) {
    return String(error)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      local.root = await $.session.root()
    } catch {
      local.root = ''
    }
    await $.command.register({
      name: 'factory',
      description: 'Panel de software-factory: corridas, criterios con evidencia y subagentes en vivo',
      argumentHint: '[agents]',
    })
    $.clock.every(RUNS_EVERY_MS, () => void pollRuns($))
    $.clock.every(CONTEXT_EVERY_MS, () => void pollContext($))
    void pollRuns($)
    void pollContext($)
    return next(e)
  })

  on('command.run', { command: 'factory' }, async ($, e) => {
    const tab: PaneTab = e.args.trim().startsWith('agent') ? 'agents' : 'runs'
    await pollRuns($)
    const why = await openPane($, tab)
    const runs = await read($, runsAtom)
    const head = runs.length
      ? `${runs.length} corrida(s); la más reciente: ${runs[0]?.title} (${runs[0]?.state}).`
      : 'No hay corridas en .factory/runs todavía.'
    return { text: why ? `${head} El panel no se pudo mostrar: ${why}` : head }
  })

  // --- subagent activity: observe only -------------------------------------

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if ('agentId' in result && typeof result.agentId === 'string') {
      const agent = await newAgent($, result.agentId, e.subagentType, e.description)
      await update($, agentsAtom, list =>
        [agent, ...list.filter(a => a.id !== agent.id)].slice(0, MAX_AGENTS),
      )
    }
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (!id) return next(e)
    const result = await next(e)
    try {
      const input = e as unknown as Record<string, unknown>
      const { outcome, reason } = outcomeOf(result)
      const call = { tool: String(e.tool), target: callTarget(input, local.root), outcome, reason }
      const known = (await read($, agentsAtom)).some(a => a.id === id)
      const fresh = known ? null : await newAgent($, id)
      await update($, agentsAtom, list => {
        const base = list.some(a => a.id === id) ? list : fresh ? [fresh, ...list] : list
        return base
          .map(a =>
            a.id === id
              ? {
                  ...a,
                  calls: pushCall(a.calls, call),
                  callCount: a.callCount + 1,
                  blockCount: a.blockCount + (outcome === 'blocked' ? 1 : 0),
                }
              : a,
          )
          .slice(0, MAX_AGENTS)
      })
    } catch {
      // Recording is best effort; the call's result goes back unchanged.
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      try {
        const status = e.reason === 'answer' ? 'completed' : e.reason
        await update($, agentsAtom, list =>
          list.map(a => (a.id === id ? { ...a, status, durationMs: e.durationMs } : a)),
        )
      } catch {
        // Best effort, as above.
      }
    }
    return next(e)
  })

  // --- drawing --------------------------------------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const run = (await read($, runsAtom)).find(r => r.gate !== null)
    if (!run || !run.gate) return next(e)
    const key = `${run.id}:${run.state}`
    if ((await read($, dismissedAtom)) === key) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        <Text color="warning" bold>
          {gateLabel(run.gate)}
        </Text>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">{gateText(run)}</Text>
        </Box>
        <Button key="open" label="Abrir panel" onPress={() => void openPane($, 'runs')} />
        <Button key="hide" label="Ocultar" onPress={() => update($, dismissedAtom, () => key)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const tab = await read($, tabAtom)
    const runs = await read($, runsAtom)
    const agents = await read($, agentsAtom)
    const active = agents.filter(a => a.status === 'running' || a.status === 'waiting').length

    const mark = (m: StageMark) => (m === 'done' ? '✓' : m === 'now' ? '▸' : m === 'fail' ? '✗' : '·')
    const markColor = (m: StageMark) =>
      m === 'done' ? 'success' : m === 'now' ? 'warning' : m === 'fail' ? 'error' : 'subtle'
    const statusColor = (s: string) =>
      s === 'pass' || s === 'approve' || s === 'completed'
        ? 'success'
        : s === 'fail' || s === 'request-changes' || s === 'failed' || s === 'error'
          ? 'error'
          : 'warning'

    const tabs = (
      <Box flexDirection="row" gap={1}>
        <Button
          key="tab-runs"
          label="Corridas"
          variant={tab === 'runs' ? 'primary' : 'secondary'}
          onPress={() => update($, tabAtom, () => 'runs' as const)}
        />
        <Button
          key="tab-agents"
          label={`Agentes (${active})`}
          variant={tab === 'agents' ? 'primary' : 'secondary'}
          onPress={() => update($, tabAtom, () => 'agents' as const)}
        />
      </Box>
    )

    const runsView =
      runs.length === 0 ? (
        <Text dimColor>No hay corridas en .factory/runs. Empezá una con /software-factory:run.</Text>
      ) : (
        <Box flexDirection="column" gap={1}>
          {runs.map((run, index) => (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Text bold wrap="truncate-end">
                  {run.title}
                </Text>
                <Text color={run.gate ? 'warning' : 'subtle'}>
                  [{run.gate ? gateLabel(run.gate) : run.state}]
                </Text>
                {run.iteration > 0 && (
                  <Text dimColor>
                    iter {run.iteration}/{run.maxIterations}
                  </Text>
                )}
              </Box>
              <Box flexDirection="row" gap={1}>
                {run.stages.map((m, i) => (
                  <Text color={markColor(m)}>
                    {mark(m)} {STAGES[i]}
                  </Text>
                ))}
              </Box>
              <Text dimColor wrap="truncate-end">
                {run.branch} · {shortSha(run.devSha)} · {run.updatedAt}
              </Text>
              {index === 0 &&
                run.criteria.map(c => (
                  <Box flexDirection="row" gap={1}>
                    <Text color={statusColor(c.status)}>
                      {c.id} {c.status}
                    </Text>
                    <Text dimColor wrap="truncate-start">
                      {c.evidence}
                    </Text>
                  </Box>
                ))}
              {index === 0 && (run.qaOverall || run.review) && (
                <Text>
                  QA <Text color={statusColor(run.qaOverall ?? '')}>{run.qaOverall ?? '-'}</Text> ·
                  review <Text color={statusColor(run.review ?? '')}>{run.review ?? '-'}</Text>
                </Text>
              )}
              {index === 0 && run.pr && <Text color="suggestion">{run.pr}</Text>}
            </Box>
          ))}
        </Box>
      )

    const agentsView =
      agents.length === 0 ? (
        <Text dimColor>Ningún subagente en esta sesión todavía.</Text>
      ) : (
        <Box flexDirection="column" gap={1}>
          {agents.map(agent => (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Text bold color={isFactoryRole(agent.type) ? 'suggestion' : 'text'}>
                  {roleOf(agent.type)}
                </Text>
                <Text color={statusColor(agent.status)}>{agent.status}</Text>
                {agent.durationMs !== null && <Text dimColor>{duration(agent.durationMs)}</Text>}
                <Text dimColor>
                  {agent.callCount} llamadas
                  {agent.blockCount ? ` · ${agent.blockCount} bloqueos` : ''}
                </Text>
              </Box>
              {agent.description && (
                <Text dimColor wrap="truncate-end">
                  {agent.description}
                </Text>
              )}
              {agent.calls.slice(-5).map(call => (
                <Box flexDirection="column">
                  <Box flexDirection="row" gap={1}>
                    <Text
                      color={call.outcome === 'ok' ? 'subtle' : 'error'}
                    >
                      {call.outcome === 'ok' ? ' ' : '✗'} {call.tool}
                    </Text>
                    <Text wrap="truncate-end">{call.target}</Text>
                  </Box>
                  {call.outcome === 'blocked' && (
                    <Text color="error" wrap="truncate-end">
                      {'   '}
                      {call.reason}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {tab === 'runs' ? runsView : agentsView}
      </Box>
    )
  })
}
