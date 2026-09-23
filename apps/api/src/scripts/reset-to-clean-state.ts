/**
 * Remet la base à son état de départ : référentiels et superadministrateur.
 *
 * ── Ce qui est conservé ───────────────────────────────────────────────────
 *   · les catégories et les villes — référentiels du cahier des charges
 *     (§6 et §57), sans lesquels aucun événement ne peut être créé ;
 *   · le compte PROPRIÉTAIRE, avec son identifiant et son mot de passe,
 *     pour que la console reste accessible ;
 *   · l'historique des migrations.
 *
 * ── Ce qui est effacé ─────────────────────────────────────────────────────
 * Tout le reste : utilisateurs, organisations, événements, commandes,
 * paiements, billets, contrôles d'entrée, grand livre, retraits,
 * notifications, signalements, sessions, journal d'audit.
 *
 * ── Garde-fous ────────────────────────────────────────────────────────────
 * Refuse de tourner en production. Exige `--confirmer`. N'efface rien sans
 * qu'une sauvegarde `pg_dump` ait été faite — le script ne la fait pas, il
 * vérifie qu'elle existe dans `storage/backups/` et date de moins d'une heure.
 *
 * Usage :
 *   pg_dump … -f apps/api/storage/backups/<nom>.sql
 *   pnpm --filter @nexakabi/api exec tsx src/scripts/reset-to-clean-state.ts --confirmer
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Tables jamais vidées. Noms PostgreSQL, tels que `@@map` les déclare. */
const KEPT_TABLES = new Set([
  'category',
  'city',
  // Pays, moyens de paiement et politiques de commission : de la configuration,
  // pas des données d'usage. Les vider casserait toute vente au redémarrage.
  'country',
  'country_payment_method',
  'commission_policy',
  'user',
  'admin_credential',
  '_prisma_migrations',
]);

const confirmed = process.argv.includes('--confirmer');

function assertRecentBackup(): void {
  const dir = join(process.cwd(), 'storage', 'backups');
  let files: string[] = [];

  try {
    files = readdirSync(dir).filter((name) => name.endsWith('.sql'));
  } catch {
    // Dossier absent : aucune sauvegarde.
  }

  const recent = files
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
    .filter((file) => Date.now() - file.mtime < 60 * 60_000);

  if (recent.length === 0) {
    console.error('Aucune sauvegarde de moins d’une heure dans storage/backups/.');
    console.error('Faites d’abord un pg_dump : cette opération est irréversible.');
    process.exit(1);
  }

  console.log(`Sauvegarde trouvée : ${recent[0]!.name}`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusé en production.');
    process.exit(1);
  }

  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const toTruncate = tables.map((row) => row.table_name).filter((name) => !KEPT_TABLES.has(name));

  const superadmins = await prisma.user.findMany({
    where: { globalRole: 'OWNER', deletedAt: null },
    select: { id: true, email: true },
  });

  const otherUsers = await prisma.user.count({
    where: { NOT: { id: { in: superadmins.map((user) => user.id) } } },
  });

  console.log('');
  console.log(`${toTruncate.length} table(s) seront vidées :`);
  console.log(`  ${toTruncate.join(', ')}`);
  console.log('');
  console.log(`${otherUsers} compte(s) utilisateur seront supprimés.`);
  console.log(
    `${superadmins.length} propriétaire(s) conservé(s) : ${superadmins.map((user) => user.email ?? user.id).join(', ')}`,
  );
  console.log('Catégories, villes, pays et moyens de paiement conservés.');
  console.log('');

  if (superadmins.length === 0) {
    console.error('Aucun propriétaire en base : la console deviendrait inaccessible. Abandon.');
    process.exit(1);
  }

  if (!confirmed) {
    console.log('Aucune modification. Relancez avec --confirmer pour exécuter.');
    return;
  }

  assertRecentBackup();

  // TRUNCATE ... CASCADE vide aussi les tables qui référencent celles-ci,
  // ce qui couvre toute dépendance oubliée. Les tables conservées ne sont pas
  // dans la liste, et rien ne les référence en cascade depuis celles-ci.
  const list = toTruncate.map((name) => `"${name}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

  const { count } = await prisma.user.deleteMany({
    where: { NOT: { id: { in: superadmins.map((user) => user.id) } } },
  });

  // `commission_policy` référence `organization` : la cascade l'a vidée avec
  // elle, politique de plateforme comprise. Sans cette ligne, le code retombe
  // sur sa constante — rien ne casse — mais la configuration ne serait plus
  // visible ni modifiable dans la console.
  await prisma.commissionPolicy.upsert({
    where: { id: 'policy_platform_default' },
    create: {
      id: 'policy_platform_default',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      name: 'Défaut plateforme',
      percentageBps: 500,
      fixedAmountPerTicket: 0,
      minFeePerOrder: 100,
      buyerSharePercent: 100,
      appliesToFreeTickets: false,
      payoutFeeBps: 100,
      payoutFeeMax: 2000,
      minPayoutAmount: 5000,
    },
    update: {},
  });

  console.log('');
  console.log(`${toTruncate.length} table(s) vidée(s), ${count} compte(s) supprimé(s).`);
  console.log('La base est à son état de départ.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
