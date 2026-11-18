import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, UserRole } from "./generated";
import { normalizeEmail } from "../shared/email";

// The seeded account is CRM staff; clients register through the client portal.
const role = UserRole.admin;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured");
  }

  const email = normalizeEmail(getRequiredEnv("SEED_ADMIN_EMAIL"));
  const password = getRequiredEnv("SEED_ADMIN_PASSWORD");
  const overwriteExisting = isEnabled(process.env.SEED_ADMIN_OVERWRITE);

  if (password.length < 8 || password.length > 72) {
    throw new Error("SEED_ADMIN_PASSWORD must be 8-72 characters");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const matches = await prisma.$queryRaw<{ id: string; role: UserRole }[]>`
      SELECT id, role FROM users WHERE lower(btrim(email)) = lower(${email}) LIMIT 2`;
    if (matches.length > 1 || (matches.length && matches[0].role !== role)) {
      throw new Error(
        "The configured admin email is already assigned to another account.",
      );
    }
    const existingUser = matches[0];

    if (existingUser && !overwriteExisting) {
      console.log(`Seed user ${email} already exists; skipping update`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (existingUser) {
      await prisma.user.update({
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
          role,
        },
        where: { id: existingUser.id },
      });

      console.log(`Updated seed user ${email} with role ${role}`);
      return;
    }

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
      },
    });

    console.log(`Created seed user ${email} with role ${role}`);
  } finally {
    await prisma.$disconnect();
  }
}

function getRequiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} must be configured for seeding`);
  }

  return value;
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
