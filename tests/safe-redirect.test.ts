import test from 'node:test'
import assert from 'node:assert/strict'
import { safeRedirectPath } from '../lib/safe-redirect'

test('login redirects preserve local destinations and reject browser-normalized external paths', () => {
  for (const path of ['/bookmarks', '/admin/pipeline?view=all#settings', '/news/100%25']) {
    assert.equal(safeRedirectPath(path), path)
  }
  for (const path of ['', 'https://example.invalid', '//example.invalid', '/\\example.invalid', '/\t/example.invalid', '/\n/example.invalid', 'javascript:alert(1)']) {
    assert.equal(safeRedirectPath(path), '/')
  }
})
