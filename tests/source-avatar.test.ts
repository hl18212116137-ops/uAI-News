import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import snapshots from '../data/source-avatars.json'
import { defaultAvatarUrlForHandle, resolveSourceAvatarUrl } from '../lib/source-avatar'

test('bundled avatars replace their CDN URLs and remain available without profile data', () => {
  for (const [handle, snapshot] of Object.entries(snapshots)) {
    assert.equal(resolveSourceAvatarUrl(handle, snapshot.source, 'X'), snapshot.path)
    assert.equal(defaultAvatarUrlForHandle(`@${handle.toUpperCase()}`), snapshot.path)
    assert.equal(resolveSourceAvatarUrl(handle, undefined, 'X'), snapshot.path)
    const bytes = readFileSync(new URL(`../public${snapshot.path}`, import.meta.url))
    assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8')
  }
})

test('new profile URLs take precedence and unknown accounts retain generated placeholders', () => {
  const latest = 'https://pbs.twimg.com/profile_images/new/avatar.jpg'
  assert.equal(resolveSourceAvatarUrl('JeffDean', latest, 'X'), latest)
  assert.equal(defaultAvatarUrlForHandle('unknown-account'), '/api/source-avatar/unknown-account')
  assert.equal(resolveSourceAvatarUrl('unknown-account', undefined, 'RSS'), '')
})
