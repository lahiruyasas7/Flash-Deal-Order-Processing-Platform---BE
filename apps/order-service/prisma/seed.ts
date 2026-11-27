import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { validateEnvironment } from '../src/config/environment.validation.js';
import { provisionInitialAdministrator } from '../src/prisma/initial-admin-provisioning.js';
import { ZodError, z } from 'zod';

const adminEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());
const adminPasswordSchema = z.string().min(15);

async function runSeed(): Promise<void> {
  const { ORDER_DATABASE_URL } = validateEnvironment(process.env);
  const emailResult = adminEmailSchema.safeParse(
    process.env.INITIAL_ADMIN_EMAIL,
  );
  if (!emailResult.success) {
    throw new Error('INITIAL_ADMIN_EMAIL must be a valid email address.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: ORDER_DATABASE_URL }),
  });

  try {
    await prisma.$connect();

    const result = await provisionInitialAdministrator({
      email: emailResult.data,
      loadPassword: () => {
        const passwordResult = adminPasswordSchema.safeParse(
          process.env.INITIAL_ADMIN_PASSWORD,
        );
        if (!passwordResult.success) {
          throw new Error(
            'INITIAL_ADMIN_PASSWORD must be at least 15 characters.',
          );
        }

        return passwordResult.data;
      },
      hashPassword: (password) =>
        argon2.hash(password, { type: argon2.argon2id }),
      store: {
        findUserRole: async (email) =>
          prisma.user.findUnique({
            where: { email },
            select: { role: true },
          }),
        createAdmin: async (email, passwordHash) => {
          await prisma.user.create({
            data: {
              email,
              passwordHash,
              role: 'ADMIN',
            },
          });
        },
      },
    });

    console.info(
      result === 'created'
        ? 'Initial administrator provisioned.'
        : 'Initial administrator is already provisioned; no changes made.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void runSeed().catch((error: unknown) => {
  if (error instanceof ZodError) {
    console.error(
      'Initial administrator provisioning failed: database configuration is invalid.',
    );
  } else if (error instanceof Error) {
    console.error(
      `Initial administrator provisioning failed: ${error.message}`,
    );
  } else {
    console.error('Initial administrator provisioning failed.');
  }

  process.exitCode = 1;
});
