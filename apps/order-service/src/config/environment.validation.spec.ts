import { describe, expect, it } from '@jest/globals';
import { validateEnvironment } from './environment.validation.js';

describe('validateEnvironment', () => {
  const validEnvironment = {
    ORDER_DATABASE_URL:
      'postgresql://user:password@localhost:5432/order_service',
  };

  it('applies defaults and accepts the Order Service database URL', () => {
    expect(validateEnvironment(validEnvironment)).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      ORDER_DATABASE_URL: validEnvironment.ORDER_DATABASE_URL,
    });
  });

  it('coerces and validates the port', () => {
    expect(
      validateEnvironment({ ...validEnvironment, PORT: '3100' }).PORT,
    ).toBe(3100);
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: '70000' }),
    ).toThrow();
  });

  it('rejects a database URL with a non-PostgreSQL scheme', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ORDER_DATABASE_URL: 'mysql://user:password@localhost:3306/orders',
      }),
    ).toThrow();
  });
});
