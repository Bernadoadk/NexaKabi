import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';

/**
 * Génération et vérification des codes à 6 chiffres.
 *
 * Choix de hachage : HMAC-SHA256 avec un poivre serveur, et non Argon2.
 * L'espace des codes n'est que d'un million : une fonction lente ne protégerait
 * pas contre la force brute d'un attaquant ayant volé la base. Le poivre, lui,
 * rend le calcul impossible sans le secret du serveur — qui ne se trouve pas
 * dans la base. C'est la propriété recherchée.
 */
@Injectable()
export class OtpService {
  private readonly pepper: string;

  constructor(config: ConfigService<Env, true>) {
    this.pepper = config.get('OTP_PEPPER', { infer: true });
  }

  /**
   * Tire un code à 6 chiffres.
   * `randomInt` puise dans le générateur cryptographique : `Math.random` serait
   * prédictible et donc inacceptable pour une preuve d'identité.
   */
  generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /** Empreinte à stocker. Le code en clair ne quitte jamais la mémoire. */
  hash(code: string, phone: string): string {
    // Le numéro entre dans le calcul : une empreinte volée pour un numéro ne
    // peut pas être rejouée sur un autre.
    return createHmac('sha256', this.pepper).update(`${phone}:${code}`).digest('hex');
  }

  /** Comparaison à temps constant, pour ne rien révéler par la durée. */
  verify(code: string, phone: string, expectedHash: string): boolean {
    const candidate = Buffer.from(this.hash(code, phone), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');

    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  }
}
