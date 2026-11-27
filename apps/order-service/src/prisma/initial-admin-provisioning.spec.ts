import { describe, expect, it, jest } from '@jest/globals';
import {
  provisionInitialAdministrator,
  type InitialAdminStore,
} from './initial-admin-provisioning.js';

describe('provisionInitialAdministrator', () => {
  it('creates an administrator using a password hash when the email is unused', async () => {
    const createAdmin = jest.fn<InitialAdminStore['createAdmin']>();
    const store: InitialAdminStore = {
      findUserRole: async () => null,
      createAdmin,
    };
    const hashPassword = jest.fn(
      async (password: string) => `hash:${password}`,
    );

    const result = await provisionInitialAdministrator({
      email: 'admin@example.com',
      loadPassword: () => 'a-strong-password',
      hashPassword,
      store,
    });

    expect(result).toBe('created');
    expect(hashPassword).toHaveBeenCalledWith('a-strong-password');
    expect(createAdmin).toHaveBeenCalledWith(
      'admin@example.com',
      'hash:a-strong-password',
    );
  });

  it('does not change an existing administrator or require the password again', async () => {
    const createAdmin = jest.fn<InitialAdminStore['createAdmin']>();
    const store: InitialAdminStore = {
      findUserRole: async () => ({ role: 'ADMIN' }),
      createAdmin,
    };
    const loadPassword = jest.fn(() => {
      throw new Error('Password should not be read.');
    });

    const result = await provisionInitialAdministrator({
      email: 'admin@example.com',
      loadPassword,
      hashPassword: async (password) => password,
      store,
    });

    expect(result).toBe('already-provisioned');
    expect(loadPassword).not.toHaveBeenCalled();
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it('refuses to promote an existing customer', async () => {
    const createAdmin = jest.fn<InitialAdminStore['createAdmin']>();
    const store: InitialAdminStore = {
      findUserRole: async () => ({ role: 'CUSTOMER' }),
      createAdmin,
    };

    await expect(
      provisionInitialAdministrator({
        email: 'customer@example.com',
        loadPassword: () => 'a-strong-password',
        hashPassword: async (password) => password,
        store,
      }),
    ).rejects.toThrow('already exists and is not an administrator');

    expect(createAdmin).not.toHaveBeenCalled();
  });
});
