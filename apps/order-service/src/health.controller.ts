import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: Pick<PrismaService, 'checkDatabaseReadiness'>,
  ) {}

  @Get('live')
  getLiveness() {
    return { status: 'ok', service: 'order-service' };
  }

  @Get('ready')
  async getReadiness() {
    try {
      await this.prisma.checkDatabaseReadiness();
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'order-service',
        checks: { process: 'ok', database: 'error' },
      });
    }

    return {
      status: 'ready',
      service: 'order-service',
      checks: { process: 'ok', database: 'ok' },
    };
  }
}
