import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Modes, Skill } from '../types'

const used = atom({ plugin: 'skills-band', key: 'used' } as const, [] as Skill[])
const turn = atom({ plugin: 'skills-band', key: 'turn' } as const, 0)
const frame = atom({ plugin: 'skills-band', key: 'frame' } as const, 0)
const modes = atom({ plugin: 'skills-band', key: 'modes' } as const, { caveman: null, ponytail: null } as Modes)

const SPIN = ['◐', '◓', '◑', '◒']
const INK = '#1c1917'
const HEADER = '#d97757'
const ALWAYS_BG = '#7c3aed'
// heat by turns since last use: this turn, last turn, 2-3 ago, older
const HEAT = ['#f97316', '#f59e0b', '#a16207', '#3f3f46']

const heat = (age: number) => HEAT[age === 0 ? 0 : age === 1 ? 1 : age <= 3 ? 2 : 3]

// the caveman/ponytail hooks write these flags; whitelist the text so nothing odd reaches the band
const readFlag = async ($: EngineInterface, path: string) => {
  try {
    const mode = String(await $.fs.read(path)).split(/\r?\n/)[0].trim()
    return /^[a-z0-9-]{1,20}$/.test(mode) ? mode : null
  } catch {
    return null
  }
}

const loadModes = async ($: EngineInterface) => {
  try {
    await readModes($)
  } catch {
    // badges are cosmetic; a missing env or session id must never block the prompt
  }
}

const readModes = async ($: EngineInterface) => {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = config ?? `${(await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''}/.claude`
  const id = await $.session.id()
  // same lookup as caveman-statusline.ps1: this session's mode, else the machine-wide flag
  const caveman = (/^[A-Za-z0-9_-]{1,128}$/.test(id) ? await readFlag($, `${home}/.caveman-sessions/${id}.mode`) : null)
    ?? (await readFlag($, `${home}/.caveman-active`))
  const ponytail = await readFlag($, `${home}/.ponytail-active`)
  await update($, modes, () => ({ caveman, ponytail }))
}

export const register: Register = on => {
  let spinner: Timer | undefined

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await loadModes($)
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, turn, n => n + 1)
    const ran = await next(e)
    // /caveman and /ponytail mode switches arrive as prompts, so re-read the flags after
    await loadModes($)
    return ran
  })

  // skill.prompt fires for /name, the Skill tool and subagent preloads alike; tool.call saw only the Skill tool
  on('skill.prompt', async ($, e, next) => {
    const ran = await next(e)
    const now = await read($, turn)
    await update($, used, list => {
      const prev = list.find(s => s.name === e.skill)
      return [...list.filter(s => s.name !== e.skill), { name: e.skill, turn: now, count: (prev?.count ?? 0) + 1 }]
    })
    try {
      spinner ??= $.clock.every(120, () => void update($, frame, f => f + 1))
    } catch {
      // no timers on this host: the spinner shows one frame instead of turning
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    spinner?.cancel()
    spinner = undefined
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const now = await read($, turn)
    const tick = await read($, frame)
    const m = await read($, modes)
    const skills = [...(await read($, used))].sort((a, b) => b.turn - a.turn)
    const { Box, Text } = $.ui.resolve(e)

    const always = (['caveman', 'ponytail'] as const).flatMap(name => {
      const mode = m[name]
      if (mode === null) return []
      return [{ name, label: mode === 'full' || mode === name ? name : `${name}:${mode}` }]
    })

    return (
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        <Text key="header" backgroundColor={HEADER} color={INK} bold> SKILLS </Text>
        {always.map(a => (
          <Text key={a.name} backgroundColor={ALWAYS_BG} color="#f5f3ff" bold> {a.label} </Text>
        ))}
        {skills.map(s => {
          const age = now - s.turn
          // emoji draw in their own colors and vanish on the orange chip, so the fresh mark is a plain glyph
          const icon = age !== 0 ? '' : e.props.isWorking ? SPIN[tick % SPIN.length] : '●'
          // plugin skills arrive as plugin:skill; the plugin half is noise in a chip
          const label = s.name.split(':').pop()
          return (
            <Text key={s.name} backgroundColor={heat(age)} color={age > 3 ? '#a1a1aa' : INK} bold={age === 0}>
              {` ${icon ? `${icon} ` : ''}${label}${s.count > 1 ? ` ×${s.count}` : ''} `}
            </Text>
          )
        })}
        {skills.length === 0 && <Text key="empty" dimColor>no skills used yet</Text>}
      </Box>
    )
  })
}
