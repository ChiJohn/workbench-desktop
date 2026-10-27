import { useCallback, useEffect, useRef, useState } from 'react'
import type { Prefs } from '../../../shared/types'
import { api, unwrap } from '../api'
import { toast } from '../stores/toast'
import { useFabDrag } from '../useFabDrag'
import { TodoPanel } from './TodoPanel'

const SAVE_DELAY = 1500

export function StickyNote({ prefs }: { prefs?: Prefs }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'note' | 'todo'>('note')
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const content = await unwrap(api.stickyNote.read())
    setText(content)
    setDirty(false)
  }, [])

  useEffect(() => {
    if (!open || tab !== 'note') return
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [open, tab, load])

  const save = useCallback(async (value: string) => {
    await unwrap(api.stickyNote.write(value))
    setDirty(false)
  }, [])

  const onChange = (value: string) => {
    setText(value)
    setDirty(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(value), SAVE_DELAY)
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-mask')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const drag = useFabDrag('wb.fab.sticky', open, tab)

  const openInObsidian = async () => {
    const file = tab === 'todo' ? '待办.md' : '便利贴.md'
    try {
      await unwrap(api.tapd.openCard(file))
    } catch (e) {
      toast.error(e, '打开失败')
    }
  }

  return (
    <>
      <button
        ref={drag.fabRef}
        className={`sticky-fab${drag.dragging ? ' dragging' : ''}`}
        style={drag.fabStyle}
        title="便利贴，按住可拖动"
        onPointerDown={drag.onPointerDown}
        onClick={(event) => {
          drag.onClick(event)
          if (!event.defaultPrevented) setOpen(!open)
        }}
      >
        <span className="sticky-fab-icon">✎</span>
      </button>
      {open && (
        <div ref={drag.setPanel} className={`sticky-panel${tab === 'todo' ? ' todo' : ''}`} style={drag.panelStyle}>
          <div className="sticky-head">
            <div className="sticky-tabs">
              <button className={tab === 'note' ? 'on' : ''} onClick={() => setTab('note')}>
                便利贴
              </button>
              <button className={tab === 'todo' ? 'on' : ''} onClick={() => setTab('todo')}>
                待办
              </button>
            </div>
            <button className="btn btn-small btn-ghost" onClick={() => void openInObsidian()}>
              在 Obsidian 打开
            </button>
          </div>
          {tab === 'note' ? (
            <>
              <textarea className="sticky-input" value={text} onChange={(e) => onChange(e.target.value)} placeholder="随手记…" />
              <div className="sticky-foot">
                <span className="hint">{dirty ? '未保存' : '已保存'}</span>
              </div>
            </>
          ) : (
            <TodoPanel prefs={prefs} />
          )}
        </div>
      )}
    </>
  )
}
