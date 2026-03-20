/**
 * 后台任务执行器
 * 使用 child_process.spawn 执行脚本，实时读取输出并更新任务进度
 */

import { spawn } from 'child_process';
import path from 'path';
import { taskManager } from './task-manager';

class BackgroundWorker {
  /**
   * 执行抓取任务
   * @param taskId 任务 ID
   */
  async executeFetchTask(taskId: string): Promise<void> {
    try {
      taskManager.updateTask(taskId, {
        status: 'running',
        progress: 0,
        message: '正在抓取推文...',
        startTime: Date.now(),
        estimatedDuration: 145, // 基于优化后的预估：2.4分钟
        remainingTime: 145,
      });

      // 1. 执行 fetch-posts.ts
      await this.runScript('scripts/fetch-posts.ts', taskId, 0, 40);

      taskManager.updateTask(taskId, {
        progress: 40,
        message: '正在 AI 处理推文...',
      });

      // 2. 执行 process-posts.ts
      await this.runScript('scripts/process-posts.ts', taskId, 40, 100);

      taskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: '抓取完成',
      });
    } catch (error: any) {
      console.error('[BackgroundWorker] Task execution failed:', error);
      taskManager.updateTask(taskId, {
        status: 'failed',
        progress: 0,
        message: '抓取失败',
        error: error.message || '未知错误',
      });
    }
  }

  /**
   * 运行脚本
   * @param scriptPath 脚本路径（相对于项目根目录）
   * @param taskId 任务 ID
   * @param startProgress 起始进度
   * @param endProgress 结束进度
   */
  private runScript(
    scriptPath: string,
    taskId: string,
    startProgress: number,
    endProgress: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fullPath = path.join(process.cwd(), scriptPath);
      const child = spawn('npx', ['tsx', fullPath], {
        cwd: process.cwd(),
        env: process.env,
        shell: true,
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[BackgroundWorker] ${text.trim()}`);

        // 解析输出，提取进度信息
        const lines = text.split('\n');
        for (const line of lines) {
          // 匹配 "Processed 10/50 posts" 或类似格式
          const match = line.match(/(?:Processed|处理了)\s+(\d+)\/(\d+)/i);
          if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            const scriptProgress = (current / total) * 100;
            const overallProgress = startProgress +
              (scriptProgress / 100) * (endProgress - startProgress);

            const progress = Math.round(overallProgress);
            const message = line.trim();

            // 计算剩余时间
            const task = taskManager.getTask(taskId);
            let estimatedDuration: number | undefined;
            let remainingTime: number | undefined;

            if (task && task.startTime && progress > 0) {
              const elapsedSeconds = (Date.now() - task.startTime) / 1000;
              estimatedDuration = Math.round(elapsedSeconds / (progress / 100));
              remainingTime = Math.max(0, Math.round(estimatedDuration - elapsedSeconds));
            }

            taskManager.updateTask(taskId, {
              progress,
              message,
              estimatedDuration,
              remainingTime,
            });
          }
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[BackgroundWorker] ${text.trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Script exited with code ${code}: ${errorOutput || output}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }
}

export const backgroundWorker = new BackgroundWorker();
