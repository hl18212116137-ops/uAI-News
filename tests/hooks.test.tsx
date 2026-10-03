import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import React, { useState } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { useInsightPanel } from '../hooks/useInsightPanel'
import { useLongformFeed, LONGFORM_CATEGORY } from '../hooks/useLongformFeed'
import { useFeedPagination } from '../hooks/useFeedPagination'
import { useModalFocus } from '../hooks/useModalFocus'
import { post, response } from './fixtures'
import type { NewsItem } from '../lib/types'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
const originalFetch = globalThis.fetch
async function render(element: React.ReactElement) {
  const container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root!.render(element) })
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined; document.body.replaceChildren(); globalThis.fetch = originalFetch
})
const initial = [post('one')]
const noOp = () => {}

test('insight retry actually issues another request after a failed response', async () => {
  let calls = 0
  globalThis.fetch = async () => ++calls === 1
    ? response({ success: false, error: 'temporary' }, 503)
    : response({ success: true, analysis: { review: ['已重新生成'] } })
  let api!: ReturnType<typeof useInsightPanel>
  function Harness() { api = useInsightPanel(initial, noOp); return null }
  await render(<Harness />)
  await act(async () => api.handleAnalysisToggle('one'))
  assert.equal(calls, 1); assert.equal(api.analysisErrorByPost.one, 'temporary')
  await act(async () => api.retryInsightAnalysis())
  assert.equal(calls, 2); assert.deepEqual(api.analysisCache.one.review, ['已重新生成'])
})

test('closing insight aborts the old request and ignores its late result', async () => {
  let signal: AbortSignal | undefined
  let resolve!: (value: Response) => void
  globalThis.fetch = async (_url, init) => { signal = init?.signal as AbortSignal; return new Promise((done) => { resolve = done }) }
  let api!: ReturnType<typeof useInsightPanel>
  function Harness() { api = useInsightPanel(initial, noOp); return null }
  await render(<Harness />)
  await act(async () => api.handleAnalysisToggle('one'))
  await act(async () => api.closeAnalysisSession())
  assert.equal(signal?.aborted, true)
  await act(async () => resolve(response({ success: true, analysis: { review: ['stale'] } })))
  assert.equal(api.analysisCache.one, undefined)
})

test('longform failure stops automatic retries; manual retry can recover', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return response({ success: false, error: 'offline' }, 503) }
  let api!: ReturnType<typeof useLongformFeed>
  const empty: NewsItem[] = []
  function Harness() {
    const [, setPosts] = useState(empty)
    api = useLongformFeed({ setPosts, activeCategory: LONGFORM_CATEGORY, revealLongform: noOp, notify: noOp })
    return null
  }
  await render(<Harness />)
  await act(async () => { await new Promise((done) => setTimeout(done, 30)) })
  assert.equal(calls, 1); assert.equal(api.longformError, 'offline')
  globalThis.fetch = async () => { calls++; return response({ success: true, posts: [] }) }
  await act(async () => api.loadLongformPosts())
  assert.equal(calls, 2); assert.equal(api.longformError, '')
})

test('longform pagination follows server offsets and keeps already loaded articles', async () => {
  const offsets: string[] = []
  globalThis.fetch = async (url) => {
    const offset = new URL(String(url), 'http://localhost').searchParams.get('offset')!
    offsets.push(offset)
    return response({ success: true, posts: [post(`long-${offset}`)], total: 13, nextOffset: offset === '0' ? 12 : 13, hasMore: offset === '0' })
  }
  let api!: ReturnType<typeof useLongformFeed>
  let items: NewsItem[] = []
  function Harness() {
    const [posts, setPosts] = useState(initial); items = posts
    api = useLongformFeed({ setPosts, activeCategory: LONGFORM_CATEGORY, revealLongform: noOp, notify: noOp })
    return null
  }
  await render(<Harness />)
  assert.equal(api.longformHasMore, true)
  await act(async () => api.loadMoreLongformPosts())
  assert.deepEqual(offsets, ['0', '12'])
  assert.equal(api.longformHasMore, false)
  assert.equal(api.longformTotal, 13)
  assert.deepEqual(new Set(items.map((item) => item.id)), new Set(['one', 'long-0', 'long-12']))
})

test('extracting the first longform also loads the existing paginated library', async () => {
  const extracted = { ...post('extracted'), longform: { translatedContent: 'Full extracted article', isPreview: false } } as NewsItem
  const calls: string[] = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return String(url).endsWith('/from-post')
      ? response({ success: true, post: extracted })
      : response({ success: true, posts: [post('existing')], total: 13, nextOffset: 12, hasMore: true })
  }
  let api!: ReturnType<typeof useLongformFeed>
  let items: NewsItem[] = []
  function Harness() {
    const [posts, setPosts] = useState(initial); items = posts
    const [activeCategory, setCategory] = useState('全部')
    api = useLongformFeed({ setPosts, activeCategory, revealLongform: () => setCategory(LONGFORM_CATEGORY), notify: noOp })
    return null
  }
  await render(<Harness />)
  await act(async () => api.handleLongformExtractFromPost(initial[0]))
  assert.deepEqual(calls, ['/api/longform/from-post', '/api/longform/posts?offset=0&limit=12'])
  assert.equal(api.longformHasMore, true)
  assert.equal(items.find((item) => item.id === 'extracted')?.longform?.translatedContent, 'Full extracted article')
  assert.ok(items.some((item) => item.id === 'existing'))
})

test('filtered paging starts from zero and advances by server offsets even with duplicate rows', async () => {
  const offsets: string[] = []
  globalThis.fetch = async (url) => {
    const offset = new URL(String(url), 'http://localhost').searchParams.get('offset')!
    offsets.push(offset)
    return response({ success: true, posts: initial, total: 3, nextOffset: Number(offset) + 2, hasMore: offsets.length === 1 })
  }
  let api!: ReturnType<typeof useFeedPagination>
  function Harness() {
    const [posts, setPosts] = useState(initial)
    api = useFeedPagination({ initialPosts: initial, initialPage: { nextOffset: 12, total: 30, hasMore: true }, posts, setPosts,
      filters: { category: '研究' }, filteredPosts: posts, pageSize: 12, enabled: true,
      prioritizeRecentlyFetched: () => false, onPostsLoaded: noOp })
    return null
  }
  await render(<Harness />)
  await act(async () => api.handleLoadMoreFeed())
  await act(async () => api.handleLoadMoreFeed())
  assert.deepEqual(offsets, ['0', '2'])
  assert.equal(api.canShowLoadMoreFeed, false)
})

test('a changed filter cancels pending paging and cannot append obsolete data', async () => {
  let signal: AbortSignal | undefined
  let resolve!: (value: Response) => void
  globalThis.fetch = async (_url, init) => { signal = init?.signal as AbortSignal; return new Promise((done) => { resolve = done }) }
  let api!: ReturnType<typeof useFeedPagination>
  let changeFilter!: (value: string) => void
  let items: NewsItem[] = []
  function Harness() {
    const [category, setCategory] = useState('研究'); changeFilter = setCategory
    const [posts, setPosts] = useState(initial); items = posts
    api = useFeedPagination({ initialPosts: initial, initialPage: { nextOffset: 1, total: 3, hasMore: true }, posts, setPosts,
      filters: { category }, filteredPosts: posts, pageSize: 12, enabled: true,
      prioritizeRecentlyFetched: () => false, onPostsLoaded: noOp })
    return null
  }
  await render(<Harness />)
  let pending!: Promise<void>
  await act(async () => { pending = api.handleLoadMoreFeed() })
  await act(async () => changeFilter('政策'))
  assert.equal(signal?.aborted, true)
  await act(async () => { resolve(response({ success: true, posts: [post('stale')], nextOffset: 2, total: 3, hasMore: true })); await pending })
  assert.deepEqual(items.map((item) => item.id), ['one'])
  assert.equal(api.isLoadingMoreFeed, false)
})

test('server full-text matches are retained when card previews omit the query', async () => {
  globalThis.fetch = async () => response({ success: true, posts: [post('matched')], nextOffset: 1, total: 1, hasMore: false })
  let api!: ReturnType<typeof useFeedPagination>
  function Harness() {
    const [posts, setPosts] = useState(initial)
    api = useFeedPagination({ initialPosts: initial, initialPage: { nextOffset: 1, total: 3, hasMore: true }, posts, setPosts,
      filters: { searchQuery: 'text outside preview' }, filteredPosts: [], pageSize: 12, enabled: true,
      prioritizeRecentlyFetched: () => false, onPostsLoaded: noOp })
    return null
  }
  await render(<Harness />)
  await act(async () => api.handleLoadMoreFeed())
  assert.equal(api.matchedPostIds?.has('matched'), true)
  assert.equal(api.loadMoreStatusText, '已显示 1 / 1')
})

test('modal focus traps Tab, closes on Escape and restores the trigger and scroll', async () => {
  const originalRects = dom.window.HTMLElement.prototype.getClientRects
  dom.window.HTMLElement.prototype.getClientRects = () => [{ width: 1 }] as unknown as DOMRectList
  const trigger = document.createElement('button'); document.body.appendChild(trigger); trigger.focus()
  function Harness() {
    const [open, setOpen] = useState(true)
    const ref = useModalFocus(open, () => setOpen(false), false)
    return open ? <div ref={ref} tabIndex={-1}><button id="first">First</button><button id="last">Last</button></div> : null
  }
  try {
    await render(<Harness />)
    assert.equal(document.activeElement?.id, 'first'); assert.equal(document.body.style.overflow, 'hidden')
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })) })
    assert.equal(document.activeElement?.id, 'last')
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })) })
    assert.equal(document.activeElement?.id, 'first')
    trigger.focus(); assert.equal(document.activeElement?.id, 'first')
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    assert.equal(document.activeElement, trigger); assert.equal(document.body.style.overflow, '')
  } finally { dom.window.HTMLElement.prototype.getClientRects = originalRects }
})

test('nested modal Escape affects only the top dialog and respects pending work', async () => {
  const originalRects = dom.window.HTMLElement.prototype.getClientRects
  dom.window.HTMLElement.prototype.getClientRects = () => [{ width: 1 }] as unknown as DOMRectList
  let outerCloses = 0; let innerCloses = 0
  let setInnerOpen!: (open: boolean) => void
  let setBusy!: (busy: boolean) => void
  function Inner() {
    const [open, updateOpen] = useState(false); setInnerOpen = updateOpen
    const [busy, updateBusy] = useState(false); setBusy = updateBusy
    const ref = useModalFocus(open, () => { innerCloses++; updateOpen(false) }, busy)
    return open ? <div ref={ref} tabIndex={-1}><button id="inner">Inner</button></div> : null
  }
  function Outer() {
    const ref = useModalFocus(true, () => { outerCloses++ }, false)
    return <><div ref={ref} tabIndex={-1}><button id="outer">Outer</button></div><Inner /></>
  }
  const escape = () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  try {
    await render(<Outer />)
    await act(async () => setInnerOpen(true))
    assert.equal(document.activeElement?.id, 'inner')
    await act(async () => setBusy(true))
    await act(async () => { escape() }); assert.equal(innerCloses, 0); assert.equal(outerCloses, 0)
    await act(async () => setBusy(false))
    await act(async () => { escape() }); assert.equal(innerCloses, 1); assert.equal(outerCloses, 0)
    assert.equal(document.activeElement?.id, 'outer'); assert.equal(document.body.style.overflow, 'hidden')
    await act(async () => { escape() }); assert.equal(outerCloses, 1)
  } finally { dom.window.HTMLElement.prototype.getClientRects = originalRects }
})
