/**
 * Régénère les clés de signature des événements après une rotation du secret.
 *
 * ── Quand ce script sert ──────────────────────────────────────────────────
 * `TICKET_SIGNING_SECRET` a changé. Les clés publiques déjà enregistrées
 * dérivent de l'ANCIEN secret ; celles que le service dériverait maintenant
 * n'ont plus rien à voir. Depuis le correctif de `ticket-signing.service.ts`,
 * l'émission d'un billet sur un tel événement échoue explicitement plutôt que
 * de produire un billet invérifiable à la porte.
 *
 * Deux issues, et le choix n'est pas technique :
 *
 *   · **Restaurer le secret d'origine** — les QR déjà distribués restent
 *     valides. C'est la bonne réponse si des billets circulent.
 *   · **Régénérer les clés**, ce que fait ce script — les QR déjà distribués
 *     deviennent INVALIDES et doivent être réémis auprès de leurs porteurs.
 *
 * Ne l'exécutez que si vous avez tranché en faveur du second.
 *
 * Usage :
 *   pnpm --filter @nexakabi/api exec tsx src/scripts/rotate-event-keys.ts [--confirmer]
 *
 * Sans `--confirmer`, le script se contente de lister ce qu'il changerait.
 */
import { createPrivateKey, createPublicKey, hkdfSync } from 'node:crypto';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/** Doit rester identique à `ticket-signing.service.ts`. */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const confirmed = process.argv.includes('--confirmer');

function derivePublicKey(masterSecret: string, eventId: string, keyId: string): string {
  const seed = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(masterSecret, 'utf8'),
      Buffer.from(eventId, 'utf8'),
      `nk-ticket-${keyId}`,
      32,
    ),
  );

  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });

  return String(createPublicKey(privateKey).export({ format: 'jwk' }).x);
}

async function main(): Promise<void> {
  const secret = process.env.TICKET_SIGNING_SECRET;

  if (!secret || secret.length < 32) {
    console.error('TICKET_SIGNING_SECRET manquant ou trop court dans .env.');
    process.exit(1);
  }

  const keys = await prisma.eventSigningKey.findMany({
    select: {
      eventId: true,
      keyId: true,
      publicKey: true,
      event: { select: { title: true, shortCode: true, _count: { select: { tickets: true } } } },
    },
  });

  const stale = keys.filter(
    (key) => derivePublicKey(secret, key.eventId, key.keyId) !== key.publicKey,
  );

  if (stale.length === 0) {
    console.log(
      `${keys.length} clé(s) vérifiée(s) : toutes dérivent du secret actuel. Rien à faire.`,
    );
    return;
  }

  console.log(`${stale.length} clé(s) sur ${keys.length} ne dérivent plus du secret actuel :`);
  console.log('');

  let affectedTickets = 0;

  for (const key of stale) {
    affectedTickets += key.event._count.tickets;
    console.log(`  · ${key.event.shortCode}  ${key.event.title}`);
    console.log(`    ${key.event._count.tickets} billet(s) déjà émis deviendront invérifiables.`);
  }

  console.log('');

  if (!confirmed) {
    console.log(`Aucune modification. Relancez avec --confirmer pour régénérer.`);
    console.log(
      `${affectedTickets} billet(s) au total devront être réémis auprès de leurs porteurs.`,
    );
    return;
  }

  for (const key of stale) {
    await prisma.eventSigningKey.update({
      where: { eventId: key.eventId },
      data: { publicKey: derivePublicKey(secret, key.eventId, key.keyId) },
    });

    console.log(`  régénérée : ${key.event.shortCode}`);
  }

  console.log('');
  console.log(`${stale.length} clé(s) régénérée(s).`);
  console.log(`${affectedTickets} billet(s) doivent être réémis : leurs QR ne passeront plus.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
