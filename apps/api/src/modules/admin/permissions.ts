import {
  ADMIN_ACCESS_LEVELS,
  ADMIN_SPACE_KEYS,
  type AdminAccess,
  type AdminAccessLevel,
  type AdminSpace,
} from '@nexakabi/contracts';

/**
 * Forme de stockage des droits d'un employé.
 *
 * `AdminCredential.permissions` est une liste de chaînes — `events:read`,
 * `payouts:act`, `money` — plutôt qu'une colonne JSON : lisible dans un
 * export, filtrable en SQL (`'money' = ANY(permissions)`), et sans schéma à
 * faire évoluer quand un espace s'ajoute. Ces deux fonctions sont les seules
 * à connaître ce format ; tout le reste parle en `AdminAccess`.
 */

const MONEY = 'money';

export function readPermissions(entries: readonly string[]): {
  access: AdminAccess;
  canMoveMoney: boolean;
} {
  const access: AdminAccess = {};
  let canMoveMoney = false;

  for (const entry of entries) {
    if (entry === MONEY) {
      canMoveMoney = true;
      continue;
    }

    const [space, level] = entry.split(':');

    if (isSpace(space) && isLevel(level)) {
      // `act` l'emporte sur `read` si les deux figurent : le droit le plus
      // large est celui qu'on a voulu donner en dernier.
      if (access[space] !== 'act') access[space] = level;
    }
  }

  return { access, canMoveMoney };
}

export function writePermissions(access: AdminAccess, canMoveMoney: boolean): string[] {
  const entries: string[] = [];

  for (const space of ADMIN_SPACE_KEYS) {
    const level = access[space];
    if (level) entries.push(`${space}:${level}`);
  }

  if (canMoveMoney) entries.push(MONEY);

  return entries;
}

function isSpace(value: string | undefined): value is AdminSpace {
  return value !== undefined && (ADMIN_SPACE_KEYS as readonly string[]).includes(value);
}

function isLevel(value: string | undefined): value is AdminAccessLevel {
  return value !== undefined && (ADMIN_ACCESS_LEVELS as readonly string[]).includes(value);
}
