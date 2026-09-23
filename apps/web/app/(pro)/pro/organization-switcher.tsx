'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationSummary } from '@nexakabi/contracts';
import { Select } from '@nexakabi/ui';
import { switchOrganizationAction } from './actions';

/**
 * Sélecteur d'organisation, en tête de la sidebar professionnelle.
 *
 * Une même personne peut appartenir à plusieurs organisations avec des rôles
 * différents : ce sélecteur est donc structurant, pas décoratif.
 */
export function OrganizationSwitcher({
  organizations,
  activeId,
}: {
  organizations: OrganizationSummary[];
  activeId: string;
}) {
  const router = useRouter();

  if (organizations.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 text-body-s">
      <span className="eyebrow text-text-3">Organisation</span>
      <Select
        aria-label="Organisation active"
        value={activeId}
        onValueChange={async (organizationId) => {
          await switchOrganizationAction(organizationId);
          router.refresh();
        }}
        className="min-w-0 flex-1 font-semibold"
        options={organizations.map((organization) => ({
          value: organization.id,
          label: organization.name,
        }))}
      />
    </div>
  );
}
