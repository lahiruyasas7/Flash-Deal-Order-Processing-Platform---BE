import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports liveness', () => {
    expect(controller.getLiveness()).toEqual({
      status: 'ok',
      service: 'api-gateway',
    });
  });

  it('reports process readiness', () => {
    expect(controller.getReadiness()).toEqual({
      status: 'ready',
      service: 'api-gateway',
      checks: { process: 'ok' },
    });
  });
});
