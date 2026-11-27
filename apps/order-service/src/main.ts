import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { AppEnvironment } from './config/environment.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(new ConsoleLogger({ json: true }));
  const config = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  const port = config.get('PORT');
  await app.listen(port, '127.0.0.1');
}

void bootstrap();
