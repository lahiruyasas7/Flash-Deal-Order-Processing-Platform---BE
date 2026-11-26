import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports liveness', () => {
    expect(controller.getLiveness()).toEqual({
      status: 'ok',
      service: 'notification-service',
    });
  });

  it('reports process readiness', () => {
    expect(controller.getReadiness()).toEqual({
      status: 'ready',
      service: 'notification-service',
      checks: { process: 'ok' },
    });
  });
});
