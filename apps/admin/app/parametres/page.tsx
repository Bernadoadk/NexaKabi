import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { CountryConfiguration, PaymentProviderCode } from '@nexakabi/contracts';
import { Alert, Badge, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied, ReadOnlyNotice } from '../access';
import { AdminShell } from '../shell';
import { CountryCard } from './country-card';
import { SyncButton } from './sync-button';

export const metadata: Metadata = { title: 'Pays & paiements' };

interface Catalogue {
  methods: { code: string; label: string; kind: string }[];
  providers: {
    code: PaymentProviderCode;
    label: string;
    connected: boolean;
    status: 'ACTIVE' | 'LEGACY';
    methodCodes: string[];
    /** Moyens traités pays par pays, quand ils diffèrent du catalogue général. */
    methodCodesByCountry?: Record<string, string[]>;
  }[];
}

/**
 * Pays & paiements — la configuration qui remplace le code.
 *
 * ── Ce que cet écran décide ────────────────────────────────────────────────
 * Quels pays sont ouverts, et dans chacun quels moyens de paiement sont
 * proposés aux participants (collecte) et aux organisateurs (versement), par
 * quel prestataire. C'est ici qu'on ouvre la Côte d'Ivoire ou qu'on ferme un
 * moyen que le prestataire ne sait plus traiter — jamais dans le code.
 *
 * ── Décision et constat ────────────────────────────────────────────────────
 * Chaque moyen porte deux paires de drapeaux : ce que l'administrateur
 * DÉCIDE, et ce que le prestataire CONSTATE à la synchronisation. Un moyen
 * n'est réellement proposé que si les deux l'autorisent : l'écran montre les
 * deux, et le résultat.
 */
export default async function SettingsPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'settings')) return <AccessDenied user={user} space="settings" />;
  const canAct = hasAdminAccess(user, 'settings', 'act');

  const [countries, catalogue] = await Promise.all([
    adminFetch<CountryConfiguration[]>('/settings/countries'),
    adminFetch<Catalogue>('/settings/catalogue'),
  ]);

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Pays & paiements</h1>
          <p className="text-body-s text-text-2">
            Un pays ouvert propose ses moyens de paiement aux participants et ses moyens de
            réception aux organisateurs. Collecte et versement se décident séparément, moyen par
            moyen.
          </p>
        </header>

        {!canAct ? <ReadOnlyNotice what="modifier la configuration" /> : null}

        {catalogue.ok ? (
          <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
            <h2 className="text-body font-bold">Prestataires</h2>
            <ul className="flex flex-col gap-2">
              {catalogue.data.providers.map((provider) => (
                <li
                  key={provider.code}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-border-subtle px-4 py-3"
                >
                  <div className="min-w-[200px] flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
                      {provider.label}
                      {provider.status === 'LEGACY' ? <Badge tone="neutral">Hérité</Badge> : null}
                    </p>
                    <p className="text-micro text-text-3">
                      {provider.status === 'LEGACY'
                        ? 'Ne reçoit plus de nouveaux paiements · conservé pour relire et rembourser son historique'
                        : provider.connected
                          ? 'Branché · clés renseignées'
                          : provider.code === 'mock'
                            ? 'Simulateur · hors production uniquement'
                            : 'Non branché · renseigne ses clés dans la configuration de l’API'}
                    </p>
                  </div>
                  {canAct &&
                  provider.connected &&
                  provider.code !== 'mock' &&
                  provider.status !== 'LEGACY' ? (
                    <SyncButton providerCode={provider.code} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Surface>
        ) : (
          <Alert tone="danger" title="Catalogue indisponible">
            {catalogue.message}
          </Alert>
        )}

        {!countries.ok ? (
          <Alert tone="danger" title="Impossible de charger les pays">
            {countries.message}
          </Alert>
        ) : (
          countries.data.map((country) => (
            <CountryCard
              key={country.code}
              country={country}
              catalogue={catalogue.ok ? catalogue.data : { methods: [], providers: [] }}
              canAct={canAct}
            />
          ))
        )}
      </div>
    </AdminShell>
  );
}
