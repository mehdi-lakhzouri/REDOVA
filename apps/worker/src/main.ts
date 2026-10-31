import { loadDotEnv, parseWorkerEnv, type WorkerEnv } from './env';
import { startEmailWorker } from './worker';

const main = async () => {
  loadDotEnv();
  let env: WorkerEnv;
  try {
    env = parseWorkerEnv(process.env);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }

  let running: ReturnType<typeof startEmailWorker>;
  try {
    running = startEmailWorker(env);
  } catch (error) {
    // Unsafe or incomplete email configuration (e.g. Gmail SMTP in production) stops the worker.
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
  running.logger.info({ queue: 'email' }, 'Email worker started');

  const shutdown = (signal: string) => {
    running.logger.info({ signal }, 'Email worker stopping');
    running
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
};

void main();
