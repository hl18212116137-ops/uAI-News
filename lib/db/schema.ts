import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'

// ─── users ───────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── sources ─────────────────────────────────────────────────────────────────
export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: text('source_type').notNull().default('blogger'),
  platform: text('platform').notNull().default('X'),
  handle: text('handle').notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  avatar: text('avatar'),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(true),
  /** 侧栏「推荐关注」候选池；与 enabled 独立，默认不参与全站抓取 */
  inRecommendationPool: boolean('in_recommendation_pool').notNull().default(false),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
  fetchConfig: jsonb('fetch_config'),
})

// ─── news_items ──────────────────────────────────────────────────────────────
export const newsItems = pgTable('news_items', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  summary: text('summary').notNull().default(''),
  content: text('content').notNull().default(''),
  sourcePlatform: text('source_platform'),
  sourceName: text('source_name'),
  sourceHandle: text('source_handle'),
  sourceUrl: text('source_url'),
  category: text('category'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  originalText: text('original_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  importanceScore: integer('importance_score'),
  mediaUrls: jsonb('media_urls'),
  socialEngagement: jsonb('social_engagement'),
  referencedPost: jsonb('referenced_post'),
  rawPostId: text('raw_post_id'),
  processingStatus: text('processing_status'),
  insightJson: jsonb('insight_json'),
})

// ─── raw_posts ───────────────────────────────────────────────────────────────
export const rawPosts = pgTable('raw_posts', {
  id: text('id').primaryKey(),
  url: text('url'),
  author: text('author'),
  content: text('content'),
  title: text('title'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sourceId: uuid('source_id'),
  contentHash: text('content_hash'),
  status: text('status').notNull().default('new'),
  errorMessage: text('error_message'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  mediaUrls: jsonb('media_urls'),
  socialEngagement: jsonb('social_engagement'),
  referencedPost: jsonb('referenced_post'),
})

// ─── user_source_subscriptions ───────────────────────────────────────────────
export const userSourceSubscriptions = pgTable('user_source_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  sourceId: uuid('source_id').notNull(),
  sourceHandle: text('source_handle'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── user_bookmarks ──────────────────────────────────────────────────────────
export const userBookmarks = pgTable('user_bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  newsItemId: text('news_item_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── site_pipeline_settings ──────────────────────────────────────────────────
export const sitePipelineSettings = pgTable('site_pipeline_settings', {
  id: text('id').primaryKey().default('default'),
  rawMinOuterChars: integer('raw_min_outer_chars'),
  rawMinNestedCharsRetweet: integer('raw_min_nested_chars_retweet'),
  ingestDedupeRssBlogMatchNewsUrl: boolean('ingest_dedupe_rss_blog_match_news_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── user_pipeline_rules ─────────────────────────────────────────────────────
export const userPipelineRules = pgTable('user_pipeline_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  module: text('module').notNull(),
  ruleType: text('rule_type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── processing_jobs ─────────────────────────────────────────────────────────
export const processingJobs = pgTable('processing_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  rawPostId: text('raw_post_id'),
  newsItemId: text('news_item_id'),
  jobType: text('job_type').notNull().default('full_pipeline'),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: text('locked_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
