import { NextRequest, NextResponse } from 'next/server';
import {
  getSources,
  addSource,
  deleteSource,
  updateSource,
  getSourceById,
  extractSourceFromUrl,
  Source,
} from '@/lib/sources';
import { fetchPostsFromX } from '@/lib/x';
import { addPost, deletePostsByHandle } from '@/lib/db';
import { getDefaultAIService } from '@/lib/ai/ai-factory';
import { NewsCategory } from '@/lib/types';
import { taskManager } from '@/lib/task-manager';
import { requireAuth } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { subscribeSource } from '@/lib/subscriptions';

/**
 * GET /api/sources
 * 获取所有源列表
 */
export async function GET() {
  try {
    const sources = await getSources();
    return NextResponse.json({ success: true, sources });
  } catch (error: any) {
    console.error('Failed to get sources:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取源列表失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sources
 * 添加新源（从URL提取博主信息）—— 允许未登录用户添加
 */
export async function POST(request: NextRequest) {
  // 可选鉴权：获取当前用户（可能为 null）
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: '请提供有效的URL' },
        { status: 400 }
      );
    }

    // 从URL提取源信息
    const sourceData = await extractSourceFromUrl(url);

    // 创建完整的Source对象
    const source: Source = {
      id: sourceData.id!,
      sourceType: sourceData.sourceType!,  // 新增：源类型
      platform: sourceData.platform!,
      handle: sourceData.handle!,
      name: sourceData.name!,
      url: sourceData.url!,
      avatar: sourceData.avatar,
      description: sourceData.description,
      enabled: sourceData.enabled!,
      addedAt: sourceData.addedAt!,
      fetchConfig: sourceData.fetchConfig,
    };

    // 添加到列表
    await addSource(source);

    // 如果已登录，创建订阅关系
    if (user) {
      await subscribeSource(user.id, source.id, source.handle);
    }

    // 创建任务
    const taskId = taskManager.createTask();
    taskManager.updateTask(taskId, {
      status: 'running',
      progress: 0,
      message: `正在抓取 @${source.handle} 的推文...`,
      startTime: Date.now(),
      estimatedDuration: 120, // 预估 2 分钟
      remainingTime: 120,
    });

    // 异步抓取推文（不阻塞响应）
    fetchAndProcessPostsInBackground(source, taskId).catch(error => {
      console.error(`[后台任务] 抓取 @${source.handle} 失败:`, error);
      taskManager.updateTask(taskId, {
        status: 'failed',
        error: error.message,
      });
    });

    // 立即返回 taskId
    return NextResponse.json({
      success: true,
      message: `已添加博主 @${source.handle}`,
      source,
      taskId, // 前端可以轮询任务状态
      isLoggedIn: !!user,
    });
  } catch (error: any) {
    console.error('Failed to add source:', error);
    return NextResponse.json(
      { success: false, error: error.message || '添加源失败' },
      { status: 400 }
    );
  }
}

/**
 * 后台抓取并处理推文
 */
async function fetchAndProcessPostsInBackground(source: Source, taskId: string) {
  try {
    console.log(`[后台任务] 开始抓取 @${source.handle} 的推文...`);

    // 更新状态：正在抓取
    taskManager.updateTask(taskId, {
      progress: 10,
      message: `正在抓取 @${source.handle} 的推文...`,
    });

    const posts = await fetchPostsFromX(source.handle);

    if (posts.length === 0) {
      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: `@${source.handle} 没有找到推文`,
      });
      return;
    }

    // 更新状态：开始处理
    taskManager.updateTask(taskId, {
      progress: 30,
      message: `找到 ${posts.length} 条推文，正在处理...`,
    });

    const aiService = getDefaultAIService();
    let successCount = 0;
    let processedCount = 0;

    // 并发处理推文（限制并发数为5）
    const CONCURRENCY = 5;

    for (let i = 0; i < posts.length; i += CONCURRENCY) {
      const batch = posts.slice(i, i + CONCURRENCY);

      // 并发处理这一批推文
      const results = await Promise.allSettled(
        batch.map(async (post) => {
          try {
            // 使用 AI 处理推文
            const aiResult = await aiService.processNews(
              post.post_text,
              source.name,
              source.handle
            );

            // 翻译内容为中文
            const translatedContent = await aiService.translateContent(post.post_text);

            // AI 评分：评估新闻的重要性
            let importanceScore = 50; // 默认中等分数
            try {
              importanceScore = await aiService.scoreNewsImportance({
                title: aiResult.title,
                summary: aiResult.summary,
                content: translatedContent,
                category: aiResult.category,
                authorName: source.name,
                authorHandle: source.handle,
                publishedAt: post.posted_at,
              });
              console.log(`[AI Score] @${source.handle} post ${post.post_id}: ${importanceScore}`);
            } catch (scoreError) {
              console.error(`[AI Score] Failed for post ${post.post_id}:`, scoreError);
              // 使用默认值 50
            }

            // 保存到数据库
            await addPost({
              id: `x-${post.post_id}`,
              title: aiResult.title,
              summary: aiResult.summary,
              content: translatedContent,
              source: {
                platform: 'X',
                name: source.name,
                handle: source.handle,
                url: post.post_url,
              },
              category: aiResult.category,
              publishedAt: post.posted_at,
              originalText: post.post_text,
              createdAt: new Date().toISOString(),
              importanceScore, // 添加重要性评分
            });

            return { success: true, postId: post.post_id };
          } catch (error) {
            console.error(`[后台任务] 处理推文 ${post.post_id} 失败:`, error);
            return { success: false, postId: post.post_id, error };
          }
        })
      );

      // 统计成功数量
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        }
      });

      // 更新进度（30% - 100%）
      processedCount += batch.length;
      const progress = 30 + Math.floor((processedCount / posts.length) * 70);
      taskManager.updateTask(taskId, {
        progress,
        message: `正在处理推文 ${processedCount}/${posts.length}...`,
      });
    }

    // 完成
    taskManager.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: `成功处理 ${successCount}/${posts.length} 条推文`,
    });

    console.log(`[后台任务] 完成: @${source.handle}, 成功 ${successCount}/${posts.length} 条`);
  } catch (error) {
    console.error(`[后台任务] 抓取 @${source.handle} 失败:`, error);
    taskManager.updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}

/**
 * DELETE /api/sources?id=xxx
 * 删除源 —— 需要登录
 */
export async function DELETE(request: NextRequest) {
  // 鉴权：未登录返回 401
  const { errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: '请提供源ID' },
        { status: 400 }
      );
    }

    const source = await getSourceById(id);
    if (!source) {
      return NextResponse.json(
        { success: false, error: '源不存在' },
        { status: 400 }
      );
    }

    const deletedPostsCount = await deletePostsByHandle(source.handle);
    await deleteSource(id);

    return NextResponse.json({
      success: true,
      message: deletedPostsCount > 0
        ? `删除成功，同时删除了 ${deletedPostsCount} 条相关推文`
        : '删除成功',
      deletedPostsCount,
    });
  } catch (error: any) {
    console.error('Failed to delete source:', error);
    return NextResponse.json(
      { success: false, error: error.message || '删除源失败' },
      { status: 400 }
    );
  }
}

/**
 * PATCH /api/sources
 * 更新源（如启用/禁用）—— 需要登录
 */
export async function PATCH(request: NextRequest) {
  // 鉴权：未登录返回 401
  const { errorResponse } = await requireAuth();
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { id, updates } = body;

    if (!id || !updates) {
      return NextResponse.json(
        { success: false, error: '请提供源ID和更新内容' },
        { status: 400 }
      );
    }

    await updateSource(id, updates);

    return NextResponse.json({
      success: true,
      message: '更新成功',
    });
  } catch (error: any) {
    console.error('Failed to update source:', error);
    return NextResponse.json(
      { success: false, error: error.message || '更新源失败' },
      { status: 400 }
    );
  }
}
