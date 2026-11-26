import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  getLiveness() {
    return { status: 'ok', service: 'order-service' };
  }

  @Get('ready')
  getReadiness() {
    return {
      status: 'ready',
      service: 'order-service',
      checks: { process: 'ok' },
    };
  }
}
