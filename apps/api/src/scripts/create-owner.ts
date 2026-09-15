/**
 * Amorçage — ou réamorçage — du compte PROPRIÉTAIRE de la plateforme.
 *
 * ── Pourquoi un script, et pas une route ──────────────────────────────────
 * Le propriétaire ne peut pas être créé depuis la console : il faudrait déjà
 * y être connecté. Une route publique d'amorçage, même protégée par un jeton
 * d'environnement, resterait une porte ouverte pour toujours — celles-là
 * finissent oubliées en production. Un script exige un accès au serveur et à
 * la base : la même barrière que celle qui protège déjà les données.
 *
 * ── Un seul propriétaire ──────────────────────────────────────────────────
 * S'il en existe déjà un, le script le MET À JOUR — nom d'identifiant, nom
 * affiché, mot de passe — et garde son suffixe : un identifiant qui change
 * sans raison, c'est un propriétaire qui ne sait plus comment se connecter.
 * Les employés, eux, se créent depuis l'écran Équipe de la console.
 *
 * ── Le mot de passe vient de l'ENVIRONNEMENT, jamais de la ligne de commande
 * Un argument atterrit dans l'historique du shell et reste visible dans la
 * table des processus pendant l'exécution : n'importe quel utilisateur de la
 * machine peut le lire avec `ps`. Pour le compte qui donne accès aux pièces
 * d'identité de tous les organisateurs, c'est une fuite gratuite.
 *
 * Usage :
 *   ADMIN_PASSWORD='…' pnpm --filter @nexakabi/api exec tsx \
 *     src/scripts/create-owner.ts <nom> [nom affiché]
 *
 *   PowerShell :
 *     $env:ADMIN_PASSWORD='…'
 *     pnpm --filter @nexakabi/api exec tsx src/scripts/create-owner.ts bernado "Bernado"
 *
 * `nom` devient la partie gauche de l'identifiant : `bernado` → `bernado.owner@7k2p`.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { adminHandleSchema, adminPasswordSchema, buildAdminUsername } from '@nexakabi/contracts';
import { isValidPhone } from '@nexakabi/utils';
import { PrismaClient } from '../generated/prisma/client';
import { placeholderPhone, randomSuffix } from '../modules/admin/admin-staff.service';
import { hashPassword } from '../modules/admin/password';

const [rawHandle, rawDisplayName] = process.argv.slice(2);
const rawPassword = process.env.ADMIN_PASSWORD;

if (!rawHandle || !rawPassword) {
  console.error("Usage : ADMIN_PASSWORD='…' create-owner.ts <nom> [nom affiché]");
  console.error('Le mot de passe se transmet par la variable ADMIN_PASSWORD,');
  console.error('jamais en argument : `ps` le rendrait lisible par tous.');
  process.exit(1);
}

const handleResult = adminHandleSchema.safeParse(rawHandle);
if (!handleResult.success) {
  console.error(`Nom invalide : ${handleResult.error.issues[0]?.message ?? rawHandle}`);
  process.exit(1);
}

const passwordResult = adminPasswordSchema.safeParse(rawPassword);
if (!passwordResult.success) {
  console.error(`Mot de passe refusé : ${passwordResult.error.issues[0]?.message ?? ''}`);
  process.exit(1);
}

const handle = handleResult.data;
const password = passwordResult.data;
const displayName = rawDisplayName?.trim() || handle.charAt(0).toUpperCase() + handle.slice(1);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: { globalRole: 'OWNER', deletedAt: null },
    select: { id: true, phone: true, adminCredential: { select: { username: true } } },
  });

  const passwordHash = await hashPassword(password);

  if (existing) {
    // Le suffixe est conservé : seul le nom change, si demandé.
    const previous = existing.adminCredential?.username;
    const suffix = previous?.split('@')[1] ?? randomSuffix();
    const username = buildAdminUsername(handle, 'OWNER', suffix);

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: displayName,
        status: 'ACTIVE',
        // Un compte amorcé par l'ancien script portait un numéro provisoire
        // trop court, qui faisait tomber la liste des utilisateurs.
        ...(isValidPhone(existing.phone) ? {} : { phone: placeholderPhone() }),
        adminCredential: {
          upsert: {
            create: { username, passwordHash },
            update: {
              username,
              passwordHash,
              lastPasswordChangeAt: new Date(),
              failedAttempts: 0,
              lockedUntil: null,
            },
          },
        },
      },
    });

    // Un mot de passe qu'on vient de changer ferme les sessions ouvertes.
    await prisma.adminSession.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    report(username, previous ? 'mis à jour' : 'complété');
    return;
  }

  const username = buildAdminUsername(handle, 'OWNER', randomSuffix());

  await prisma.user.create({
    data: {
      fullName: displayName,
      // Numéro provisoire, unique : le modèle `User` l'exige, alors que le
      // propriétaire se connecte par identifiant et jamais par téléphone.
      phone: placeholderPhone(),
      globalRole: 'OWNER',
      status: 'ACTIVE',
      adminCredential: { create: { username, passwordHash } },
    },
  });

  report(username, 'créé');
}

function report(username: string, verb: string): void {
  console.log('');
  console.log(`Compte propriétaire ${verb}.`);
  console.log('');
  console.log(`  Identifiant : ${username}`);
  console.log(`  Console     : http://localhost:3002/connexion`);
  console.log('');
  console.log('Les employés se créent depuis l’écran « Équipe » de la console.');
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
