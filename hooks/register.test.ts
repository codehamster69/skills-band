import { expect, test } from 'claude-code/testing'

const props = { hasSurvey: false, isWorking: false, maxRows: 10 } as never

for (const surface of ['terminal', 'desktop'] as const) {
  test(`modes, dots and counts on ${surface}`, async ($, on) => {
    on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    on('env.get', () => ({ value: 'C:/cfg' }) as never)
    on('classic.SessionStart', () => ({ additionalContext: ['CAVEMAN MODE ACTIVE — mode: caveman', 'PONYTAIL MODE ACTIVE — level: full'] }) as never)
    on('classic.UserPromptSubmit', () => ({ additionalContext: ['CAVEMAN MODE ACTIVE (caveman). Respond terse'] }) as never)
    on('fs.read', (_$, e) => ({ value: String((e as { path: string }).path).includes('ponytail') ? 'ultra\n' : 'full\n' }) as never)

    await $.classic.SessionStart({ source: 'startup' } as never)
    await $.classic.UserPromptSubmit({ prompt: 'a' } as never)
    await $.prompt.submit({ text: 'a' } as never)
    await $.skill.prompt({ skill: 'supabase', text: '' } as never)
    await $.prompt.submit({ text: 'b' } as never)
    await $.skill.prompt({ skill: 'seo-audit', text: '' } as never)
    await $.skill.prompt({ skill: 'seo-audit', text: '' } as never)

    const ui = await $.ui.mount({ plugin: 'skills-band', surface, component: 'AbovePrompt', props })
    const chip = (key: string) => ui.find({ type: 'Box', key })
    expect((await chip('caveman'))?.text).toBe('●caveman')
    expect((await chip('ponytail'))?.text).toBe('●ponytail:ultra')
    expect((await chip('seo-audit'))?.text).toBe('●seo-audit ×2')
    expect((await chip('supabase'))?.text).toBe('supabase')
    // the dot is Claude's orange; labels keep the theme's text color, older ones dimmed
    expect((await ui.find({ type: 'Text', text: '●' }))?.props.color).toBe(surface === 'terminal' ? 'claude' : '#d97757')
    expect((await ui.find({ type: 'Text', text: 'supabase' }))?.props.dimColor).toBe(true)
    expect((await ui.find({ type: 'Text', text: 'seo-audit ×2' }))?.props.color).toBeUndefined()
  })
}

test('spinner replaces the fresh mark while working', async ($, on) => {
  on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  await $.prompt.submit({ text: 'a' } as never)
  await $.skill.prompt({ skill: 'stripe', text: '' } as never)

  const working = { hasSurvey: false, isWorking: true, maxRows: 10 } as never
  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props: working })
  expect((await ui.find({ type: 'Box', key: 'stripe' }))?.text).toMatch(/^[◐◓◑◒]stripe$/)
})

test('plugin skills show their short name, and an empty band says so', async ($, on) => {
  on('skill.prompt', (_$, e) => ({ text: e.text }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Text', text: 'no skills used yet' })).toBeDefined()

  await $.prompt.submit({ text: '/frontend-design' } as never)
  await $.skill.prompt({ skill: 'frontend-design:frontend-design', text: '' } as never)
  const after = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props })
  expect((await after.find({ type: 'Box', key: 'frontend-design:frontend-design' }))?.text).toBe('●frontend-design')
  expect(await after.find({ type: 'Text', text: 'no skills used yet' })).toBeUndefined()
})

test('badges follow what the hooks inject, not flag files', async ($, on) => {
  let reminder = true
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('classic.SessionStart', () => ({ additionalContext: ['CAVEMAN MODE ACTIVE — mode: caveman'] }) as never)
  on('classic.UserPromptSubmit', () => (reminder ? { additionalContext: ['CAVEMAN MODE ACTIVE (ultra). Respond terse'] } : {}) as never)
  // a ponytail flag left by another window must not add a badge here
  on('env.get', () => ({ value: 'C:/cfg' }) as never)
  on('fs.read', () => ({ value: 'full\n' }) as never)

  await $.classic.SessionStart({ source: 'startup' } as never)
  await $.classic.UserPromptSubmit({ prompt: 'a' } as never)
  await $.prompt.submit({ text: 'a' } as never)
  let ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props })
  expect((await ui.find({ type: 'Box', key: 'caveman' }))?.text).toBe('●caveman:ultra')
  expect(await ui.find({ type: 'Box', key: 'ponytail' })).toBeUndefined()

  reminder = false
  await $.classic.UserPromptSubmit({ prompt: 'stop caveman' } as never)
  ui = await $.ui.mount({ plugin: 'skills-band', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Box', key: 'caveman' })).toBeUndefined()
})

test('a band loaded after the session started falls back to the ponytail flag', async ($, on) => {
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('env.get', () => ({ value: 'C:/cfg' }) as never)
  on('fs.read', () => ({ value: 'ultra\n' }) as never)

  // no classic.SessionStart: the module missed it
  await $.prompt.submit({ text: 'a' } as never)
  const ui = await $.ui.mount({ plugin: 'skills-band', surface: 'desktop', component: 'AbovePrompt', props })
  expect((await ui.find({ type: 'Box', key: 'ponytail' }))?.text).toBe('●ponytail:ultra')
})
