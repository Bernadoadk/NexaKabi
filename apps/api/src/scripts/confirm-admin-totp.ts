/**
 * Active la double authentification d'un compte d'administration.
 *
 * Séparé de la création à dessein : le secret n'est activé qu'APRÈS qu'un
 * premier code a été produit par l'application d'authentification. Activer à
 * l'aveugle enfermerait dehors quelqu'un dont le scan a échoué — sans recours,
 * s'il est le premier administrateur.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { verifyTotp } from '@nexakabi/utils';
import { decryptSecret } from '../modules/admin/secret-box';
import { PrismaClient } from '../generated/prisma/client';

const [rawEmail, rawCode] = process.argv.slice(2);

if (!rawEmail || !rawCode) {
  console.error('Usage : confirm-admin-totp.ts <email> <code>');
  process.exit(1);
}

const email: string = rawEmail;
const code: string = rawCode;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, adminCredential: { select: { totpSecret: true } } },
  });

  const stored = user.adminCredential?.totpSecret;

  const secret =
    stored && process.env.ADMIN_ENCRYPTION_KEY
      ? decryptSecret(stored, process.env.ADMIN_ENCRYPTION_KEY)
      : stored;

  if (!secret) {
    console.error("Ce compte n'a pas de secret TOTP. Lance d'abord create-admin.ts.");
    process.exit(1);
  }

  if (!verifyTotp(secret, code).valid) {
    console.error("Ce code ne correspond pas. Verifie l'heure de ton telephone.");
    process.exit(1);
  }

  await prisma.adminCredential.update({
    where: { userId: user.id },
    data: { totpEnabledAt: new Date() },
  });

  console.log('Double authentification activee. Le compte peut se connecter.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
