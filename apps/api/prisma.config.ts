import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Configuration Prisma (CLI et migrations).
 *
 * Depuis Prisma 7, l'URL de connexion ne figure plus dans `schema.prisma` :
 * elle est déclarée ici pour les migrations, et fournie au client applicatif
 * par un driver adapter (voir src/infra/prisma/prisma.service.ts).
 *
 * ── Pourquoi une URL à part pour le CLI ─────────────────────────────────────
 * En production, l'application passe par le pooler de Neon (PgBouncer) :
 * c'est lui qui absorbe les connexions des instances serverless. Une
 * migration, elle, tient des verrous et des transactions longues que le
 * pooler en mode transaction ne relaie pas correctement. Le CLI prend donc la
 * connexion DIRECTE quand elle existe, et retombe sur `DATABASE_URL` sinon —
 * le cas d'une base locale, où les deux ne font qu'un.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
});
