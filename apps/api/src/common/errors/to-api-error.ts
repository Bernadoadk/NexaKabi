import { HttpException, HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';
import type { ApiError } from '@nexakabi/contracts';

/**
 * Traduit n'importe quelle exception vers le format d'erreur unique de l'API.
 *
 * Règle produit du prototype : « Toujours donner la cause probable, jamais un
 * code brut seul. » Le message est rédigé en français, à destination de
 * l'utilisateur final, et accompagné d'une référence de corrélation à
 * communiquer au support.
 *
 * Extrait du filtre pour être réutilisé par le gestionnaire de route inconnue,
 * afin qu'aucune réponse de l'API n'échappe à ce format — pas même un 404.
 */
export function toApiError(exception: unknown, requestId?: string): ApiError {
  if (exception instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of exception.issues) {
      const key = issue.path.join('.') || '_';
      (fields[key] ??= []).push(issue.message);
    }

    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_FAILED',
      message: 'Certaines informations sont incorrectes.',
      fields,
      requestId,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();

    const message =
      typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message ?? exception.message);

    return {
      statusCode: status,
      code: (body as { code?: string }).code ?? httpStatusCode(status),
      message: Array.isArray(message) ? message.join(' ') : message,
      requestId,
    };
  }

  if (isEntityTooLarge(exception)) {
    return {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      code: 'PAYLOAD_TOO_LARGE',
      message:
        typeof exception.limit === 'number'
          ? `Envoi trop volumineux. ${formatBytes(exception.limit)} au maximum.`
          : 'Envoi trop volumineux.',
      requestId,
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message:
      "Une erreur inattendue s'est produite. Nos équipes en sont informées ; réessaie dans un instant.",
    requestId,
  };
}

function httpStatusCode(status: number): string {
  const known: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE',
    429: 'TOO_MANY_REQUESTS',
  };
  return known[status] ?? 'ERROR';
}

/**
 * Corps refusé par un parseur Express (`limit` dépassé). Ce n'est pas une
 * `HttpException` de Nest : sans cette traduction, un fichier de 9 Mo
 * ressortirait en 500 « erreur inattendue » alors que la cause est connue.
 */
function isEntityTooLarge(exception: unknown): exception is { limit?: number } {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { type?: unknown }).type === 'entity.too.large'
  );
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${Math.round(bytes / 1024 / 1024)} Mo`
    : `${Math.round(bytes / 1024)} Ko`;
}
