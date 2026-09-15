'use client';

import * as React from 'react';
import { Drawer, MobileMenuButton } from './drawer';

/**
 * Menu mobile d'une console : le bouton et le tiroir qu'il ouvre.
 *
 * Isolé de `ConsoleShell` (composant serveur) parce que l'état d'ouverture
 * vit dans le navigateur. Le contenu du tiroir — liens, identité, thème,
 * déconnexion — est fourni par le layout de chaque console : cette pièce ne
 * sait rien de ce qu'elle affiche, seulement comment l'ouvrir et le fermer.
 */
export interface ConsoleMobileMenuProps {
  title?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Pastille sur le bouton : quelque chose à voir dans le tiroir. */
  dot?: boolean;
}

export function ConsoleMobileMenu({
  title = 'Menu',
  header,
  footer,
  children,
  dot,
}: ConsoleMobileMenuProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <MobileMenuButton dot={dot} onClick={() => setOpen(true)} />
      <Drawer open={open} onOpenChange={setOpen} title={title} header={header} footer={footer}>
        {children}
      </Drawer>
    </>
  );
}
