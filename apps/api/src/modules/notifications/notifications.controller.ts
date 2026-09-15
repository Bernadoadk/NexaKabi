import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { notificationPreferencesSchema } from '@nexakabi/contracts';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { NotificationsService } from './notifications.service';

class UpdatePreferencesDto extends createZodDto(notificationPreferencesSchema.partial()) {}

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
  @ApiOperation({ summary: 'Modifier mes préférences' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdatePreferencesDto,
  ) {
    await this.notifications.updatePreferences(user.id, body);
    return this.notifications.getPreferences(user.id);
  }
}
