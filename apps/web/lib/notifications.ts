import 'server-only';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type AccountNewsletter,
  type EventSummary,
  type FollowState,
  type FollowedOrganization,
  type NotificationPreferences,
  type NotificationType,
  type PushStatus,
  type UserInterests,
} from '@nexakabi/contracts';
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

export type NotificationPreferencesState = NotificationPreferences;

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

  // Les valeurs par défaut du serveur : un écran de réglages qui n'affiche
  // rien parce que l'API a hoqueté serait pire qu'un écran affichant l'état
  // attendu.
  return result.ok ? result.data : { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

export async function fetchInterests(): Promise<UserInterests> {
  const result = await apiFetchAuthenticated<UserInterests>('/me/interests');
  return result.ok ? result.data : { categoryIds: [], cityIds: [] };
}

export async function fetchFollows(): Promise<FollowedOrganization[]> {
  const result = await apiFetchAuthenticated<FollowedOrganization[]>('/me/follows');
  return result.ok ? result.data : [];
}

/** État du suivi d'un organisateur, ou `null` si la session ne permet pas de le savoir. */
export async function fetchFollowState(slug: string): Promise<FollowState | null> {
  const result = await apiFetchAuthenticated<FollowState>(
    `/me/follows/${encodeURIComponent(slug)}`,
  );
  return result.ok ? result.data : null;
}

export async function fetchPushStatus(): Promise<PushStatus> {
  const result = await apiFetchAuthenticated<PushStatus>('/me/push');
  return result.ok ? result.data : { publicKey: null, devices: 0 };
}

export async function fetchAccountNewsletter(): Promise<AccountNewsletter> {
  const result = await apiFetchAuthenticated<AccountNewsletter>('/me/newsletter');
  return result.ok ? result.data : { status: 'NONE', email: null };
}

export async function fetchRecommendations(): Promise<{
  events: EventSummary[];
  hasInterests: boolean;
} | null> {
  const result = await apiFetchAuthenticated<{ events: EventSummary[]; hasInterests: boolean }>(
    '/me/recommendations',
  );
  return result.ok ? result.data : null;
}
