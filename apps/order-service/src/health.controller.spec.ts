import { jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const prisma = {
    checkDatabaseReadiness: jest.fn<() => Promise<void>>(),
  };
  const controller = new HealthController(prisma);

  it('reports liveness', () => {
    expect(controller.getLiveness()).toEqual({
      status: 'ok',
      service: 'order-service',
    });
  });

  it('reports readiness when the database is available', async () => {
    prisma.checkDatabaseReadiness.mockResolvedValue(undefined);

    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ready',
      service: 'order-service',
      checks: { process: 'ok', database: 'ok' },
    });
  });

  it('reports not ready when the database is unavailable', async () => {
    prisma.checkDatabaseReadiness.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(controller.getReadiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
