import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  PAYMENT_METHOD_DEFINITIONS,
  PAYMENT_PROVIDER_DEFINITIONS,
  listProviderMethodCodes,
  paymentProviderSchema,
  updateCountrySchema,
  upsertCountryPaymentMethodSchema,
  type Country,
  type CountryConfiguration,
  type CountryPaymentMethod,
  type PaymentMethodDefinition,
  type PaymentProviderCode,
  type ProviderSyncResult,
} from '@nexakabi/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { CountriesService } from '../countries/countries.service';
import { PaymentRoutingService } from '../payments/payment-routing.service';
import { PaymentProviderRegistry } from '../payments/provider.registry';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { AdminSessionGuard, RequireAdminAccess, type AdminRequest } from './admin-session.guard';

class UpdateCountryDto extends createZodDto(updateCountrySchema) {}
class UpsertMethodDto extends createZodDto(upsertCountryPaymentMethodSchema) {}

/**
 * Pays & paiements — la configuration qui remplace le code.
 *
 * Ouvrir un pays, y proposer Wave, confier la carte à Bictorys, fermer un
 * moyen que le prestataire ne sait plus verser : tout se fait ici, et rien
 * ne se fait ailleurs. Chaque geste est tracé — il change ce que des
 * milliers de participants voient au moment de payer.
 */
@ApiTags('Administration · pays & paiements')
@Public()
@UseGuards(AdminSessionGuard)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly countries: CountriesService,
    private readonly routing: PaymentRoutingService,
    private readonly registry: PaymentProviderRegistry,
    private readonly audit: AuditService,
  ) {}

  @RequireAdminAccess('settings', 'read')
  @Get('countries')
  @ApiOperation({ summary: 'Pays et moyens de paiement configurés' })
  listCountries(): Promise<CountryConfiguration[]> {
    return this.routing.listConfigurations();
  }

  /** Ce que l'on PEUT configurer : catalogue des moyens, prestataires, branchés ou non. */
  @RequireAdminAccess('settings', 'read')
  @Get('catalogue')
  @ApiOperation({ summary: 'Catalogue des moyens et des prestataires' })
  catalogue(): {
    methods: readonly PaymentMethodDefinition[];
    providers: {
      code: PaymentProviderCode;
      label: string;
      connected: boolean;
      /** Sait décrire son compte marchand : le bouton « Synchroniser » a un sens. */
      canSync: boolean;
      status: 'ACTIVE' | 'LEGACY';
      methodCodes: string[];
      methodCodesByCountry?: Record<string, string[]>;
    }[];
  } {
    return {
      methods: PAYMENT_METHOD_DEFINITIONS,
      providers: PAYMENT_PROVIDER_DEFINITIONS.map((provider) => ({
        code: provider.code,
        label: provider.label,
        connected: this.registry.has(provider.code),
        // Kkiapay n'a aucune API qui décrive le compte marchand : lui proposer
        // « Synchroniser » ne produirait qu'un refus, à chaque clic.
        canSync:
          this.registry.has(provider.code) &&
          Boolean(this.registry.get(provider.code).listMerchantMethods),
        // `LEGACY` est exposé plutôt que filtré : la console doit pouvoir
        // EXPLIQUER une ligne héritée existante, sans la proposer à l'ajout.
        status: provider.status,
        // Tous les moyens qu'il traite QUELQUE PART : ce qui décrit le
        // prestataire, et ce sur quoi retombe un pays qu'il ne distingue pas.
        methodCodes: listProviderMethodCodes(provider.code),
        // Les pays où il en traite d'AUTRES — un prestataire ne propose pas
        // toujours les mêmes opérateurs d'un pays à l'autre. La console s'en
        // sert pour ne proposer que ce qui marchera vraiment dans le pays affiché.
        methodCodesByCountry: provider.methodCodesByCountry
          ? Object.fromEntries(
              Object.keys(provider.methodCodesByCountry).map((countryCode) => [
                countryCode,
                listProviderMethodCodes(provider.code, countryCode),
              ]),
            )
          : undefined,
      })),
    };
  }

  @RequireAdminAccess('settings', 'act')
  @Patch('countries/:code')
  @ApiOperation({ summary: 'Ouvrir, fermer ou réordonner un pays' })
  async updateCountry(
    @Param('code') code: string,
    @Body() body: UpdateCountryDto,
    @Req() request: AdminRequest,
  ): Promise<Country> {
    const country = await this.countries.update(code, body);

    await this.audit.record({
      action: AUDIT_ACTIONS.settingsCountryUpdated,
      entityType: 'Country',
      entityId: country.code,
      actorType: 'ADMIN',
      actorUserId: request.admin.id,
      changes: { ...body },
    });

    return country;
  }

  @RequireAdminAccess('settings', 'act')
  @Put('countries/:code/methods')
  @ApiOperation({ summary: 'Configurer un moyen de paiement dans un pays' })
  async upsertMethod(
    @Param('code') code: string,
    @Body() body: UpsertMethodDto,
    @Req() request: AdminRequest,
  ): Promise<CountryPaymentMethod> {
    const method = await this.routing.upsertMethod(code, body);

    await this.audit.record({
      action: AUDIT_ACTIONS.settingsPaymentMethodUpdated,
      entityType: 'CountryPaymentMethod',
      entityId: method.id,
      actorType: 'ADMIN',
      actorUserId: request.admin.id,
      changes: { ...body },
    });

    return method;
  }

  @RequireAdminAccess('settings', 'act')
  @Delete('countries/:code/methods/:id')
  @ApiOperation({ summary: 'Retirer un moyen de paiement d’un pays' })
  async removeMethod(
    @Param('code') code: string,
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ): Promise<{ removed: true }> {
    await this.routing.removeMethod(code, id);

    await this.audit.record({
      action: AUDIT_ACTIONS.settingsPaymentMethodRemoved,
      entityType: 'CountryPaymentMethod',
      entityId: id,
      actorType: 'ADMIN',
      actorUserId: request.admin.id,
      changes: { countryCode: code.toUpperCase() },
    });

    return { removed: true };
  }

  @RequireAdminAccess('settings', 'act')
  @Post('providers/:provider/sync')
  @ApiOperation({ summary: 'Relire ce que le compte marchand sait faire chez le prestataire' })
  async sync(
    @Param('provider') provider: string,
    @Req() request: AdminRequest,
  ): Promise<ProviderSyncResult> {
    const providerCode = paymentProviderSchema.parse(provider);
    const result = await this.routing.syncProvider(providerCode);

    await this.audit.record({
      action: AUDIT_ACTIONS.settingsProviderSynced,
      entityType: 'PaymentProvider',
      entityId: providerCode,
      actorType: 'ADMIN',
      actorUserId: request.admin.id,
      changes: { updated: result.updated, unknown: result.unknown.length },
    });

    return result;
  }
}
