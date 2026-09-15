'use client';

import { Bell, Compass, Home, LogIn, Ticket, UserRound } from 'lucide-react';
import { BottomTabBar, type BottomTabEntry } from '@nexakabi/ui';

/**
 * Les cinq destinations mobiles du prototype : Accueil, Découvrir, Billets,
 * Alertes, Profil. Partagées par l'espace public et l'espace participant —
 * c'est la même personne, avec ou sans billet en poche.
 *
 * Un visiteur non connecté voit les mêmes onglets : « Billets » et
 * « Alertes » mènent à la connexion (l'espace participant l'exige), et
 * « Profil » devient « Connexion ». On ne cache pas une destination parce
 * qu'elle demande un compte ; on la laisse dire ce qu'elle attend.
 *
 * S'efface sur la page événement et sur le billet : la barre d'achat, et le
 * QR, doivent y rester seuls en bas de l'écran.
 */
const HIDDEN_ON = ['/e/', '/t/', '/checkout', '/commandes/'] as const;

export function PublicBottomNav({
  signedIn,
  unreadCount = 0,
}: {
  signedIn: boolean;
  unreadCount?: number;
}) {
  const entries: BottomTabEntry[] = [
    { href: '/', label: 'Accueil', icon: <Home />, exact: true },
    { href: '/evenements', label: 'Découvrir', icon: <Compass />, alsoActiveOn: ['/carte', '/o/'] },
    { href: '/mon-compte/billets', label: 'Billets', icon: <Ticket /> },
    {
      href: '/mon-compte/notifications',
      label: 'Alertes',
      icon: <Bell />,
      badge: signedIn ? unreadCount : 0,
    },
    signedIn
      ? { href: '/mon-compte', label: 'Profil', icon: <UserRound />, exact: true }
      : { href: '/connexion', label: 'Connexion', icon: <LogIn /> },
  ];

  return (
    <BottomTabBar
      entries={entries}
      ariaLabel="Navigation principale"
      hiddenOn={HIDDEN_ON}
      data-bottom-tabs=""
    />
  );
}
