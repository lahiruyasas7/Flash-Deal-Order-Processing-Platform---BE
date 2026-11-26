import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const defaultPort = 3002;
  const port = Number(process.env.PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535; received ${process.env.PORT}`,
    );
  }

  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(new ConsoleLogger({ json: true }));
  await app.listen(port, '127.0.0.1');
}

void bootstrap();
