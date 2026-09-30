import { Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/guards/session.guard';
import { FollowsService } from './follows.service';

/**
 * Organisateurs suivis par le participant connecté.
 *
 * `PUT` et `DELETE` plutôt qu'un basculement : un double appel — un double
 * toucher sur un téléphone lent — laisse le suivi dans l'état voulu, au lieu
 * de l'annuler aussitôt.
 */
@ApiTags('Organisateurs suivis')
@Controller('me/follows')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Get()
  @ApiOperation({ summary: 'Les organisateurs que je suis' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.follows.list(user.id);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Est-ce que je suis cet organisateur ?' })
  state(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.follows.state(user.id, slug);
  }

  @Put(':slug')
  @ApiOperation({ summary: 'Suivre cet organisateur' })
  follow(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.follows.follow(user.id, slug);
  }

  @Delete(':slug')
  @ApiOperation({ summary: 'Ne plus suivre cet organisateur' })
  unfollow(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.follows.unfollow(user.id, slug);
  }
}
