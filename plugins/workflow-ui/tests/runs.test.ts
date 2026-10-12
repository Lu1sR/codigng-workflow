import { describe, expect, test } from 'claude-code/testing'

import {
  callTarget,
  gateOf,
  gateText,
  outcomeOf,
  parseContext,
  parseRun,
  reviewVerdict,
  stagesOf,
  statusText,
} from '../hooks/runs'

const RUN = JSON.stringify({
  run_id: '20261012-1430-login',
  title: 'Login con magic link',
  state: 'review_done',
  iteration: 2,
  max_iterations: 3,
  feature_branch: 'factory/20261012-1430-login',
  dev_sha: '9f3e21ab45cd',
  history: [{ at: '2026-10-12T15:02:00Z', state: 'review_done' }],
})

const VERDICT = JSON.stringify({
  overall: 'pass',
  criteria: [
    { id: 'AC-1', status: 'pass', evidence: ['evidence/qa/iter-2/e2e.log'] },
    { id: 'AC-2', status: 'pass', evidence: [] },
  ],
})

describe('runs', () => {
  test('gates map to the three human stops', () => {
    expect(gateOf('spec_ready')).toBe('spec')
    expect(gateOf('awaiting_deploy')).toBe('deploy')
    expect(gateOf('review_done')).toBe('push')
    expect(gateOf('testing')).toBe(null)
  })

  test('parseRun joins run.json, verdict.json and review.md', () => {
    const run = parseRun(RUN, VERDICT, '# Review\n\nVerdict: approve\n')
    expect(run?.gate).toBe('push')
    expect(run?.qaOverall).toBe('pass')
    expect(run?.review).toBe('approve')
    expect(run?.criteria.map(c => c.id)).toEqual(['AC-1', 'AC-2'])
    expect(run?.criteria[1]?.evidence).toBe('')
    expect(run?.updatedAt).toBe('2026-10-12T15:02:00Z')
    expect(gateText(run!)).toBe('Login con magic link · QA pass, review approve · decidí push / PR')
  })

  test('parseRun refuses what is not a run', () => {
    expect(parseRun('{', null, null)).toBe(null)
    expect(parseRun('{"state":"init"}', null, null)).toBe(null)
  })

  test('stages mark progress and where a run failed', () => {
    expect(stagesOf('testing')).toEqual(['done', 'done', 'now', 'todo', 'todo'])
    expect(stagesOf('done')).toEqual(['done', 'done', 'done', 'done', 'done'])
    expect(stagesOf('failed', [{ state: 'testing' }, { state: 'qa_done' }, { state: 'failed' }])).toEqual([
      'done',
      'done',
      'fail',
      'todo',
      'todo',
    ])
  })

  test('review verdict tolerates bold markdown', () => {
    expect(reviewVerdict('**Verdict:** request-changes')).toBe('request-changes')
    expect(reviewVerdict(null)).toBe(null)
  })

  test('status line joins context and the newest run', () => {
    const run = parseRun(RUN, null, null)!
    const stale = parseContext('{"initialized": true, "stale": true, "changed_files": ["plugins/a.md", "README.md"]}')
    expect(statusText([run], stale)).toBe('ctx: STALE (plugins, README.md) · factory: review_done 2/3')
    expect(statusText([], { initialized: true, stale: false, changed: [] })).toBe('ctx: fresh')
    expect(statusText([], null)).toBe(undefined)
  })

  test('call targets read from the worktree down', () => {
    const root = '/repo'
    expect(callTarget({ file_path: '/repo/.factory/worktrees/r1/dev.wt/src/a.ts' }, root)).toBe('dev.wt/src/a.ts')
    expect(callTarget({ file_path: '/repo/src/b.ts' }, root)).toBe('src/b.ts')
    expect(callTarget({ command: 'npm   test' }, root)).toBe('npm test')
  })

  test('guard refusals count as blocked, other errors do not', () => {
    expect(outcomeOf({ deny: 'nope' }).outcome).toBe('blocked')
    expect(
      outcomeOf({ isError: true, text: 'software-factory guard (worktree): blocked command: git push' }).outcome,
    ).toBe('blocked')
    expect(outcomeOf({ isError: true, text: 'ENOENT' }).outcome).toBe('error')
    expect(outcomeOf({}).outcome).toBe('ok')
  })
})
