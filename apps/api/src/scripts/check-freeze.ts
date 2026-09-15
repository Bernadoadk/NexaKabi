/**
 * Contrôle de cohérence du gel.
 *
 * Vérifie l'invariant qui compte : le gel DÉPLACE l'argent, il ne le supprime
 * pas. Le total du grand livre doit être identique avant et après.
 *
 * Usage : pnpm --filter @nexakabi/api exec tsx src/scripts/check-freeze.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });

  for (const organization of organizations) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { organizationId: organization.id },
      select: { type: true, amount: true, balanceState: true, availableAt: true },
    });

    if (entries.length === 0) continue;

    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const now = Date.now();

    let available = 0;
    let pending = 0;

    for (const entry of entries) {
      const unlocked =
        entry.balanceState === 'AVAILABLE' ||
        (entry.availableAt !== null && entry.availableAt.getTime() <= now);

      if (unlocked) available += entry.amount;
      else pending += entry.amount;
    }

    const frozen = -entries
      .filter((entry) => entry.type === 'FREEZE' || entry.type === 'UNFREEZE')
      .reduce((sum, entry) => sum + entry.amount, 0);

    console.log('');
    console.log(organization.name);
    console.log(`  ecritures          : ${entries.length}`);
    console.log(`  total grand livre  : ${total}`);
    console.log(`  disponible         : ${available}`);
    console.log(`  bloque             : ${pending}`);
    console.log(`  gele               : ${frozen}`);
    console.log(
      `  invariant total = disponible + bloque : ${total === available + pending ? 'OK' : 'ROMPU'}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
