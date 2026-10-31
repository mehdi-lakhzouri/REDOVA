import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { type Env, InvalidEnvironmentError, loadDotEnv, parseEnv } from './config/env';

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

  // Better Auth parses its own request bodies; the auth module re-adds parsers for the other routes.
  const app = await NestFactory.create(AppModule.forRoot(env), {
    bodyParser: false,
    bufferLogs: true,
  });
  configureApp(app, env);
  await app.listen(env.PORT);
}

void bootstrap();
