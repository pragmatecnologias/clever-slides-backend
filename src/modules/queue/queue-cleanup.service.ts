import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class QueueCleanupService implements OnModuleInit {
  private readonly logger = new Logger(QueueCleanupService.name);
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    @InjectQueue('image-generation') private imageQueue: Queue,
    @InjectQueue('audio-generation') private audioQueue: Queue,
    @InjectQueue('music-generation') private musicQueue: Queue,
    @InjectQueue('video-generation') private videoQueue: Queue,
    @InjectQueue('deck-generation') private deckQueue: Queue,
  ) {}

  async onModuleInit() {
    // Clean up on startup
    await this.cleanupAllQueues();

    // Run cleanup every hour without requiring @nestjs/schedule
    this.cleanupInterval = setInterval(() => {
      void this.cleanupAllQueues();
    }, 60 * 60 * 1000);
  }

  /**
   * Clean up old jobs every hour to prevent Redis bloat
   */
  async cleanupAllQueues() {
    this.logger.log('Starting scheduled queue cleanup...');
    
    const queues = [
      { name: 'image-generation', queue: this.imageQueue },
      { name: 'audio-generation', queue: this.audioQueue },
      { name: 'music-generation', queue: this.musicQueue },
      { name: 'video-generation', queue: this.videoQueue },
      { name: 'deck-generation', queue: this.deckQueue },
    ];

    for (const { name, queue } of queues) {
      await this.cleanupQueue(name, queue);
    }

    this.logger.log('Queue cleanup completed');
  }

  private async cleanupQueue(name: string, queue: Queue) {
    try {
      // Remove completed jobs older than 1 hour
      const completedRemoved = await queue.clean(3600000, 'completed');
      
      // Remove failed jobs older than 24 hours
      const failedRemoved = await queue.clean(86400000, 'failed');
      
      // Remove jobs stuck in waiting for more than 1 hour
      const waitingJobs = await queue.getJobs(['waiting']);
      const now = Date.now();
      let oldWaitingRemoved = 0;
      for (const job of waitingJobs) {
        if (now - job.timestamp > 3600000) {
          await job.remove();
          oldWaitingRemoved++;
        }
      }

      this.logger.log(
        `Cleaned ${name}: ${completedRemoved.length} completed, ${failedRemoved.length} failed, ${oldWaitingRemoved} old waiting`
      );
    } catch (error) {
      this.logger.error(`Failed to clean ${name} queue:`, error);
    }
  }

  /**
   * Emergency cleanup - removes ALL jobs from all queues
   * Use with caution!
   */
  async emergencyCleanup() {
    this.logger.warn('EMERGENCY CLEANUP: Removing all jobs from all queues');
    
    const queues = [this.imageQueue, this.audioQueue, this.musicQueue, this.videoQueue, this.deckQueue];
    
    for (const queue of queues) {
      await queue.empty();
      await queue.clean(0, 'completed');
      await queue.clean(0, 'failed');
      await queue.clean(0, 'delayed');
      await queue.clean(0, 'active');
      await queue.clean(0, 'wait');
    }

    this.logger.warn('Emergency cleanup completed - all queues emptied');
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const stats = [];

    const queues = [
      { name: 'image-generation', queue: this.imageQueue },
      { name: 'audio-generation', queue: this.audioQueue },
      { name: 'music-generation', queue: this.musicQueue },
      { name: 'video-generation', queue: this.videoQueue },
      { name: 'deck-generation', queue: this.deckQueue },
    ];

    for (const { name, queue } of queues) {
      const counts = await queue.getJobCounts();
      stats.push({ queue: name, ...counts });
    }

    return stats;
  }
}
