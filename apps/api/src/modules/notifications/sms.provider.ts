import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OtpChannel } from '@nexakabi/contracts';
import type { Env } from '../../config/env';

export interface SendMessageInput {
  /** Numéro au format E.164. */
  readonly phone: string;
  readonly channel: OtpChannel;
  /** Corps déjà composé, en français. Titre et texte séparés par un saut de ligne. */
  readonly text: string;
}

export interface SendCodeInput {
  /** Numéro au format E.164. */
  readonly phone: string;
  readonly code: string;
  readonly channel: OtpChannel;
  readonly expiresInSeconds: number;
}

/**
 * Envoi des codes à 6 chiffres.
 *
 * Abstraction volontairement minimale : le choix de l'agrégateur SMS et la
 * validation de WhatsApp Business API sont des démarches longues, menées en
 * parallèle du développement (voir docs/DEVELOPMENT_ROADMAP.md §4). Le produit
 * se construit entièrement avec l'implémentation `console`.
 */
export abstract class SmsProvider {
  abstract readonly code: string;
  abstract send(input: SendCodeInput): Promise<void>;
  /** Vrai si le code peut être renvoyé au client, pour le développement. */
  abstract readonly exposesCode: boolean;

  /**
   * Envoi d'un message libre — notifications, pas codes de connexion.
   *
   * ── Pourquoi une méthode distincte de `send` ────────────────────────────
   * Les deux passent par le même opérateur, mais rien d'autre ne les
   * rapproche. Un code de connexion est court, urgent, et sa non-livraison
   * bloque immédiatement quelqu'un devant un écran ; une notification est
   * plus longue, tolère un retard, et son échec se rattrape plus tard.
   *
   * Les agrégateurs le reflètent : les codes empruntent souvent une route
   * transactionnelle prioritaire, facturée différemment. Les fusionner
   * derrière une signature commune obligerait à réintroduire la distinction
   * par un drapeau, ce qui revient au même en moins lisible.
   */
  abstract sendMessage(input: SendMessageInput): Promise<void>;
}

/**
 * Fournisseur de développement : écrit le code dans les journaux plutôt que de
 * l'envoyer. Refuse de fonctionner en production.
 */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  readonly code = 'console';
  readonly exposesCode: boolean;

  private readonly logger = new Logger(ConsoleSmsProvider.name);

  constructor(config: ConfigService<Env, true>) {
    super();
    const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

    if (isProduction) {
      throw new Error(
        "Le fournisseur SMS « console » est interdit en production : il n'envoie rien " +
          'et divulgue les codes dans les journaux.',
      );
    }

    this.exposesCode = true;
  }

  async send({ phone, code, channel }: SendCodeInput): Promise<void> {
    this.logger.warn(`[${channel}] Code pour ${phone} : ${code}`);
    return Promise.resolve();
  }

  async sendMessage({ phone, channel, text }: SendMessageInput): Promise<void> {
    // Sur une seule ligne : un journal multiligne devient illisible dès qu'un
    // second processus écrit en même temps.
    this.logger.log(`[${channel}] → ${phone} : ${text.split('\n').join(' · ')}`);
    return Promise.resolve();
  }
}
