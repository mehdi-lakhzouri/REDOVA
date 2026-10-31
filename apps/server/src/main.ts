import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pino from 'pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { type Env, InvalidEnvironmentError, loadDotEnv, parseEnv } from './config/env';
import { buildPinoHttpOptions } from './logging/pino.config';

async function bootstrap() {
  loadDotEnv();
  let env: Env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  let app: INestApplication | undefined;
  try {
    // Better Auth parses its own request bodies; the auth module re-adds parsers for the other routes.
    app = await NestFactory.create(AppModule.forRoot(env), {
      bodyParser: false,
      bufferLogs: true,
      abortOnError: false,
    });
    configureApp(app, env);
    await app.listen(env.PORT);
    new Logger('Bootstrap').log({ port: env.PORT }, 'API listening');
  } catch (error) {
    // A synchronous JSON fallback also works if dependency injection or the pretty worker failed.
    const logger = pino(
      { ...buildPinoHttpOptions(env), transport: undefined },
      pino.destination({ dest: 2, sync: true }),
    );
    logger.fatal({ err: error }, 'Application startup failed');
    try {
      await app?.close();
    } catch (shutdownError) {
      logger.error({ err: shutdownError }, 'Startup cleanup failed');
    }
    process.exit(1);
  }
}

void bootstrap();
