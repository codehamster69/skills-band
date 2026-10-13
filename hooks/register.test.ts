import { expect, test } from 'claude-code/testing'

const props = { hasSurvey: false, isWorking: false, maxRows: 10 } as never

for (const surface of ['terminal', 'desktop'] as const) {
  test(`modes, heat and counts on ${surface}`, async ($, on) => {
    on('tool.call', () => ({ result: { success: true, commandName: 'x' } }) as never)
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    on('env.get', () => ({ value: 'C:/cfg' }) as never)
    on('session.id', () => ({ value: 'abc' }) as never)
    on('fs.read', (_$, e) => ({ value: String((e as { path: string }).path).includes('ponytail') ? 'ultra\n' : 'full\n' }) as never)

    await $.prompt.submit({ text: 'a' } as never)
    await $.tool.call({ tool: 'Skill', skill: 'supabase' } as never)
    await $.prompt.submit({ text: 'b' } as never)
    await $.tool.call({ tool: 'Skill', skill: 'seo-audit' } as never)
    await $.tool.call({ tool: 'Skill', skill: 'seo-audit' } as never)

    const ui = await $.ui.mount({ plugin: 'skills-band', surface, component: 'AbovePrompt', props })
    const bg = async (text: string) => (await ui.find({ type: 'Text', text }))?.props.backgroundColor
    expect(await bg(' caveman ')).toBe('#7c3aed')
    expect(await bg(' ponytail:ultra ')).toBe('#7c3aed')
    expect(await bg(' 🔥 seo-audit ×2 ')).toBe('#f97316')
    expect(await bg(' supabase ')).toBe('#f59e0b')
  })
}

test('spinner replaces the flame while working', async ($, on) => {
  on('tool.call', () => ({ result: { success: true, commandName: 'x' } }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  await $.prompt.submit({ text: 'a' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'stripe' } as never)

  const working = { hasSurvey: false, isWorking: true, maxRows: 10 } as never
  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props: working })
  expect(await ui.find({ type: 'Text', text: /^ [◐◓◑◒] stripe $/ })).toBeDefined()
})
