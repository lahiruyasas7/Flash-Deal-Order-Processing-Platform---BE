import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports liveness', () => {
    expect(controller.getLiveness()).toEqual({
      status: 'ok',
      service: 'order-service',
    });
  });

  it('reports process readiness', () => {
    expect(controller.getReadiness()).toEqual({
      status: 'ready',
      service: 'order-service',
      checks: { process: 'ok' },
    });
  });
});
