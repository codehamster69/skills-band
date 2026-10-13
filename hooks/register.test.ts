import { expect, test } from 'claude-code/testing'

const props = { hasSurvey: false, isWorking: false, maxRows: 10 } as never

for (const surface of ['terminal', 'desktop'] as const) {
  test(`modes, heat and counts on ${surface}`, async ($, on) => {
    on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    on('env.get', () => ({ value: 'C:/cfg' }) as never)
    on('session.id', () => ({ value: 'abc' }) as never)
    on('fs.read', (_$, e) => ({ value: String((e as { path: string }).path).includes('ponytail') ? 'ultra\n' : 'full\n' }) as never)

    await $.prompt.submit({ text: 'a' } as never)
    await $.skill.prompt({ skill: 'supabase', text: '' } as never)
    await $.prompt.submit({ text: 'b' } as never)
    await $.skill.prompt({ skill: 'seo-audit', text: '' } as never)
    await $.skill.prompt({ skill: 'seo-audit', text: '' } as never)

    const ui = await $.ui.mount({ plugin: 'skills-band', surface, component: 'AbovePrompt', props })
    const bg = async (text: string) => (await ui.find({ type: 'Text', text }))?.props.backgroundColor
    expect(await bg(' caveman ')).toBe('#7c3aed')
    expect(await bg(' ponytail:ultra ')).toBe('#7c3aed')
    expect(await bg(' ● seo-audit ×2 ')).toBe('#f97316')
    expect(await bg(' supabase ')).toBe('#f59e0b')
  })
}

test('spinner replaces the fresh mark while working', async ($, on) => {
  on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  await $.prompt.submit({ text: 'a' } as never)
  await $.skill.prompt({ skill: 'stripe', text: '' } as never)

  const working = { hasSurvey: false, isWorking: true, maxRows: 10 } as never
  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props: working })
  expect(await ui.find({ type: 'Text', text: /^ [◐◓◑◒] stripe $/ })).toBeDefined()
})

test('plugin skills show their short name, and an empty band says so', async ($, on) => {
  on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Text', text: 'no skills used yet' })).toBeDefined()

  await $.prompt.submit({ text: '/frontend-design' } as never)
  await $.skill.prompt({ skill: 'frontend-design:frontend-design', text: '' } as never)
  const after = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await after.find({ type: 'Text', text: ' ● frontend-design ' })).toBeDefined()
  expect(await after.find({ type: 'Text', text: 'no skills used yet' })).toBeUndefined()
})
