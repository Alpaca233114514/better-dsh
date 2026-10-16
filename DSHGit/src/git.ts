import { basename } from 'node:path'
import { protectedBranch, type FileChange, type GitState, type Request, type Result } from './contracts.ts'

export type Runner = (program: 'git' | 'gh', args: string[], cwd: string, input?: string, allowed?: number[]) => Promise<string>
export function parseStatus(raw: string): FileChange[] {
  const chunks = raw.split('\0'), files: FileChange[] = []
  for (let i = 0; i < chunks.length; i++) {
    const row = chunks[i]
    if (!row) continue
    const file: FileChange = { index: row[0], worktree: row[1], path: row.slice(3) }
    if (/[RC]/.test(row.slice(0, 2))) file.original = chunks[++i]
    files.push(file)
  }
  return files
}
export function numstat(raw: string) {
  // With -z, renamed paths follow an empty name as two extra NUL records.
  let additions = 0, deletions = 0
  const chunks = raw.split('\0')
  for (let i = 0; i < chunks.length; i++) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(chunks[i])
    if (!match) continue
    additions += Number(match[1]) || 0; deletions += Number(match[2]) || 0
    if (!match[3]) i += 2
  }
  return { additions, deletions }
}
const required = (value: string | undefined, label: string) => {
  if (!value?.trim() || value.includes('\0')) throw new Error(`请填写${label}。`)
  return value.trim()
}

export class GitRepository {
  readonly run: Runner
  constructor(run: Runner) { this.run = run }
  private git(cwd: string, args: string[], input?: string, allowed?: number[]) {
    return this.run('git', ['--no-pager', '-c', 'color.ui=false', ...args], cwd, input, allowed)
  }
  async state(cwd: string): Promise<GitState> {
    const root = (await this.git(cwd, ['rev-parse', '--show-toplevel'])).trim()
    const branch = (await this.git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], undefined, [0, 1])).trim()
    const raw = await this.git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    const upstream = (await this.git(root, ['rev-parse', '--verify', '--quiet', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], undefined, [0, 1, 128])).trim()
    let ahead = 0, behind = 0
    if (upstream) [ahead, behind] = (await this.git(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])).trim().split(/\s+/).map(Number)
    const staged = numstat(await this.git(root, ['diff', '--cached', '--numstat', '-z', '--no-ext-diff', '--no-textconv']))
    const working = numstat(await this.git(root, ['diff', '--numstat', '-z', '--no-ext-diff', '--no-textconv']))
    return { root, name: basename(root), branch, upstream, ahead, behind, files: parseStatus(raw),
      additions: staged.additions + working.additions, deletions: staged.deletions + working.deletions,
      protected: protectedBranch(branch) }
  }
  async execute(cwd: string, request: Request): Promise<Result> {
    const state = await this.state(cwd), root = state.root
    if (request.action === 'state') return { state }
    if (request.action === 'branches') return { branches: (await this.git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])).trim().split('\n').filter(Boolean) }
    if (request.action === 'diff' || request.action === 'stage' || request.action === 'unstage') {
      const file = state.files.find(f => f.path === request.path)
      if (!file) throw new Error('文件状态已变化，请刷新后重试。')
      const paths = file.original ? [file.original, file.path] : [file.path]
      if (request.action === 'diff') {
        if (file.index === '?') return { text: await this.git(root, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', '/dev/null', file.path], undefined, [0, 1]) }
        return { text: await this.git(root, ['diff', ...(request.staged ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--', ...paths]) || '没有文本差异（文件可能为二进制或仅权限发生变化）。' }
      }
      if (request.action === 'stage') await this.git(root, ['add', '--', ...paths])
      else {
        const head = (await this.git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], undefined, [0, 1, 128])).trim()
        await this.git(root, head ? ['restore', '--staged', '--', ...paths] : ['rm', '--cached', '--', ...paths])
      }
      return { state: await this.state(root) }
    }
    if (request.action === 'switch' || request.action === 'createBranch') {
      const branch = required(request.branch, '分支名称')
      if (branch.startsWith('-')) throw new Error('分支名称不能以 - 开头。')
      await this.git(root, ['check-ref-format', '--branch', branch])
      await this.git(root, ['switch', ...(request.action === 'createBranch' ? ['-c'] : []), branch])
      return { state: await this.state(root), notice: `已切换到 ${branch}` }
    }
    if (!state.branch) throw new Error('当前为 detached HEAD，请先创建或切换到功能分支。')
    if (['commit', 'commitPush', 'push', 'createPR'].includes(request.action) && state.protected) throw new Error('main / master 为保护分支，请先创建功能分支。')
    if (request.action === 'commit' || request.action === 'commitPush') {
      if (state.files.some(f => f.index === 'U' || f.worktree === 'U' || ['AA', 'DD'].includes(f.index + f.worktree))) throw new Error('请先解决合并冲突。')
      if (request.includeUnstaged) await this.git(root, ['add', '--all', '--', '.'])
      const staged = (await this.git(root, ['diff', '--cached', '--name-only', '-z'])).split('\0').filter(Boolean)
      if (!staged.length) throw new Error('没有已暂存的变更。')
      const message = request.message?.trim() || `更新 ${staged.length} 个文件：${staged.slice(0, 3).join('、')}`
      await this.git(root, ['commit', '--file=-'], message)
      if (request.action === 'commit') return { state: await this.state(root), notice: '提交成功' }
      try { await this.push(root, state.branch) }
      catch (error) { return { state: await this.state(root), notice: `提交已成功，推送失败：${(error as Error).message}。可直接重试“推送”。` } }
      return { state: await this.state(root), notice: '提交并推送成功' }
    }
    if (request.action === 'push') {
      await this.push(root, state.branch)
      return { state: await this.state(root), notice: '推送成功' }
    }
    if (request.action === 'prInfo' || request.action === 'createPR') {
      const origin = (await this.git(root, ['remote', 'get-url', 'origin'])).trim()
      const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+\/[^/\s]+?)(?:\.git)?$/.exec(origin)
      if (!match) throw new Error('创建 PR 需要 github.com 的 origin 远程仓库。')
      const repository = match[1]
      const info = JSON.parse(await this.run('gh', ['repo', 'view', repository, '--json', 'nameWithOwner,defaultBranchRef'], root))
      const prs = JSON.parse(await this.run('gh', ['pr', 'list', '--repo', repository, '--head', state.branch, '--state', 'open', '--json', 'number,title,url'], root))
      if (request.action === 'prInfo') return { pr: prs[0] ?? null, base: info.defaultBranchRef?.name ?? 'main' }
      if (prs.length) return { pr: prs[0], notice: '当前分支已有 Pull Request' }
      const base = required(request.base, '目标分支')
      await this.git(root, ['check-ref-format', '--branch', base])
      if (base === state.branch) throw new Error('目标分支不能与当前分支相同。')
      const remote = await this.git(root, ['ls-remote', '--heads', 'origin', `refs/heads/${state.branch}`])
      const head = (await this.git(root, ['rev-parse', 'HEAD'])).trim()
      if (remote.split(/\s/)[0] !== head) throw new Error('当前提交尚未推送到 origin，请先推送再创建 PR。')
      const title = required(request.title, 'PR 标题')
      const url = (await this.run('gh', ['pr', 'create', '--repo', repository, '--base', base, '--head', state.branch,
        '--title', title, '--body-file', '-', ...(request.draft ? ['--draft'] : [])], root, request.body ?? '')).trim()
      return { notice: 'Pull Request 创建成功', pr: { number: Number(url.split('/').at(-1)), title, url } }
    }
    throw new Error('未知操作。')
  }
  private push(root: string, branch: string) {
    return this.git(root, ['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`])
  }
}
