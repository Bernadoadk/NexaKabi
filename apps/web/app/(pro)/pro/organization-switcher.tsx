'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationSummary } from '@nexakabi/contracts';
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
    <label className="flex flex-wrap items-center gap-2.5 text-body-s">
      <span className="eyebrow text-text-3">Organisation</span>
      <select
        value={activeId}
        onChange={async (event) => {
          await switchOrganizationAction(event.target.value);
          router.refresh();
        }}
        className="min-h-[var(--tap-min)] min-w-0 flex-1 rounded-field border border-border-field bg-surface px-3 text-[14px] font-semibold"
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </label>
  );
}
