import {
  type DynamicModule,
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { EmailJob, EnqueueEmail } from '@redova/contracts';
import { createEmailQueue, createEnqueueEmail, createQueueConnection } from '@redova/queue';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';

export const ENQUEUE_EMAIL = Symbol('ENQUEUE_EMAIL');
const EMAIL_QUEUE = Symbol('EMAIL_QUEUE');

interface EmailQueueHandle {
  queue: Queue<EmailJob>;
  connection: Redis;
}

/** Producer side of the transactional email queue (README §16.1); the worker delivers the emails. */
@Global()
@Module({})
export class EmailQueueModule implements OnApplicationShutdown {
  constructor(@Inject(EMAIL_QUEUE) private readonly handle: EmailQueueHandle | null) {}

  /** `override` lets integration tests capture jobs instead of using Redis. */
  static forRoot(env: Env, override?: EnqueueEmail): DynamicModule {
    if (override) {
      return {
        module: EmailQueueModule,
        providers: [
          { provide: EMAIL_QUEUE, useValue: null },
          { provide: ENQUEUE_EMAIL, useValue: override },
        ],
        exports: [ENQUEUE_EMAIL],
      };
    }
    return {
      module: EmailQueueModule,
      providers: [
        {
          provide: EMAIL_QUEUE,
          useFactory: (): EmailQueueHandle => {
            const connection = createQueueConnection(env.REDIS_URL);
            return { queue: createEmailQueue(connection), connection };
          },
        },
        {
          provide: ENQUEUE_EMAIL,
          useFactory: (handle: EmailQueueHandle) => createEnqueueEmail(handle.queue),
          inject: [EMAIL_QUEUE],
        },
      ],
      exports: [ENQUEUE_EMAIL],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.handle) return;
    await this.handle.queue.close();
    await this.handle.connection.quit();
  }
}
