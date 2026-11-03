import { describe, expect, it } from 'vitest'
import { bookmarkList, prepareBookmark, sidebarLinks } from '../shared/quickLinks'

describe('bookmarks', () => {
  it('keeps the default links pinned in the sidebar', () => {
    expect(sidebarLinks(undefined).map((link) => link.name)).toEqual(['Apifox', 'Figma', 'TAPD', 'CNB'])
  })

  it('hides links that were unpinned', () => {
    const links = bookmarkList(undefined).map((link, index) => (index === 0 ? { ...link, pinned: false as const } : link))
    expect(sidebarLinks(links).map((link) => link.name)).toEqual(['Figma', 'TAPD', 'CNB'])
  })

  it('names a new link from the host and leaves it off the sidebar', () => {
    expect(prepareBookmark('', 'https://gitlab.example.com/group')).toEqual({
      name: 'gitlab.example.com',
      url: 'https://gitlab.example.com/group',
      pinned: false
    })
    expect(prepareBookmark('公司 CNB', 'https://cnb.example.com')).toMatchObject({ name: '公司 CNB', pinned: false })
  })

  it('rejects addresses the browser opener would refuse', () => {
    expect(prepareBookmark('本地', 'C:\\repo')).toEqual({ error: '只接受 http 或 https 链接' })
    expect(prepareBookmark('坏的', 'http://')).toEqual({ error: '这个网址无法识别' })
  })
})
