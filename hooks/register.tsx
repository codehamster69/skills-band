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

type Chip = { key: string; bg: string; fg: string; text: string; bold: boolean }

// the README preview's geometry: 14px monospace, one cell of padding each side, one cell between chips
const CELL = 8.4
const ROW = 22
const ROW_GAP = 6
const MAX_WIDTH = 760

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// surfaces that draw Svg get the exact README look; the slot's own width and font never touch it
const bandSvg = (chips: Chip[], empty: string | null) => {
  let x = 0
  let y = 0
  const marks: string[] = []
  for (const c of chips) {
    const w = ([...c.text].length + 2) * CELL
    if (x > 0 && x + w > MAX_WIDTH) {
      x = 0
      y += ROW + ROW_GAP
    }
    marks.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${ROW}" fill="${c.bg}"/>`)
    marks.push(`<text x="${(x + w / 2).toFixed(1)}" y="${y + 15.5}" fill="${c.fg}" text-anchor="middle"${c.bold ? ' font-weight="700"' : ''}>${esc(c.text)}</text>`)
    x += w + CELL
  }
  if (empty) {
    marks.push(`<text x="${x.toFixed(1)}" y="${y + 15.5}" fill="#78716c">${esc(empty)}</text>`)
    x += [...empty].length * CELL + CELL
  }
  const width = Math.ceil(Math.min(MAX_WIDTH, y > 0 ? MAX_WIDTH : x - CELL))
  const height = y + ROW
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace" font-size="14">${marks.join('')}</svg>`
}

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
    const always = (['caveman', 'ponytail'] as const).flatMap(name => {
      const mode = m[name]
      if (mode === null) return []
      return [{ name, label: mode === 'full' || mode === name ? name : `${name}:${mode}` }]
    })

    const chips: Chip[] = [
      { key: 'header', bg: HEADER, fg: INK, text: 'SKILLS', bold: true },
      ...always.map(a => ({ key: a.name, bg: ALWAYS_BG, fg: '#f5f3ff', text: a.label, bold: true })),
      ...skills.map(s => {
        const age = now - s.turn
        // emoji draw in their own colors and vanish on the orange chip, so the fresh mark is a plain glyph
        const icon = age !== 0 ? '' : e.props.isWorking ? SPIN[tick % SPIN.length] : '●'
        // plugin skills arrive as plugin:skill; the plugin half is noise in a chip
        const label = s.name.split(':').pop()
        const text = `${icon ? `${icon} ` : ''}${label}${s.count > 1 ? ` ×${s.count}` : ''}`
        return { key: s.name, bg: heat(age), fg: age > 3 ? '#a1a1aa' : INK, text, bold: age === 0 }
      }),
    ]
    const empty = skills.length === 0 ? 'no skills used yet' : null

    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      return <Svg source={bandSvg(chips, empty)} alt={`Skills: ${chips.slice(1).map(c => c.text).join(', ') || 'none yet'}`} />
    }

    const { Box, Text } = $.ui.resolve(e)
    // padding lives on the Box so the chip keeps its shape however the surface sizes a space
    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={1}>
        {chips.map(c => (
          <Box key={c.key} backgroundColor={c.bg} paddingX={1}>
            <Text color={c.fg} bold={c.bold}>{c.text}</Text>
          </Box>
        ))}
        {empty && <Text key="empty" dimColor>{empty}</Text>}
      </Box>
    )
  })
}
