import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEnvironment } from './environment.validation.js';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../',
);

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        resolve(repositoryRoot, '.env.local'),
        resolve(repositoryRoot, '.env'),
      ],
      validate: validateEnvironment,
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
