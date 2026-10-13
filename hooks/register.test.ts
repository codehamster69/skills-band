import { expect, test } from 'claude-code/testing'

const props = { hasSurvey: false, isWorking: false, maxRows: 10 } as never

for (const surface of ['terminal'] as const) {
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
    const chip = (key: string) => ui.find({ type: 'Box', key })
    expect((await chip('caveman'))?.props).toMatchObject({ backgroundColor: '#7c3aed', paddingX: 1 })
    expect((await chip('ponytail'))?.text).toBe('ponytail:ultra')
    expect((await chip('seo-audit'))?.props.backgroundColor).toBe('#f97316')
    expect((await chip('seo-audit'))?.text).toBe('● seo-audit ×2')
    expect((await chip('supabase'))?.props.backgroundColor).toBe('#f59e0b')
  })
}

test('spinner replaces the fresh mark while working', async ($, on) => {
  on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  await $.prompt.submit({ text: 'a' } as never)
  await $.skill.prompt({ skill: 'stripe', text: '' } as never)

  const working = { hasSurvey: false, isWorking: true, maxRows: 10 } as never
  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props: working })
  expect(await ui.find({ type: 'Text', text: /^[◐◓◑◒] stripe$/ })).toBeDefined()
})

test('plugin skills show their short name, and an empty band says so', async ($, on) => {
  on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Text', text: 'no skills used yet' })).toBeDefined()

  await $.prompt.submit({ text: '/frontend-design' } as never)
  await $.skill.prompt({ skill: 'frontend-design:frontend-design', text: '' } as never)
  const after = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await after.find({ type: 'Text', text: '● frontend-design' })).toBeDefined()
  expect(await after.find({ type: 'Text', text: 'no skills used yet' })).toBeUndefined()
})

test('desktop draws the README design as one Svg', async ($, on) => {
  on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('env.get', () => ({ value: 'C:/cfg' }) as never)
  on('session.id', () => ({ value: 'abc' }) as never)
  on('fs.read', (_$, e) => ({ value: String((e as { path: string }).path).includes('ponytail') ? 'ultra\n' : 'full\n' }) as never)

  await $.prompt.submit({ text: 'a' } as never)
  await $.skill.prompt({ skill: 'supabase', text: '' } as never)
  await $.prompt.submit({ text: 'b' } as never)
  await $.skill.prompt({ skill: 'seo-audit', text: '' } as never)
  await $.skill.prompt({ skill: 'a<b', text: '' } as never)

  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'desktop', component: 'AbovePrompt', props })
  const svg = await ui.find({ type: 'Svg' })
  const source = String(svg?.props.source)
  expect(source).toContain('>SKILLS<')
  expect(source).toContain('>ponytail:ultra<')
  expect(source).toContain('fill="#f97316"')
  expect(source).toContain('>supabase<')
  expect(source).toContain('a&lt;b')
  expect(String(svg?.props.alt)).toContain('supabase')
})
