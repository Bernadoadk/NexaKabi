import { Body, Controller, Get, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { createZodDto } from 'nestjs-zod';
import {
  pushSubscriptionInputSchema,
  pushUnsubscribeSchema,
  updateNotificationPreferencesSchema,
  userInterestsSchema,
} from '@nexakabi/contracts';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { InterestsService } from './interests.service';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { RecommendationsService } from './recommendations.service';

class UpdatePreferencesDto extends createZodDto(updateNotificationPreferencesSchema) {}
class InterestsDto extends createZodDto(userInterestsSchema) {}
class PushSubscribeDto extends createZodDto(pushSubscriptionInputSchema) {}
class PushUnsubscribeDto extends createZodDto(pushUnsubscribeSchema) {}

class MarkReadDto extends createZodDto(
  z.object({
    /** Absent = tout marquer comme lu. */
    ids: z.array(z.string()).optional(),
  }),
) {}

/**
 * Centre de notifications du participant.
 *
 * Écran U6 du prototype. Volontairement pauvre en fonctions : une liste, un
 * compteur, un bouton « tout marquer comme lu », et les réglages. Pas de
 * filtres, pas d'archivage, pas de corbeille — un centre de notifications qui
 * demande à être rangé ne l'est jamais.
 */
@ApiTags('Notifications')
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes notifications' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query('nonLues') unreadOnly?: string) {
    return this.notifications.list(user.id, { unreadOnly: unreadOnly === 'true' });
  }

  @Post('lues')
  @ApiOperation({ summary: 'Marquer comme lues' })
  async markRead(@CurrentUser() user: AuthenticatedUser, @Body() body: MarkReadDto) {
    return this.notifications.markRead(user.id, body.ids);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Mes préférences de notification' })
  async preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({
    summary: 'Modifier mes préférences',
    description: 'Seuls les champs envoyés changent : un réglage absent reste tel quel.',
  })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdatePreferencesDto,
  ) {
    await this.notifications.updatePreferences(user.id, body);
    return this.notifications.getPreferences(user.id);
  }
}

/**
 * Goûts du participant et sélection qui en découle.
 *
 * Deux listes — catégories et villes — remplacées d'un bloc à chaque
 * enregistrement : l'écran envoie l'état complet de ses puces, pas une suite
 * d'ajouts et de retraits qui pourraient se croiser.
 */
@ApiTags('Notifications')
@Controller('me')
export class InterestsController {
  constructor(
    private readonly interests: InterestsService,
    private readonly recommendations: RecommendationsService,
  ) {}

  @Get('interests')
  @ApiOperation({ summary: 'Mes goûts : catégories et villes' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.interests.get(user.id);
  }

  @Put('interests')
  @ApiOperation({ summary: 'Remplacer mes goûts' })
  set(@CurrentUser() user: AuthenticatedUser, @Body() body: InterestsDto) {
    return this.interests.set(user.id, body);
  }

  @Get('recommendations')
  @ApiOperation({
    summary: 'Événements à venir qui correspondent à mes goûts',
    description:
      'La page « Pour toi » : toute la sélection du moment, pas seulement les nouveautés.',
  })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.listForUser(user.id);
  }
}

/**
 * Notifications sur l'appareil.
 *
 * Un appareil s'abonne après que son navigateur l'a autorisé ; l'abonnement
 * est propre à l'appareil, pas au compte. `unsubscribe` est un POST et non un
 * DELETE : il porte un corps (l'adresse de l'appareil), et un DELETE avec
 * corps est mal relayé par une partie des proxys.
 */
@ApiTags('Notifications')
@Controller('me/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get()
  @ApiOperation({ summary: 'Clé publique VAPID et nombre d’appareils abonnés' })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.push.status(user.id);
  }

  @Post('subscriptions')
  @ApiOperation({ summary: 'Abonner cet appareil aux notifications' })
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PushSubscribeDto,
    @Req() request: Request,
  ) {
    return this.push.subscribe(user.id, body, request.headers['user-agent']);
  }

  @Post('unsubscribe')
  @ApiOperation({ summary: 'Désabonner cet appareil' })
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body() body: PushUnsubscribeDto) {
    return this.push.unsubscribe(user.id, body.endpoint);
  }
}
