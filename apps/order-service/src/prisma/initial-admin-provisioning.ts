export interface InitialAdminStore {
  findUserRole(email: string): Promise<{ role: 'ADMIN' | 'CUSTOMER' } | null>;
  createAdmin(email: string, passwordHash: string): Promise<void>;
}

interface ProvisionInitialAdminOptions {
  email: string;
  loadPassword: () => string;
  hashPassword: (password: string) => Promise<string>;
  store: InitialAdminStore;
}

export async function provisionInitialAdministrator({
  email,
  loadPassword,
  hashPassword,
  store,
}: ProvisionInitialAdminOptions): Promise<'created' | 'already-provisioned'> {
  const existingUser = await store.findUserRole(email);

  if (existingUser) {
    if (existingUser.role !== 'ADMIN') {
      throw new Error(
        'A user with INITIAL_ADMIN_EMAIL already exists and is not an administrator.',
      );
    }

    return 'already-provisioned';
  }

  const passwordHash = await hashPassword(loadPassword());
  await store.createAdmin(email, passwordHash);

  return 'created';
}
