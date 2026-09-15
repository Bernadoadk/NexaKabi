/**
 * Amorçage d'un compte d'administration.
 *
 * ── Pourquoi un script, et pas une route ──────────────────────────────────
 * Le premier administrateur ne peut pas être créé depuis l'administration : il
 * faudrait déjà y être connecté. Une route publique d'amorçage, même protégée
 * par un jeton d'environnement, resterait une porte ouverte pour toujours —
 * celles-là finissent oubliées en production.
 *
 * Un script exige un accès au serveur et à la base : la même barrière que celle
 * qui protège déjà les données.
 *
 * ── Pourquoi la double authentification n'est pas activée ici ────────────
 * Le secret est enregistré mais reste INACTIF. Il faut d'abord le scanner, puis
 * confirmer avec un vrai code (`confirm-admin-totp.ts`). Activer à l'aveugle
 * enfermerait dehors quelqu'un dont le scan a échoué — sans recours, puisque
 * personne d'autre n'est encore administrateur.
 *
 * Usage :
 *   ADMIN_PASSWORD='…' pnpm --filter @nexakabi/api exec tsx \
 *     src/scripts/create-admin.ts <email> [role]
 *
 * `role` est optionnel — ADMIN, SUPERADMIN ou SUPPORT (ADMIN par défaut).
 */
import { createHash } from 'node:crypto';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildTotpUri, generateTotpSecret } from '@nexakabi/utils';
import { PrismaClient } from '../generated/prisma/client';
import { generateRecoveryCodes, hashPassword } from '../modules/admin/password';
import { encryptSecret } from '../modules/admin/secret-box';

const [rawEmail, rawRole] = process.argv.slice(2);

/**
 * Le mot de passe vient de l'ENVIRONNEMENT, jamais de la ligne de commande.
 *
 * Un argument de ligne de commande atterrit dans l'historique du shell et
 * reste visible dans la table des processus pendant toute l'exécution :
 * n'importe quel utilisateur de la machine peut le lire avec `ps`. Pour le mot
 * de passe d'un compte qui donne accès aux pièces d'identité de tous les
 * organisateurs, c'est une fuite gratuite.
 *
 *   ADMIN_PASSWORD='…' pnpm --filter @nexakabi/api exec tsx \
 *     src/scripts/create-admin.ts <email> [role]
 */
const rawPassword = process.env.ADMIN_PASSWORD;

if (!rawEmail || !rawPassword) {
  console.error("Usage : ADMIN_PASSWORD='…' create-admin.ts <email> [role]");
  console.error('Le mot de passe se transmet par la variable ADMIN_PASSWORD,');
  console.error('jamais en argument : `ps` le rendrait lisible par tous.');
  process.exit(1);
}

if (rawPassword.length < 12) {
  console.error('Le mot de passe doit faire au moins douze caracteres.');
  process.exit(1);
}

const VALID_ROLES = ['ADMIN', 'SUPERADMIN', 'SUPPORT'] as const;
type AdminRole = (typeof VALID_ROLES)[number];

const role: AdminRole = (rawRole?.toUpperCase() ?? 'ADMIN') as AdminRole;

if (!VALID_ROLES.includes(role)) {
  console.error(`Role invalide : ${rawRole}. Valeurs possibles : ${VALID_ROLES.join(', ')}.`);
  process.exit(1);
}

// Figées après la garde : TypeScript ne conserve pas l'affinage d'un `const`
// lu depuis une closure définie plus bas.
const email: string = rawEmail;
const password: string = rawPassword;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/[^A-Z0-9]/g, ''))
    .digest('hex');
}

async function main(): Promise<void> {
  const normalized = email.toLowerCase().trim();

  const user = await prisma.user.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      // Numéro provisoire, unique : le modèle `User` l'exige, alors qu'un
      // administrateur se connecte par e-mail et jamais par téléphone.
      phone: `+229000${Date.now().toString().slice(-6)}`,
      fullName: normalized.split('@')[0] ?? 'Administrateur',
      globalRole: role,
      status: 'ACTIVE',
    },
    update: { globalRole: role, status: 'ACTIVE' },
    select: { id: true, email: true },
  });

  const secret = generateTotpSecret();
  const recoveryCodes = generateRecoveryCodes();

  const encryptionKey = process.env.ADMIN_ENCRYPTION_KEY;

  if (!encryptionKey || encryptionKey.length < 32) {
    console.error('ADMIN_ENCRYPTION_KEY manquante ou trop courte dans .env.');
    process.exit(1);
  }

  const credential = {
    passwordHash: await hashPassword(password),
    // Chiffré ici comme partout ailleurs : un script d'amorçage qui ecrirait
    // en clair rouvrirait exactement le trou que le chiffrement ferme.
    totpSecret: encryptSecret(secret, encryptionKey),
    totpEnabledAt: null,
    recoveryCodes: recoveryCodes.map(hashRecoveryCode),
  };

  await prisma.adminCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...credential },
    update: credential,
  });

  console.log('');
  console.log(`Compte d'administration : ${user.email ?? normalized} (${role})`);
  console.log('');
  console.log("Secret TOTP, a scanner dans l'application d'authentification :");
  console.log(`  ${secret}`);
  console.log('');
  console.log('URI otpauth :');
  console.log(`  ${buildTotpUri({ secret, accountName: normalized })}`);
  console.log('');
  console.log('Codes de secours. Affiches UNE SEULE FOIS : note-les maintenant.');
  for (const code of recoveryCodes) console.log(`  ${code}`);
  console.log('');
  console.log('La double authentification doit etre CONFIRMEE avant la premiere connexion :');
  console.log('  pnpm --filter @nexakabi/api exec tsx src/scripts/confirm-admin-totp.ts \\');
  console.log(`    ${normalized} <code-a-six-chiffres>`);
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
