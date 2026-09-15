import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { toApiError } from '../errors/to-api-error';

/**
 * Filtre global : toute exception sortant d'un contrôleur est traduite vers le
 * format d'erreur unique de l'API.
 *
 * Les routes inconnues, elles, n'atteignent jamais un contrôleur : elles sont
 * traitées par le gestionnaire enregistré dans `main.ts`, qui appelle la même
 * fonction `toApiError`.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? undefined;

    const payload = toApiError(exception, requestId);

    if (payload.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception, path: request.url, requestId }, 'Erreur non gérée');
    }

    response.status(payload.statusCode).json(payload);
  }
}
