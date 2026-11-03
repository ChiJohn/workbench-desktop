import { useState } from 'react'
import { bookmarkList, prepareBookmark } from '../../../shared/quickLinks'
import type { QuickLink } from '../../../shared/types'
import { api, unwrap } from '../api'
import { useSavePrefs } from '../queries'
import { toast } from '../stores/toast'

export function BookmarksPage({ links }: { links?: QuickLink[] }) {
  const save = useSavePrefs()
  const list = bookmarkList(links)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const write = (next: QuickLink[]) => {
    save.mutate(
      { quickLinks: next },
      {
        onSuccess: () => {
          setName('')
          setUrl('')
        }
      }
    )
  }

  const add = () => {
    const prepared = prepareBookmark(name, url)
    if ('error' in prepared) {
      toast.error(new Error(prepared.error), '无法收藏')
      return
    }
    if (list.some((link) => link.url === prepared.url)) {
      toast.error(new Error('这个网址已经在收藏里'), '无法收藏')
      return
    }
    write([...list, prepared])
  }

  const open = async (href: string) => {
    try {
      await unwrap(api.app.openExternal(href))
    } catch (error) {
      toast.error(error, '打开失败')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>收藏</h1>
        <span className="hint">{list.length} 个链接。钉住的会出现在侧栏。</span>
      </div>
      <form
        className="bookmark-add"
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <input placeholder="名称，可留空" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="mono" placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={save.isPending || !url.trim()}>
          添加
        </button>
      </form>
      {list.length === 0 ? (
        <p className="hint">还没有收藏。上面填一个工具网站即可。</p>
      ) : (
        <div className="bookmark-list">
          {list.map((link) => (
            <div key={link.url} className="bookmark-row">
              <button className="bookmark-open" type="button" title={link.url} onClick={() => void open(link.url)}>
                <span className="strong">{link.name}</span>
                <span className="muted mono ellipsis">{link.url}</span>
              </button>
              <button
                className={`btn btn-small${link.pinned === false ? '' : ' bookmark-pinned'}`}
                type="button"
                onClick={() => write(list.map((item) => (item.url === link.url ? { ...item, pinned: item.pinned === false } : item)))}
              >
                {link.pinned === false ? '钉在侧栏' : '已钉住'}
              </button>
              <button className="btn btn-small" type="button" onClick={() => write(list.filter((item) => item.url !== link.url))}>
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
