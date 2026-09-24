import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  PAYMENT_SECURITY_NOTICE,
  getPaymentMethodDefinition,
  getPaymentProviderDefinition,
  isPaymentProviderActive,
  paymentMethodRequiresPhone,
  providerAcceptsCurrency,
  resolveProviderMethodCode,
  type CheckoutPaymentMethod,
  type CheckoutPaymentMethods,
  type CountryConfiguration,
  type CountryPaymentMethod,
  type PaymentAvailability,
  type PaymentMethodCode,
  type PaymentMethodKind,
  type PaymentProviderCode,
  type PayoutMethod,
  type PayoutMethods,
  type ProviderSyncResult,
  type UpsertCountryPaymentMethodInput,
} from '@nexakabi/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { CountryPaymentMethod as CountryPaymentMethodRow } from '../../generated/prisma/client';
import { CountriesService, toCountry } from '../countries/countries.service';
import { PaymentProviderRegistry } from './provider.registry';
import type {
  PaymentProvider,
  ProviderAvailability,
  ProviderMethod,
} from './providers/payment-provider';

/** Un moyen résolu : le prestataire qui le traite, et comment le lui nommer. */
export interface ResolvedRoute {
  readonly provider: PaymentProvider;
  readonly method: ProviderMethod;
  readonly countryCode: string;
  readonly currency: string;
}

/**
 * Routage des paiements : pays → moyen → prestataire.
 *
 * ── Le seul endroit qui décide « qui traite quoi » ──────────────────────────
 * Le tunnel demande « quels moyens proposer pour cette commande ? » ; le
 * paiement demande « qui encaisse MTN MoMo au Bénin ? » ; le retrait demande
 * « qui verse sur Wave au Sénégal ? ». Les trois réponses viennent d'ici, et
 * d'ici seulement, lues dans `CountryPaymentMethod`. Aucun service métier
 * ne connaît un prestataire par son nom.
 *
 * ── Collecte et versement, deux questions distinctes ────────────────────────
 * Une ligne de configuration porte deux drapeaux indépendants. Le moyen du
 * participant et celui de l'organisateur ne se rencontrent jamais : l'un
 * paie par carte, l'autre reçoit sur MTN, et rien ici ne suppose le contraire.
 *
 * ── Ce qui rend un moyen effectivement disponible à l'ENCAISSEMENT ──────────
 *   1. la ligne existe pour ce pays ;
 *   2. l'administrateur l'a ouverte (décision) ;
 *   3. le prestataire ne l'a pas contredite à la dernière synchronisation
 *      (constat : `null` vaut « pas encore su », donc pas d'objection) ;
 *   4. le prestataire est ACTIF et BRANCHÉ — ses clés sont renseignées.
 *      Aucun paiement n'est jamais simulé : sans prestataire, le moyen
 *      disparaît de l'écran.
 * Un moyen qui échoue à l'un des quatre n'est pas proposé : mieux vaut un
 * choix en moins qu'un paiement qui échoue après la saisie du numéro.
 *
 * Au VERSEMENT, seules la décision et le constat comptent : un retrait
 * qu'aucun prestataire ne sait exécuter se fait à la main, depuis la console.
 */
@Injectable()
export class PaymentRoutingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly countries: CountriesService,
  ) {}

  /**
   * Le constat du prestataire se relit tout seul : au démarrage, puis chaque
   * heure. Sans cela, un moyen fermé sur le compte marchand resterait proposé
   * jusqu'à ce que quelqu'un pense à cliquer « Synchroniser ». L'échec ne
   * bloque rien — il se lit dans les journaux, avec sa cause.
   */
  onApplicationBootstrap(): void {
    void this.syncConnectedProviders();
    // Sans ce premier relevé, un opérateur tombé pendant que l'API était
    // arrêtée resterait proposé jusqu'au passage suivant.
    void this.syncAvailability();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncConnectedProviders(): Promise<void> {
    for (const code of this.registry.availableCodes) {
      // Un prestataire hérité ne route plus rien : constater ce que son compte
      // marchand sait faire ne servirait qu'à produire un avertissement par
      // heure sur une intégration qu'on a mise de côté.
      if (!isPaymentProviderActive(code)) continue;

      // Un prestataire qui ne sait pas décrire son compte marchand — Kkiapay
      // n'a pas d'API pour cela — se configure à la main. Rien à constater, et
      // surtout pas un avertissement toutes les heures.
      if (!this.registry.get(code).listMerchantMethods) continue;

      try {
        const result = await this.syncProvider(code);
        if (result.unknown.length > 0) {
          this.logger.log(
            `${code} propose aussi, sans ligne configurée : ${result.unknown
              .map((entry) => `${entry.providerMethodCode} (${entry.countryCode})`)
              .join(', ')}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Synchronisation ${code} impossible : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Relève l'état opérationnel des opérateurs chez les prestataires branchés
   * qui le publient — Kkiapay ne le publie pas : pour lui, ce relevé ne fait
   * rien, et ses moyens restent à `UNKNOWN`, donc proposés.
   *
   * Toutes les cinq minutes : une panne d'opérateur se compte en dizaines de
   * minutes — interroger plus souvent ne dirait rien de plus.
   *
   * Un prestataire injoignable ne ferme RIEN : les états relevés restent ceux
   * du dernier passage. Fermer tous les moyens parce qu'une requête a échoué
   * serait transformer notre propre incident en panne de paiement.
   */
  @Cron('0 */5 * * * *')
  async syncAvailability(): Promise<void> {
    for (const code of this.registry.availableCodes) {
      const provider = this.registry.get(code);
      if (!provider.listAvailability) continue;

      try {
        const statuses = await provider.listAvailability();
        const changed = await this.applyAvailability(code, statuses);

        if (changed > 0) {
          this.logger.log(`Disponibilité ${code} : ${changed} moyen(s) ont changé d'état`);
        }
      } catch (error) {
        this.logger.warn(
          `Relevé de disponibilité ${code} impossible : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** Consigne un relevé. Renvoie le nombre de lignes dont l'état a changé. */
  private async applyAvailability(
    providerCode: PaymentProviderCode,
    entries: ProviderAvailability[],
  ): Promise<number> {
    if (entries.length === 0) return 0;

    const rows = await this.prisma.countryPaymentMethod.findMany({ where: { providerCode } });
    const checkedAt = new Date();
    let changed = 0;

    for (const row of rows) {
      const forRow = entries.filter(
        (entry) =>
          entry.countryCode === row.countryCode &&
          entry.providerMethodCode === row.providerMethodCode,
      );

      // Un moyen que le relevé ne mentionne pas garde son état : son absence
      // peut vouloir dire « pas concerné », jamais « en panne ».
      if (forRow.length === 0) continue;

      const collection = forRow.find((entry) => entry.operation === 'COLLECTION')?.status;
      const payout = forRow.find((entry) => entry.operation === 'PAYOUT')?.status;

      const next = {
        collectionAvailability: collection ?? row.collectionAvailability,
        payoutAvailability: payout ?? row.payoutAvailability,
      };

      if (
        next.collectionAvailability !== row.collectionAvailability ||
        next.payoutAvailability !== row.payoutAvailability
      ) {
        changed += 1;
        this.logger.log(
          `${row.countryCode} · ${row.methodCode} : encaissement ${row.collectionAvailability} → ` +
            `${next.collectionAvailability}, versement ${row.payoutAvailability} → ${next.payoutAvailability}`,
        );
      }

      await this.prisma.countryPaymentMethod.update({
        where: { id: row.id },
        data: { ...next, availabilityCheckedAt: checkedAt },
      });
    }

    return changed;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Collecte
  // ───────────────────────────────────────────────────────────────────────────

  /** Moyens de paiement à proposer au participant pour un pays. */
  async listCollectionMethods(countryCode: string): Promise<CheckoutPaymentMethods> {
    const country = await this.countries.requireActive(countryCode);
    const rows = await this.rowsFor(country.code);

    const seen = new Set<string>();
    const methods: CheckoutPaymentMethod[] = [];

    for (const row of rows) {
      if (seen.has(row.methodCode)) continue;
      if (!this.isEffective(row, 'collection')) continue;

      const definition = getPaymentMethodDefinition(row.methodCode);
      const provider = this.providerFor(row);
      if (!definition || !provider) continue;

      // Comment ce moyen se valide chez le prestataire qui le traite ICI :
      // l'écran demande le numéro, envoie sur une page, ou ouvre la fenêtre
      // du prestataire — sans jamais savoir de quel prestataire il s'agit.
      const flow = provider.checkoutFlow(definition.kind);

      seen.add(row.methodCode);
      methods.push({
        code: definition.code,
        label: definition.label,
        description: definition.description,
        kind: definition.kind,
        group: definition.group,
        flow,
        requiresPhone: flow === 'push' && paymentMethodRequiresPhone(definition.kind),
        redirects: flow === 'redirect',
        logo: definition.logo ?? null,
        brandColor: definition.brandColor ?? null,
        brandColorIsLight: definition.brandColorIsLight ?? false,
        availability: this.availabilityOf(row, 'collection'),
      });
    }

    return {
      countryCode: country.code,
      currency: country.currency,
      dialCode: country.dialCode,
      methods,
      notice: PAYMENT_SECURITY_NOTICE,
    };
  }

  /** Le prestataire qui encaisse CE moyen dans CE pays, ou une erreur claire. */
  async resolveCollection(
    countryCode: string,
    methodCode: PaymentMethodCode,
  ): Promise<ResolvedRoute> {
    const country = await this.countries.requireActive(countryCode);

    const rows = await this.rowsFor(country.code, methodCode);
    const row = rows.find((entry) => this.isEffective(entry, 'collection'));

    if (!row) {
      throw new BadRequestException(
        "Ce moyen de paiement n'est pas disponible pour cet événement. Choisis-en un autre.",
      );
    }

    return this.routeFor(row, country.currency);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Versement
  // ───────────────────────────────────────────────────────────────────────────

  /** Moyens de réception qu'un organisateur de ce pays peut enregistrer. */
  async listPayoutMethods(countryCode: string): Promise<PayoutMethods> {
    const country = await this.countries.requireActive(countryCode);
    const rows = await this.rowsFor(country.code);

    const seen = new Set<string>();
    const methods: PayoutMethod[] = [];

    for (const row of rows) {
      if (seen.has(row.methodCode)) continue;
      if (!offersPayout(row)) continue;

      const definition = getPaymentMethodDefinition(row.methodCode);
      if (!definition) continue;

      seen.add(row.methodCode);
      methods.push({
        code: definition.code,
        label: definition.label,
        kind: definition.kind,
        requiresPhone: paymentMethodRequiresPhone(definition.kind),
        requiresBankDetails: definition.kind === 'BANK_TRANSFER',
        // Automatique si un prestataire branché sait verser ; sinon le
        // virement se fait à la main et s'enregistre dans la console. Un
        // virement bancaire l'est toujours : aucun prestataire ne l'exécute.
        automatic:
          definition.kind !== 'BANK_TRANSFER' &&
          this.providerFor(row)?.capabilities.payout === true,
      });
    }

    return {
      countryCode: country.code,
      currency: country.currency,
      dialCode: country.dialCode,
      methods,
    };
  }

  /**
   * Le prestataire qui verse sur CE moyen dans CE pays.
   *
   * `null` signifie « à la main » : un virement bancaire, ou un moyen ouvert
   * en versement sans prestataire branché. L'administrateur fait le virement
   * et l'enregistre — le retrait ne reste jamais sans issue.
   */
  async resolvePayout(
    countryCode: string,
    methodCode: PaymentMethodCode,
  ): Promise<ResolvedRoute | null> {
    const country = await this.countries.find(countryCode);
    if (!country) return null;

    const rows = await this.rowsFor(country.code, methodCode);
    const row = rows.find(offersPayout);

    if (!row) return null;

    // Un virement bancaire se fait depuis la banque, jamais par un prestataire.
    if (row.kind === 'BANK_TRANSFER') return null;

    const provider = this.providerFor(row);
    if (!provider?.capabilities.payout) return null;

    return this.routeFor(row, country.currency);
  }

  /** Vrai si le pays autorise encore ce moyen en versement. */
  async isPayoutMethodOpen(countryCode: string, methodCode: string): Promise<boolean> {
    const rows = await this.rowsFor(countryCode.toUpperCase(), methodCode);
    return rows.some(offersPayout);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Administration
  // ───────────────────────────────────────────────────────────────────────────

  /** Configuration complète de tous les pays, pour la console. */
  async listConfigurations(): Promise<CountryConfiguration[]> {
    const countries = await this.prisma.country.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        paymentMethods: { orderBy: [{ position: 'asc' }, { methodCode: 'asc' }] },
        _count: { select: { cities: { where: { isActive: true } } } },
      },
    });

    return countries.map((country) => ({
      ...toCountry(country),
      methods: country.paymentMethods.map((row) => this.toConfiguredMethod(row)),
      cityCount: country._count.cities,
    }));
  }

  /** Crée ou met à jour une ligne pays × moyen × prestataire. */
  async upsertMethod(
    countryCode: string,
    input: UpsertCountryPaymentMethodInput,
  ): Promise<CountryPaymentMethod> {
    const country = await this.countries.find(countryCode);
    if (!country) throw new NotFoundException(`Le pays ${countryCode} est inconnu.`);

    const definition = getPaymentMethodDefinition(input.methodCode);
    const provider = getPaymentProviderDefinition(input.providerCode);
    // Le code du moyen peut dépendre du PAYS chez certains prestataires : la
    // table du prestataire le dit, pays par pays.
    const providerMethodCode = resolveProviderMethodCode(
      input.providerCode,
      input.methodCode,
      country.code,
    );

    if (!definition || !provider || !providerMethodCode) {
      throw new BadRequestException(
        `${provider?.label ?? input.providerCode} ne prend pas en charge ` +
          `${definition?.label ?? input.methodCode} pour ce pays (${country.name}).`,
      );
    }

    // Kkiapay n'encaisse qu'en francs CFA : lui confier la Guinée ferait
    // échouer chaque paiement, un par un, après le choix de l'acheteur.
    if (!providerAcceptsCurrency(input.providerCode, country.currency)) {
      throw new BadRequestException(
        `${provider.label} n'encaisse pas en ${country.currency} : il ne peut pas traiter ` +
          `les paiements de ce pays (${country.name}).`,
      );
    }

    const row = await this.prisma.countryPaymentMethod.upsert({
      where: {
        countryCode_methodCode_providerCode: {
          countryCode: country.code,
          methodCode: input.methodCode,
          providerCode: input.providerCode,
        },
      },
      create: {
        countryCode: country.code,
        methodCode: input.methodCode,
        kind: definition.kind,
        providerCode: input.providerCode,
        providerMethodCode,
        collectionEnabled: input.collectionEnabled,
        payoutEnabled: input.payoutEnabled,
        position: input.position,
      },
      update: {
        kind: definition.kind,
        providerMethodCode,
        collectionEnabled: input.collectionEnabled,
        payoutEnabled: input.payoutEnabled,
        position: input.position,
      },
    });

    return this.toConfiguredMethod(row);
  }

  async removeMethod(countryCode: string, id: string): Promise<void> {
    const deleted = await this.prisma.countryPaymentMethod.deleteMany({
      where: { id, countryCode: countryCode.toUpperCase() },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Cette ligne de configuration n’existe pas.');
    }
  }

  /**
   * Relit chez le prestataire ce que le compte marchand sait faire, et le
   * consigne sur chaque ligne de configuration.
   *
   * Ne change AUCUNE décision : une ligne ouverte par l'administrateur reste
   * ouverte, mais si le prestataire dit « je ne collecte pas ça », elle cesse
   * d'être proposée — et l'écran le montre, plutôt que de laisser un paiement
   * échouer après la saisie du numéro.
   */
  async syncProvider(providerCode: PaymentProviderCode): Promise<ProviderSyncResult> {
    if (!this.registry.has(providerCode)) {
      throw new BadRequestException(
        `${providerCode} n'est pas branché : renseigne ses clés avant de synchroniser.`,
      );
    }

    const provider = this.registry.get(providerCode);

    if (!provider.listMerchantMethods) {
      throw new BadRequestException(`${providerCode} ne sait pas décrire son compte marchand.`);
    }

    const merchantMethods = await provider.listMerchantMethods();
    const syncedAt = new Date();
    const rows = await this.prisma.countryPaymentMethod.findMany({ where: { providerCode } });

    const known = new Map(rows.map((row) => [`${row.countryCode}:${row.providerMethodCode}`, row]));

    let updated = 0;
    const unknown: ProviderSyncResult['unknown'] = [];
    const seen = new Set<string>();

    for (const method of merchantMethods) {
      const key = `${method.countryCode}:${method.providerMethodCode}`;
      const row = known.get(key);
      seen.add(key);

      if (!row) {
        unknown.push({
          countryCode: method.countryCode,
          providerMethodCode: method.providerMethodCode,
          collection: method.collection,
          payout: method.payout,
        });
        continue;
      }

      await this.prisma.countryPaymentMethod.update({
        where: { id: row.id },
        data: {
          providerCollectionEnabled: method.collection,
          providerPayoutEnabled: method.payout,
          providerSyncedAt: syncedAt,
        },
      });
      updated += 1;
    }

    // Une ligne configurée que le prestataire ne mentionne pas : il ne la
    // propose pas.
    for (const row of rows) {
      const key = `${row.countryCode}:${row.providerMethodCode}`;
      if (seen.has(key)) continue;

      await this.prisma.countryPaymentMethod.update({
        where: { id: row.id },
        data: {
          providerCollectionEnabled: false,
          providerPayoutEnabled: false,
          providerSyncedAt: syncedAt,
        },
      });
      updated += 1;
    }

    this.logger.log(
      `Synchronisation ${providerCode} : ${updated} ligne(s) mise(s) à jour, ${unknown.length} moyen(s) non configuré(s)`,
    );

    return { providerCode, syncedAt: syncedAt.toISOString(), updated, unknown };
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async rowsFor(
    countryCode: string,
    methodCode?: string,
  ): Promise<CountryPaymentMethodRow[]> {
    return this.prisma.countryPaymentMethod.findMany({
      where: { countryCode, ...(methodCode ? { methodCode } : {}) },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Le prestataire qui traite une ligne : celui qu'elle nomme, s'il est
   * actif ET branché. Personne ne le remplace : c'est l'environnement de ses
   * clés — bac à sable ou production — qui dit si l'argent est réel.
   */
  private providerFor(row: CountryPaymentMethodRow): PaymentProvider | null {
    // Un prestataire HÉRITÉ ne reçoit plus rien de neuf, même si ses clés
    // sont encore là pour relire son historique.
    if (!isPaymentProviderActive(row.providerCode)) {
      return null;
    }

    const code = row.providerCode as PaymentProviderCode;

    return this.registry.has(code) ? this.registry.get(code) : null;
  }

  private isEffective(row: CountryPaymentMethodRow, side: 'collection' | 'payout'): boolean {
    // Un retrait n'a besoin d'aucun prestataire branché : celui qu'aucun ne
    // sait exécuter se fait à la main. Est « effectif » ce qui est proposé
    // aux organisateurs — exactement ce que `listPayoutMethods` leur montre.
    if (side === 'payout') return offersPayout(row);

    if (!row.collectionEnabled || row.providerCollectionEnabled === false) return false;

    // Opérateur en panne : le moyen sort de l'écran le temps qu'elle dure.
    // Le laisser afficher ferait saisir un numéro, attendre trois minutes et
    // repartir sur un échec — la façon la plus sûre de perdre une vente.
    // `DELAYED` reste proposé, avec sa mention : il fonctionne, plus lentement.
    if (this.availabilityOf(row, 'collection') === 'CLOSED') return false;

    return this.providerFor(row) !== null;
  }

  private availabilityOf(
    row: CountryPaymentMethodRow,
    side: 'collection' | 'payout',
  ): PaymentAvailability {
    return (
      side === 'collection' ? row.collectionAvailability : row.payoutAvailability
    ) as PaymentAvailability;
  }

  private routeFor(row: CountryPaymentMethodRow, currency: string): ResolvedRoute {
    const provider = this.providerFor(row);

    if (!provider) {
      throw new BadRequestException(
        "Ce moyen de paiement n'est pas disponible pour le moment. Choisis-en un autre.",
      );
    }

    return {
      provider,
      method: {
        code: row.methodCode as PaymentMethodCode,
        kind: row.kind as PaymentMethodKind,
        providerMethodCode: row.providerMethodCode,
      },
      countryCode: row.countryCode,
      currency,
    };
  }

  private toConfiguredMethod(row: CountryPaymentMethodRow): CountryPaymentMethod {
    const definition = getPaymentMethodDefinition(row.methodCode);

    return {
      id: row.id,
      countryCode: row.countryCode,
      methodCode: row.methodCode as PaymentMethodCode,
      label: definition?.label ?? row.methodCode,
      kind: row.kind as PaymentMethodKind,
      providerCode: row.providerCode as PaymentProviderCode,
      providerMethodCode: row.providerMethodCode,
      collectionEnabled: row.collectionEnabled,
      payoutEnabled: row.payoutEnabled,
      providerCollectionEnabled: row.providerCollectionEnabled,
      providerPayoutEnabled: row.providerPayoutEnabled,
      providerSyncedAt: row.providerSyncedAt?.toISOString() ?? null,
      collectionAvailability: this.availabilityOf(row, 'collection'),
      payoutAvailability: this.availabilityOf(row, 'payout'),
      availabilityCheckedAt: row.availabilityCheckedAt?.toISOString() ?? null,
      providerStatus: isPaymentProviderActive(row.providerCode) ? 'ACTIVE' : 'LEGACY',
      position: row.position,
      effectiveCollection: this.isEffective(row, 'collection'),
      effectivePayout: this.isEffective(row, 'payout'),
    };
  }
}

/**
 * Ce moyen est-il proposé aux organisateurs pour leurs retraits ?
 *
 * La décision de l'administrateur, et le constat du prestataire quand il en
 * a fait un — rien d'autre. Un seul prédicat pour la liste des moyens, la
 * résolution d'un retrait et l'écran de configuration : trois endroits qui
 * ne peuvent plus diverger.
 */
function offersPayout(row: CountryPaymentMethodRow): boolean {
  return row.payoutEnabled && row.providerPayoutEnabled !== false;
}
