import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  getLiveness() {
    return { status: 'ok', service: 'api-gateway' };
  }

  @Get('ready')
  getReadiness() {
    return {
      status: 'ready',
      service: 'api-gateway',
      checks: { process: 'ok' },
    };
  }
}
