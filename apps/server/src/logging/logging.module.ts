import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HttpLoggingService } from './http-logging.service';
import { buildPinoHttpOptions, type LoggingEnv } from './pino.config';

/** Register once in AppModule. nestjs-pino makes its loggers available globally. */
@Module({})
export class LoggingModule {
  static forRoot(env: LoggingEnv): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: buildPinoHttpOptions(env),
          // HTTP logging is mounted before Better Auth by HttpLoggingService.
          // The Nest middleware only binds the existing request/response loggers.
          useExisting: true,
          assignResponse: true,
        }),
      ],
      providers: [HttpLoggingService],
      exports: [LoggerModule, HttpLoggingService],
    };
  }
}
