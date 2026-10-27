import { describe, expect, it } from 'vitest'
import { repoNameFromUrl, remoteWebUrl } from '../../shared/repoUrl'

describe('repoNameFromUrl', () => {
  it('reads https, ssh and scp addresses', () => {
    expect(repoNameFromUrl('https://github.com/acme/travel-admin.git')).toBe('travel-admin')
    expect(repoNameFromUrl('ssh://git@github.com:22/acme/travel-admin.git')).toBe('travel-admin')
    expect(repoNameFromUrl('git@github.com:acme/travel-admin.git')).toBe('travel-admin')
    expect(repoNameFromUrl('https://host/group/Name.git')).toBe('Name')
    expect(repoNameFromUrl('D:\\code\\travel-admin.git')).toBe('travel-admin')
  })

  it('rejects addresses it cannot name', () => {
    expect(repoNameFromUrl('not a url')).toBeNull()
    expect(repoNameFromUrl('https://github.com/')).toBeNull()
    expect(repoNameFromUrl('')).toBeNull()
  })
})

describe('remoteWebUrl', () => {
  it('turns https, scp and ssh remotes into a browser address', () => {
    expect(remoteWebUrl('https://cnb.jinbizhihui.com/jinbizhihui/duojing/lvcc-manage-admin.git')).toBe(
      'https://cnb.jinbizhihui.com/jinbizhihui/duojing/lvcc-manage-admin'
    )
    expect(remoteWebUrl('git@github.com:acme/travel-admin.git')).toBe('https://github.com/acme/travel-admin')
    expect(remoteWebUrl('ssh://git@github.com:22/acme/travel-admin.git')).toBe('https://github.com/acme/travel-admin')
  })

  it('returns null when there is no web address', () => {
    expect(remoteWebUrl('')).toBeNull()
    expect(remoteWebUrl('D:\\code\\travel-admin')).toBeNull()
  })
})
