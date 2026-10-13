export type Skill = { name: string; turn: number; count: number }
export type Modes = { caveman: string | null; ponytail: string | null }

declare module 'claude-code' {
  interface PluginState {
    'skills-band': { used: Skill[]; turn: number; frame: number; modes: Modes }
  }
}
