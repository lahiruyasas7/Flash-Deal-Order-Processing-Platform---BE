import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  getLiveness() {
    return { status: 'ok', service: 'notification-service' };
  }

  @Get('ready')
  getReadiness() {
    return {
      status: 'ready',
      service: 'notification-service',
      checks: { process: 'ok' },
    };
  }
}
