import { describe, expect, it } from 'vitest'
import { repoNameFromUrl } from '../../shared/repoUrl'

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
