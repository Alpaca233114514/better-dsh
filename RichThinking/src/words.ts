import type { Preferences } from './config.ts'

// Presentation copy only. Never used to infer work, tools, progress, or reasoning text.
export const words = {
  en: ['Pondering', 'Exploring', 'Investigating', 'Untangling', 'Connecting the dots',
    'Reasoning', 'Contemplating', 'Synthesizing', 'Evaluating', 'Piecing things together',
    'Mulling it over', 'Turning the gears', 'Thinking it through', 'Considering',
    'Reflecting', 'Sorting things out', 'Following a thread', 'Weighing possibilities',
    'Looking closer', 'Making connections', 'Gathering thoughts', 'Letting ideas simmer',
    'Chewing it over', 'Puzzling it out', 'Finding the thread', 'Joining the dots',
    'Noodling', 'Percolating', 'Brewing ideas', 'Thinking a little deeper'],
  zh: ['叽里呱啦中', '琢磨中', '思索中', '捋捋思路中', '串起线索中', '推敲中',
    '酝酿思路中', '整理想法中', '仔细斟酌中', '拼起思路中', '脑袋转转中',
    '咕噜咕噜中', '慢慢想通中', '换个角度想中', '细细琢磨中', '抽丝剥茧中',
    '想法冒泡中', '小火慢炖中', '左思右想中', '思绪漫游中', '灵感搅拌中',
    '认真思考中', '再想一想中', '转动小齿轮中'],
} as const

export function vocabulary(config: Preferences, language: 'en' | 'zh'): string[] {
  const custom = language === 'zh' ? config.chineseVerbs : config.englishVerbs
  const selected = config.vocabularyMode === 'replace' && custom.length > 0
    ? custom : [...words[language], ...custom]
  return [...new Set(selected)]
}

/** A complete shuffle bag; never repeat across a bag boundary when there is a choice. */
export class WordBag {
  private bag: string[] = []
  private previous = ''
  constructor(private readonly pool: readonly string[], private readonly random = Math.random) {}
  next(): string {
    if (!this.bag.length) {
      this.bag = [...this.pool]
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1))
        ;[this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!]
      }
      if (this.bag.length > 1 && this.bag.at(-1) === this.previous) {
        ;[this.bag[0], this.bag[this.bag.length - 1]] = [this.bag.at(-1)!, this.bag[0]!]
      }
    }
    this.previous = this.bag.pop() ?? 'Working'
    return this.previous
  }
}
