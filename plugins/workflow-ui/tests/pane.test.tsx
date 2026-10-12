import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'workflow-ui',
  props: {
    title: 'Factory',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('a spawned factory agent shows in the Agentes tab', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('agent.spawn', () => ({ model: 'test-model', agentId: 'agent-1' }))

  // The test engine fills the rest of the spawn envelope, as a model's Agent call does.
  const spawn = {
    prompt: 'Implement the plan',
    subagentType: 'software-factory:factory-dev',
    description: 'implement login',
  } as unknown as Parameters<typeof $.agent.spawn>[0]
  await $.agent.spawn(spawn)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'workflow-ui', surface, ...PANE })
    expect(await ui.find({ text: /No hay corridas/ })).toBeDefined()
    await ui.press({ key: 'tab-agents' })
    expect(await ui.find({ type: 'Text', text: 'factory-dev' })).toBeDefined()
    expect(await ui.find({ text: /implement login/ })).toBeDefined()
    await ui.press({ key: 'tab-runs' })
    await ui.unmount()
  }
})
