import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Redirect,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import {
  newsletterSubscribeSchema,
  newsletterTokenSchema,
  publicTokenSchema,
  updateAccountNewsletterSchema,
} from '@nexakabi/contracts';
import type { Env } from '../../config/env';
import { publicWebUrl } from '../../config/public-urls';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { NewsletterSubscriptionsService } from './newsletter-subscriptions.service';

class SubscribeDto extends createZodDto(newsletterSubscribeSchema) {}
class TokenDto extends createZodDto(newsletterTokenSchema) {}
class AccountNewsletterDto extends createZodDto(updateAccountNewsletterSchema) {}

/**
 * Newsletter, côté public : s'inscrire, confirmer, partir.
 *
 * Aucune route ici n'exige de compte : la newsletter s'adresse aussi à qui
 * n'a jamais acheté de billet, et un lien de désabonnement doit marcher
 * depuis n'importe quelle boîte de réception, connecté ou non.
 */
@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  private readonly webUrl: string;

  constructor(
    private readonly subscriptions: NewsletterSubscriptionsService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = publicWebUrl(config);
  }

  /**
   * Inscription depuis le formulaire du site.
   *
   * Répond toujours pareil : la réponse ne dit pas si l'adresse était déjà
   * connue. L'envoi du lien est lui-même limité par adresse (voir le service) :
   * ce plafond-ci ne protège que l'API.
   */
  @Public()
  @Post('subscriptions')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'S’inscrire à la newsletter (lien de confirmation envoyé)' })
  async subscribe(@Body() body: SubscribeDto): Promise<{ ok: true }> {
    await this.subscriptions.subscribePublic(body.email);
    return { ok: true };
  }

  @Public()
  @Get('subscription')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ce que désigne un lien reçu par e-mail (adresse masquée)' })
  describe(@Query('token') token?: string) {
    return this.subscriptions.describeToken(parseToken(token));
  }

  @Public()
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirmer son adresse' })
  confirm(@Body() body: TokenDto) {
    return this.subscriptions.confirm(body.token);
  }

  /**
   * Désabonnement — depuis la page du site, ou en un clic depuis la boîte de
   * réception.
   *
   * Le client de messagerie (Gmail, Yahoo…) appelle cette adresse en POST,
   * jeton dans l'URL et corps `List-Unsubscribe=One-Click` (RFC 8058) ; la
   * page du site envoie le jeton dans un corps JSON. Les deux mènent ici.
   */
  @Public()
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Se désabonner (page du site ou désabonnement en un clic)' })
  unsubscribe(@Query('token') queryToken: string | undefined, @Body() body: unknown) {
    const bodyToken =
      typeof body === 'object' && body !== null && 'token' in body
        ? String((body as { token: unknown }).token)
        : undefined;

    return this.subscriptions.unsubscribe(parseToken(queryToken ?? bodyToken));
  }

  /**
   * Un lien de désabonnement ouvert tel quel mène à la page du site.
   *
   * Un GET ne désabonne jamais : les antivirus et les aperçus de liens ouvrent
   * les URL d'un e-mail avant l'utilisateur, et chacun le désabonnerait à son
   * insu. C'est la page qui demande la confirmation.
   */
  @Public()
  @Get('unsubscribe')
  @Redirect()
  goToUnsubscribePage(@Query('token') token?: string): { url: string } {
    return {
      url: `${this.webUrl}/newsletter/desabonnement${
        token ? `?t=${encodeURIComponent(token)}` : ''
      }`,
    };
  }
}

/** L'abonnement du participant connecté, piloté depuis ses réglages. */
@ApiTags('Newsletter')
@Controller('me/newsletter')
export class AccountNewsletterController {
  constructor(private readonly subscriptions: NewsletterSubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Mon abonnement à la newsletter' })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.accountStatus(user.id);
  }

  @Put()
  @ApiOperation({
    summary: 'M’abonner ou me désabonner',
    description:
      'L’abonnement porte sur l’adresse du compte et part en attente de confirmation : un lien est envoyé à cette adresse.',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AccountNewsletterDto,
    @Query('origine') origin?: string,
  ) {
    return body.subscribed
      ? this.subscriptions.subscribeAccount(
          user.id,
          origin === 'inscription' ? 'SIGNUP' : 'ACCOUNT',
        )
      : this.subscriptions.unsubscribeAccount(user.id);
  }
}

function parseToken(token: string | undefined): string {
  const parsed = publicTokenSchema.safeParse(token);

  if (!parsed.success) {
    throw new BadRequestException(
      'Ce lien n’est pas valable. Il a peut-être été mal copié depuis l’e-mail.',
    );
  }

  return parsed.data;
}
