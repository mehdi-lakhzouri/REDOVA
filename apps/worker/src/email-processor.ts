import { type EmailJob, emailJobSchema } from '@redova/contracts';
import type { EmailRenderer, EmailSender } from '@redova/integrations';
import type { Job } from 'bullmq';
import type { Logger } from 'pino';

/** Only the recipient domain is logged; payloads (action URLs with tokens) never are (README §16.1). */
export const recipientDomain = (email: string): string => email.split('@').pop() ?? 'unknown';

export const createEmailProcessor =
  (dependencies: { renderer: EmailRenderer; sender: EmailSender; logger: Logger }) =>
  async (job: Job<EmailJob>): Promise<{ messageId: string }> => {
    const payload = emailJobSchema.parse(job.data);
    const message = dependencies.renderer.render(payload);
    const { messageId } = await dependencies.sender.send(message);
    dependencies.logger.info(
      {
        jobId: job.id,
        template: payload.template,
        recipientDomain: recipientDomain(payload.to),
        attempt: job.attemptsMade + 1,
        messageId,
      },
      'Email delivered',
    );
    return { messageId };
  };
