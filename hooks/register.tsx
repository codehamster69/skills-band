import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Modes, Skill } from '../types'

const used = atom({ plugin: 'skills-band', key: 'used' } as const, [] as Skill[])
const turn = atom({ plugin: 'skills-band', key: 'turn' } as const, 0)
const frame = atom({ plugin: 'skills-band', key: 'frame' } as const, 0)
const modes = atom({ plugin: 'skills-band', key: 'modes' } as const, { caveman: null, ponytail: null } as Modes)

const SPIN = ['◐', '◓', '◑', '◒']
// Claude's own orange marks what is active; everything else takes the surface's text color
const ORANGE = '#d97757'

// dot: an orange mark before the label, spin while its turn runs; dim: used in an earlier turn
type Item = { key: string; text: string; dot: 'on' | 'spin' | null; dim: boolean }

// the README preview's geometry: 14px monospace
const CELL = 8.4
const ROW = 22
const ROW_GAP = 4
const GAP = 2 * CELL
const MAX_WIDTH = 760

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// an Svg is an image, so it cannot read the app's theme colors: the light/dark pair follows the color scheme the app reports
const STYLE = '<style>.t{fill:#1c1917}.d{fill:#1c1917;opacity:.5}@media (prefers-color-scheme:dark){.t{fill:#e7e5e4}.d{fill:#e7e5e4;opacity:.45}}</style>'

const bandSvg = (header: string, items: Item[], tick: number, empty: string | null) => {
  let x = 0
  let y = 0
  const marks: string[] = []
  const place = (cells: number) => {
    const w = cells * CELL
    if (x > 0 && x + w > MAX_WIDTH) {
      x = 0
      y += ROW + ROW_GAP
    }
    const at = x
    x += w + GAP
    return at
  }
  const hx = place([...header].length)
  marks.push(`<text x="${hx.toFixed(1)}" y="${y + 15.5}" class="t" font-weight="700" letter-spacing="1">${esc(header)}</text>`)
  for (const it of items) {
    const at = place([...it.text].length + (it.dot ? 2 : 0))
    let tx = at
    if (it.dot) {
      marks.push(`<text x="${at.toFixed(1)}" y="${y + 15.5}" fill="${ORANGE}">${it.dot === 'spin' ? SPIN[tick % SPIN.length] : '●'}</text>`)
      tx += 2 * CELL
    }
    marks.push(`<text x="${tx.toFixed(1)}" y="${y + 15.5}" class="${it.dim ? 'd' : 't'}">${esc(it.text)}</text>`)
  }
  if (empty) {
    const at = place([...empty].length)
    marks.push(`<text x="${at.toFixed(1)}" y="${y + 15.5}" class="d">${esc(empty)}</text>`)
  }
  const width = Math.ceil(y > 0 ? MAX_WIDTH : Math.max(1, x - GAP))
  const height = y + ROW
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace" font-size="14">${STYLE}${marks.join('')}</svg>`
}

// the caveman and ponytail hooks say so in the context they inject; that text, not a flag file, proves a mode reached this session
const MARKS = {
  caveman: /CAVEMAN MODE ACTIVE(?: — mode: | \()([a-z0-9-]{1,20})/,
  ponytail: /PONYTAIL MODE ACTIVE — level: ([a-z0-9-]{1,20})/,
} as const

const injected = (context: readonly string[] | undefined, name: keyof typeof MARKS) =>
  (context ?? []).join('\n').match(MARKS[name])?.[1] ?? null

// ponytail injects once at session start, so a later /ponytail level switch is read from its flag; whitelist the text
const ponytailFlag = async ($: EngineInterface) => {
  try {
    const config = await $.env.get('CLAUDE_CONFIG_DIR')
    const home = config ?? `${(await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''}/.claude`
    const mode = String(await $.fs.read(`${home}/.ponytail-active`)).split(/\r?\n/)[0].trim()
    return /^[a-z0-9-]{1,20}$/.test(mode) ? mode : null
  } catch {
    return null
  }
}

export const register: Register = on => {
  let spinner: Timer | undefined

  on('classic.SessionStart', async ($, e, next) => {
    const ran = await next(e)
    const context = (ran as { additionalContext?: string[] }).additionalContext
    await update($, modes, () => ({ caveman: injected(context, 'caveman'), ponytail: injected(context, 'ponytail') }))
    return ran
  })

  // caveman re-injects on every prompt while it is on, so the latest prompt decides its badge
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const ran = await next(e)
    const caveman = injected((ran as { additionalContext?: string[] }).additionalContext, 'caveman')
    await update($, modes, m => ({ ...m, caveman }))
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, turn, n => n + 1)
    const ran = await next(e)
    // the flag only relabels a ponytail this session already has; another window cannot add or remove it
    if ((await read($, modes)).ponytail !== null) {
      const level = await ponytailFlag($)
      if (level !== null) await update($, modes, m => ({ ...m, ponytail: level }))
    }
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

    // caveman and ponytail are only listed while their hooks inject, so a listed one is always active
    const items: Item[] = [
      ...always.map(a => ({ key: a.name, text: a.label, dot: 'on' as const, dim: false })),
      ...skills.map(s => {
        const isFresh = now === s.turn
        // plugin skills arrive as plugin:skill; the plugin half is noise in the band
        const label = s.name.split(':').pop() ?? s.name
        return {
          key: s.name,
          text: `${label}${s.count > 1 ? ` ×${s.count}` : ''}`,
          dot: isFresh ? (e.props.isWorking ? ('spin' as const) : ('on' as const)) : null,
          dim: !isFresh,
        }
      }),
    ]
    const empty = skills.length === 0 ? 'no skills used yet' : null

    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      return <Svg source={bandSvg('SKILLS', items, tick, empty)} alt={`Skills: ${items.map(i => i.text).join(', ') || 'none yet'}`} />
    }

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2}>
        <Text key="header" bold>SKILLS</Text>
        {items.map(it => (
          <Box key={it.key}>
            {it.dot && <Text color="claude">{it.dot === 'spin' ? SPIN[tick % SPIN.length] : '●'} </Text>}
            <Text dimColor={it.dim}>{it.text}</Text>
          </Box>
        ))}
        {empty && <Text key="empty" dimColor>{empty}</Text>}
      </Box>
    )
  })
}
