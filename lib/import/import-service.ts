import { normalizeUrl, unifyXUrl } from './url-normalizer';
import { detectPlatform } from './platform-detector';
import { XParser } from './parsers/x-parser';
import { checkDuplication } from './deduplication';
import { addPost } from '../db';
import {
  enqueueFullPipelineJobsForRawIds,
  hasPendingOrProcessingJobForRawPostId,
} from '@/lib/db/processing-jobs';
import { upsertRawPosts } from '@/lib/db/raw-posts';
import { isProcessingJobsPipelineEnabled } from '@/lib/processing-jobs-pipeline';
import { NewsItem, NewsCategory } from '../types';
import { ImportResult, ParsedContent } from './types';
import { getDefaultAIService } from '../ai/ai-factory';
import { composeTextForAiProcessing } from '@/lib/x';

/**
 * 统一导入服务
 * 负责协调整个导入流程
 */

/**
 * 从 URL 导入内容
 * @param rawUrl 原始 URL
 * @returns Promise<ImportResult> 导入结果
 */
export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
  try {
    // 步骤 1: URL 规范化
    const normalizedResult = normalizeUrl(rawUrl);

    if (!normalizedResult.isValid) {
      return {
        success: false,
        message: normalizedResult.error || '无效的 URL',
        error: normalizedResult.error,
      };
    }

    // 统一 X / Twitter URL
    const unifiedUrl = unifyXUrl(normalizedResult.normalized);

    // 步骤 2: 平台识别
    const platformInfo = detectPlatform(unifiedUrl);

    if (!platformInfo.isSupported) {
      return {
        success: false,
        message: platformInfo.error || '不支持的平台',
        error: platformInfo.error,
      };
    }

    if (!platformInfo.externalId) {
      return {
        success: false,
        message: '无法从 URL 中提取内容 ID',
        error: '无法从 URL 中提取内容 ID',
      };
    }

    // 步骤 3: 去重检查
    const duplicationCheck = await checkDuplication(
      unifiedUrl,
      platformInfo.externalId,
      platformInfo.platform
    );

    if (duplicationCheck.isDuplicate) {
      return {
        success: true,
        message: duplicationCheck.reason || '内容已存在',
        isDuplicate: true,
        postId: duplicationCheck.existingPost?.id,
      };
    }

    if (isProcessingJobsPipelineEnabled()) {
      const pipelineId = newsIdFromPlatformAndExternal(
        platformInfo.platform,
        platformInfo.externalId
      );
      if (await hasPendingOrProcessingJobForRawPostId(pipelineId)) {
        return {
          success: true,
          message: '该内容正在处理队列中，请稍后刷新列表',
          isDuplicate: true,
          postId: pipelineId,
          rawPostId: pipelineId,
          queued: true,
        };
      }
    }

    // 步骤 4: 调用平台解析器
    const parsedContent = await parseContent(
      platformInfo.platform,
      unifiedUrl,
      platformInfo.externalId
    );

    if (isProcessingJobsPipelineEnabled()) {
      const id = newsIdFromParsed(parsedContent);
      const handle = parsedContent.author.handle || parsedContent.author.name || '';
      await upsertRawPosts([
        {
          id,
          platform: 'X',
          handle,
          author_name: parsedContent.author.name,
          text: parsedContent.content,
          url: parsedContent.url,
          published_at: parsedContent.publishedAt,
          fetched_at: new Date().toISOString(),
          ...(parsedContent.referencedPost
            ? { referenced_post: parsedContent.referencedPost }
            : {}),
        },
      ]);
      await enqueueFullPipelineJobsForRawIds([id]);
      return {
        success: true,
        message:
          '已加入处理队列，完成后将出现在列表中（可手动刷新或等待定时处理）',
        queued: true,
        rawPostId: id,
        postId: id,
        isDuplicate: false,
      };
    }

    // 步骤 5: 转换为统一数据结构（使用AI处理）
    const newsItem = await convertToNewsItem(parsedContent);

    // 步骤 6: 写入存储
    await addPost(newsItem);

    return {
      success: true,
      message: '导入成功',
      postId: newsItem.id,
      isDuplicate: false,
    };
  } catch (error: any) {
    console.error('[Import Service] 导入失败:', error);
    return {
      success: false,
      message: '导入失败',
      error: error.message || '未知错误',
    };
  }
}

/** 与 convertToNewsItem / process 流水线中的 news id 对齐 */
function newsIdFromPlatformAndExternal(platform: string, externalId: string): string {
  const base = `${platform.toLowerCase()}-${externalId}`;
  return base.replace(/^x_/, 'x-');
}

function newsIdFromParsed(parsed: ParsedContent): string {
  return newsIdFromPlatformAndExternal(parsed.platform, parsed.externalId);
}

/**
 * 调用对应平台的解析器
 * @param platform 平台类型
 * @param url URL
 * @param externalId 外部 ID
 * @returns Promise<ParsedContent> 解析后的内容
 */
async function parseContent(
  platform: string,
  url: string,
  externalId: string
): Promise<ParsedContent> {
  // 根据平台类型选择解析器
  switch (platform) {
    case 'X':
      const xParser = new XParser();
      return await xParser.parse(url, externalId);

    // 未来可以在这里添加其他平台的解析器
    // case 'YouTube':
    //   const youtubeParser = new YouTubeParser();
    //   return await youtubeParser.parse(url, externalId);

    default:
      throw new Error(`不支持的平台: ${platform}`);
  }
}

/**
 * 将解析后的内容转换为 NewsItem 格式
 * 使用 AI 生成中文标题、摘要和分类
 * @param parsed 解析后的内容
 * @returns NewsItem
 */
async function convertToNewsItem(parsed: ParsedContent): Promise<NewsItem> {
  const id = newsIdFromParsed(parsed);

  // 当前时间
  const now = new Date().toISOString();

  try {
    // 获取 AI 服务实例（带降级策略）
    const aiService = getDefaultAIService();
    const textForAi = composeTextForAiProcessing(parsed.content, parsed.referencedPost);

    // 使用 AI 处理：生成中文标题、摘要、分类
    const aiResult = await aiService.processNews(
      textForAi,
      parsed.author.name,
      parsed.author.handle || parsed.author.name
    );

    // 翻译内容为中文
    const translatedContent = await aiService.translateContent(textForAi);

    return {
      id,
      title: aiResult.title,
      summary: aiResult.summary,
      content: translatedContent,
      source: {
        platform: 'X', // 目前只支持 X
        name: parsed.author.name,
        handle: parsed.author.handle || parsed.author.name,
        url: parsed.url,
      },
      category: aiResult.category,
      publishedAt: parsed.publishedAt,
      originalText: parsed.content, // 外层英文原文
      createdAt: now, // 导入时间
      ...(parsed.referencedPost ? { referencedPost: parsed.referencedPost } : {}),
    };
  } catch (error) {
    console.error('AI processing failed, using fallback:', error);

    // 降级方案：使用简单的文本截取
    const title = parsed.title || generateTitle(parsed.content);
    const summary = generateSummary(parsed.content);
    const category: NewsCategory = 'Other';

    return {
      id,
      title,
      summary,
      content: parsed.content, // 保留英文原文
      source: {
        platform: 'X',
        name: parsed.author.name,
        handle: parsed.author.handle || parsed.author.name,
        url: parsed.url,
      },
      category,
      publishedAt: parsed.publishedAt,
      originalText: parsed.content,
      createdAt: now,
      ...(parsed.referencedPost ? { referencedPost: parsed.referencedPost } : {}),
    };
  }
}

/**
 * 生成标题
 * @param content 内容
 * @returns 标题
 */
function generateTitle(content: string): string {
  const maxLength = 50;
  const cleaned = content.replace(/\n/g, ' ').trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.substring(0, maxLength) + '...';
}

/**
 * 生成摘要
 * @param content 内容
 * @returns 摘要
 */
function generateSummary(content: string): string {
  const maxLength = 150;
  const cleaned = content.replace(/\n/g, ' ').trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.substring(0, maxLength) + '...';
}
