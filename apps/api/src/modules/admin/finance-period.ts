import { BadRequestException } from '@nestjs/common';
import { financeDateSchema } from '@nexakabi/contracts';
import { BENIN_TIMEZONE } from '@nexakabi/utils';

/**
 * Une période de l'espace Finance, bornes comprises.
 *
 * ── Pourquoi l'heure de Porto-Novo ──────────────────────────────────────────
 * La plateforme compte ses journées à Porto-Novo : un billet acheté à 23 h 30
 * le 31 appartient au mois qui se termine, pas au suivant. Le Bénin vit à
 * UTC+1 toute l'année, sans heure d'été — le décalage est donc constant, et
 * écrit tel quel.
 */
export interface ResolvedPeriod {
  /** AAAA-MM-JJ, tel qu'affiché. */
  readonly from: string;
  readonly to: string;
  /** Instants UTC des bornes : début du premier jour, fin du dernier. */
  readonly start: Date;
  readonly end: Date;
}

const BENIN_OFFSET = '+01:00';

/** Aujourd'hui à Porto-Novo, au format AAAA-MM-JJ. */
export function todayInBenin(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BENIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Résout une période saisie. Sans bornes : le mois en cours, jusqu'à
 * aujourd'hui — c'est la question qu'on pose le plus souvent.
 */
export function resolvePeriod(from?: string, to?: string): ResolvedPeriod {
  const today = todayInBenin();
  const resolvedTo = to ?? today;
  const resolvedFrom = from ?? `${resolvedTo.slice(0, 7)}-01`;

  for (const value of [resolvedFrom, resolvedTo]) {
    if (!financeDateSchema.safeParse(value).success) {
      throw new BadRequestException(`Date invalide : « ${value} ». Format attendu : AAAA-MM-JJ.`);
    }
  }

  if (resolvedFrom > resolvedTo) {
    throw new BadRequestException('La fin de la période précède son début.');
  }

  const start = new Date(`${resolvedFrom}T00:00:00.000${BENIN_OFFSET}`);
  const end = new Date(`${resolvedTo}T23:59:59.999${BENIN_OFFSET}`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('Cette période ne correspond à aucune date réelle.');
  }

  return { from: resolvedFrom, to: resolvedTo, start, end };
}
