import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SPOTLIGHT_VIEWS_BATCH_MAX,
  type SpotlightClickTarget,
  type SpotlightFeed,
  type SpotlightSlide,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CountriesService } from '../countries/countries.service';
import { SpotlightSettingsService } from './spotlight-settings.service';
import { spotlightTarget, spotlightWithRelations, toSpotlightSlide } from './spotlights.mapper';

/** Mises en avant lues au plus par requête : de quoi remplir la une malgré les empêchées. */
const FEED_CANDIDATES = 40;

/**
 * La une, côté public : ce qui s'affiche, et ce qu'on en mesure.
 *
 * ── Ce que la mesure compte, et rien d'autre ────────────────────────────────
 * Des vues et des clics, par mise en avant et par jour. Ni cookie, ni
 * identifiant de visiteur : la console a besoin de savoir si la une sert, pas
 * de suivre qui que ce soit.
 */
@Injectable()
export class SpotlightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SpotlightSettingsService,
    private readonly countries: CountriesService,
  ) {}

  async feed(countryCode?: string): Promise<SpotlightFeed> {
    const now = new Date();
    const [settings, country] = await Promise.all([
      this.settings.get(),
      this.resolveCountry(countryCode),
    ]);

    const rows = await this.prisma.spotlight.findMany({
      ...spotlightWithRelations,
      where: {
        status: 'ACTIVE',
        countryCode: country,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      take: FEED_CANDIDATES,
    });

    /**
     * ── Une place payée passe toujours ─────────────────────────────────────
     * Les places vendues sont bornées par jour (`paidSlotsPerDay`, sous
     * `maxSlides`) : elles tiennent toutes. Les choix de l'équipe complètent
     * jusqu'au plafond — un coup de cœur de trop ne doit jamais pousser hors de
     * la une ce qu'un organisateur a payé. L'ordre réglé dans la console est
     * ensuite respecté entre toutes celles qui paraissent.
     */
    const visible = rows
      .map((row) => ({ row, slide: toSpotlightSlide(row, settings, now) }))
      .filter((entry): entry is { row: (typeof rows)[number]; slide: SpotlightSlide } =>
        Boolean(entry.slide),
      );

    const paid = visible.filter((entry) => entry.row.source === 'PAID');
    const editorial = visible.filter((entry) => entry.row.source !== 'PAID');

    const chosen = [...paid, ...editorial].slice(0, settings.maxSlides);
    const order = new Map(rows.map((row, position) => [row.id, position]));

    const slides = chosen
      .sort((a, b) => (order.get(a.row.id) ?? 0) - (order.get(b.row.id) ?? 0))
      .map((entry) => entry.slide);

    return { slideSeconds: settings.slideSeconds, slides };
  }

  /**
   * Vues accumulées par une page, en un envoi.
   *
   * Une seule requête, atomique : `ON CONFLICT` additionne au compteur du jour
   * au lieu d'échouer quand deux visiteurs ouvrent la page au même instant, et
   * le `SELECT` écarte d'office un identifiant qui ne désigne rien.
   */
  async recordViews(ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)].slice(0, SPOTLIGHT_VIEWS_BATCH_MAX);
    if (unique.length === 0) return;

    await this.prisma.$executeRaw`
      INSERT INTO "spotlight_daily_stat" ("spotlightId", "day", "views", "clicks")
      SELECT "id", ${utcDay(new Date())}::date, 1, 0
      FROM "spotlight"
      WHERE "id" = ANY(${unique}::text[])
      ON CONFLICT ("spotlightId", "day")
      DO UPDATE SET "views" = "spotlight_daily_stat"."views" + 1`;
  }

  /** Compte un clic et dit où il mène. */
  async recordClick(id: string): Promise<SpotlightClickTarget> {
    const row = await this.prisma.spotlight.findUnique({
      where: { id },
      select: { id: true, kind: true, externalUrl: true, event: { select: { slug: true } } },
    });

    const url = row ? spotlightTarget(row) : null;

    if (!row || !url) {
      throw new NotFoundException('Cette mise en avant n’existe plus.');
    }

    await this.prisma.$executeRaw`
      INSERT INTO "spotlight_daily_stat" ("spotlightId", "day", "views", "clicks")
      VALUES (${row.id}, ${utcDay(new Date())}::date, 0, 1)
      ON CONFLICT ("spotlightId", "day")
      DO UPDATE SET "clicks" = "spotlight_daily_stat"."clicks" + 1`;

    return { url };
  }

  /**
   * Le pays demandé s'il est ouvert, sinon le pays par défaut.
   *
   * Le site ne connaît pas encore le pays du visiteur : sans indication, la une
   * est celle du pays par défaut — le Bénin aujourd'hui.
   */
  private async resolveCountry(countryCode: string | undefined): Promise<string> {
    if (countryCode && /^[A-Za-z]{2}$/.test(countryCode)) {
      const country = await this.countries.find(countryCode);
      if (country?.isActive) return country.code;
    }

    return (await this.countries.getDefault()).code;
  }
}

/** Le jour UTC d'un instant, `AAAA-MM-JJ` : la clé des compteurs. */
function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
