import 'server-only';
import type { NotificationType } from '@nexakabi/contracts';
import { apiFetchAuthenticated } from './session';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unreadCount: number;
}

export interface NotificationPreferencesState {
  eventReminders: boolean;
  organizerPublications: boolean;
  whatsapp: boolean;
  sms: boolean;
  email: boolean;
}

/**
 * Flux de notifications.
 *
 * Comme pour les billets, un échec renvoie un flux VIDE plutôt qu'une erreur :
 * l'API injoignable ne doit pas empêcher d'ouvrir son compte. Le compteur
 * affichera zéro, ce qui est faux mais inoffensif — l'inverse, une page en
 * erreur, coûterait l'accès aux billets.
 */
export async function fetchNotifications(): Promise<NotificationFeed> {
  const result = await apiFetchAuthenticated<NotificationFeed>('/me/notifications');

  return result.ok ? result.data : { items: [], unreadCount: 0 };
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferencesState> {
  const result = await apiFetchAuthenticated<NotificationPreferencesState>(
    '/me/notifications/preferences',
  );

  // Les valeurs par défaut du serveur, répétées ici : un écran de réglages qui
  // n'affiche rien parce que l'API a hoqueté serait pire qu'un écran affichant
  // l'état attendu.
  return result.ok
    ? result.data
    : {
        eventReminders: true,
        organizerPublications: false,
        whatsapp: true,
        sms: true,
        email: false,
      };
}
