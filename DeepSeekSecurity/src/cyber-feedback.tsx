import { Component, type ReactNode } from 'react'

export function CyberLoading({ label = '正在读取安全工作台…' }: { label?: string }) {
  return <div className="cy-loading" role="status" aria-live="polite" aria-busy="true"><span className="cy-spinner" aria-hidden="true" /><span>{label}</span></div>
}

/** 在 DSH 槽位接管错误前保留可见反馈。 Keep failures visible before the outer slot abdicates. */
export class CyberBoundary extends Component<{ children: ReactNode; onBack: () => void }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 }
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error : new Error(String(error)) } }
  componentDidCatch(error: Error) { console.error('DeepSeek Security Cyber render failed:', error) }
  render() {
    if (this.state.error) return <section className="cy-app cy-welcome" role="alert"><h1>Cyber 无法显示</h1><p className="cy-render-error">{this.state.error.message}</p><div className="cy-recovery-actions"><button onClick={() => this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }))}>重试加载</button><button onClick={this.props.onBack}>返回聊天</button></div></section>
    return <div className="cy-entry" key={this.state.attempt}>{this.props.children}</div>
  }
}
