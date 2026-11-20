import { useEffect, useRef, useState } from 'react'
import type { KnowledgeSearchGroup } from '../../../shared/types'
import { api, unwrap } from '../api'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'

function openNote(path: string) {
  void unwrap(api.tapd.openCard(path)).catch((e) => toast.error(e, '打开失败'))
}

export function VaultSearchDialog() {
  const open = useUi((s) => s.vaultSearchOpen)
  const setOpen = useUi((s) => s.setVaultSearchOpen)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<KnowledgeSearchGroup[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  useEffect(() => api.on.vaultSearchOpen(() => setOpen(true)), [setOpen])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setGroups(null)
    setActive(0)
    const focus = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(focus)
  }, [open])

  useEffect(() => {
    if (!open) return
    const text = query.trim()
    if (!text) {
      setGroups(null)
      setSearching(false)
      return
    }
    const id = ++seq.current
    setSearching(true)
    const timer = window.setTimeout(() => {
      unwrap(api.knowledge.search(text))
        .then((found) => {
          if (seq.current !== id) return
          setGroups(found)
          setActive(0)
        })
        .catch((e) => {
          if (seq.current !== id) return
          setGroups([])
          toast.error(e, '搜索失败')
        })
        .finally(() => {
          if (seq.current === id) setSearching(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [open, query])

  if (!open) return null

  const choose = (index: number) => {
    const file = groups?.[index]?.file
    if (!file) return
    openNote(file)
    setOpen(false)
  }

  return (
    <div className="modal-mask" onMouseDown={() => setOpen(false)}>
      <div className="modal vault-search" role="dialog" aria-label="Vault 搜索" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Vault 搜索</h2>
        <input
          ref={inputRef}
          value={query}
          placeholder="关键词，用空格分开"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min((groups?.length ?? 1) - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(active)
            }
          }}
        />
        <div className="vault-search-list">
          {searching && <p className="hint">搜索中…</p>}
          {!searching && groups && groups.length === 0 && <p className="hint">没有结果</p>}
          {groups?.map((group, index) => (
            <button
              key={group.file}
              type="button"
              className={`vault-search-hit${index === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span className="strong">{group.file}</span>
              {group.snippets[0] && <span className="hint">{group.snippets[0]}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
