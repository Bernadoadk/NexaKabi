/**
 * Référentiels de la plateforme.
 *
 * ── Ce que ce fichier crée, et rien d'autre ───────────────────────────────
 * Les catégories d'événements et les villes de lancement — les deux listes
 * qu'aucun écran ne permet de saisir et sans lesquelles aucun événement ne
 * peut être créé. Elles viennent du cahier des charges (§6 et §57), pas d'un
 * scénario de démonstration.
 *
 * ── Ce qu'il ne crée PLUS ─────────────────────────────────────────────────
 * Aucun compte, aucune organisation, aucun événement, aucune commande. Le
 * produit se teste sur des données réelles, créées par ses propres écrans :
 * un organisateur qui s'inscrit, une organisation qu'il crée, un événement
 * qu'il publie, un billet qu'on lui achète. Un jeu de données fictif donne
 * l'illusion d'un produit qui marche sans jamais éprouver le chemin que ses
 * utilisateurs emprunteront.
 *
 * Le seul compte amorcé par script est le superadministrateur, via
 * `src/scripts/create-admin.ts` — la console ne peut pas se créer elle-même.
 *
 * Le seed est IDEMPOTENT : le relancer ne duplique rien.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL manquante. Copiez .env.example vers .env.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Catégories du cahier des charges §6. La couleur sert de plaque de repli. */
const CATEGORIES: ReadonlyArray<readonly [string, string, string]> = [
  ['musique', 'Musique & concerts', '#3D1E4A'],
  ['festivals', 'Festivals', '#1E1A48'],
  ['soirees', 'Soirées', '#2A1140'],
  ['business', 'Business', '#0B3C5D'],
  ['tech', 'Technologie', '#0B3C5D'],
  ['conferences', 'Conférences', '#123B54'],
  ['formation', 'Formation', '#14432F'],
  ['sport', 'Sport', '#0F3B2E'],
  ['culture', 'Art & culture', '#4A1E2E'],
  ['mode', 'Mode', '#4A1E3D'],
  ['gastronomie', 'Gastronomie', '#4A2E1E'],
  ['religion', 'Religion', '#1E2E4A'],
  ['universitaire', 'Événements universitaires', '#1E3A4A'],
  ['networking', 'Networking', '#2E1E4A'],
  ['famille', 'Enfants & famille', '#4A3A1E'],
];

/** Villes de lancement (cahier des charges §57) puis principales agglomérations. */
const CITIES: ReadonlyArray<readonly [string, string]> = [
  ['cotonou', 'Cotonou'],
  ['abomey-calavi', 'Abomey-Calavi'],
  ['porto-novo', 'Porto-Novo'],
  ['parakou', 'Parakou'],
  ['ouidah', 'Ouidah'],
  ['bohicon', 'Bohicon'],
  ['natitingou', 'Natitingou'],
];

async function main(): Promise<void> {
  console.warn('Amorçage des référentiels…');

  for (const [index, [slug, name, colorToken]] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug },
      create: { slug, name, colorToken, position: index },
      update: { name, colorToken, position: index },
    });
  }

  for (const [index, [slug, name]] of CITIES.entries()) {
    await prisma.city.upsert({
      where: { slug },
      create: { slug, name, position: index },
      update: { name, position: index },
    });
  }

  console.warn(`  ${CATEGORIES.length} catégories, ${CITIES.length} villes`);
  console.warn('Terminé. Aucune donnée de démonstration : le produit se teste en réel.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
