import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

function getDatabaseUrl(): string {
  const databaseUrl = process.env.ORDER_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('ORDER_DATABASE_URL must be set for the Order Service.');
  }

  return databaseUrl;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkDatabaseReadiness(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
