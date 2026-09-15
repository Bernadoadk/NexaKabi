import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Configuration Prisma (CLI et migrations).
 *
 * Depuis Prisma 7, l'URL de connexion ne figure plus dans `schema.prisma` :
 * elle est déclarée ici pour les migrations, et fournie au client applicatif
 * par un driver adapter (voir src/infra/prisma/prisma.service.ts).
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
