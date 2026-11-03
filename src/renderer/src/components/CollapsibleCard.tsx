import type { ReactNode } from 'react'
import { useUi } from '../stores/ui'

export function useCardOpen(storageKey: string, defaultOpen = true): boolean {
  const collapsed = useUi((s) => s.collapsedCards[storageKey])
  return collapsed === undefined ? defaultOpen : !collapsed
}

interface Props {
  storageKey: string
  title: string
  defaultOpen?: boolean
  badges?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export function CollapsibleCard({ storageKey, title, defaultOpen = true, badges, actions, children }: Props) {
  const open = useCardOpen(storageKey, defaultOpen)
  const toggleCard = useUi((s) => s.toggleCard)

  return (
    <section className={`card${open ? '' : ' card-collapsed'}`}>
      <div className="card-header">
        <button
          type="button"
          className="card-toggle"
          aria-expanded={open}
          title={open ? '点击收起' : '点击展开'}
          onClick={() => toggleCard(storageKey, defaultOpen)}
        >
          <span className="card-arrow">{open ? '▾' : '▸'}</span>
          <h2>{title}</h2>
        </button>
        {badges}
        {open && actions && <div className="card-header-actions">{actions}</div>}
      </div>
      {open && children}
    </section>
  )
}
