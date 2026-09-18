'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, Lock, ShieldCheck } from 'lucide-react';
import {
  IDENTITY_CONSENT,
  documentSpec,
  requestableDocuments,
  type DocumentType,
  type OrganizationType,
  type VerificationRequestDetail,
} from '@nexakabi/contracts';
import { Badge, Surface, UploadDropzone, cn, type UploadPhase } from '@nexakabi/ui';
import { uploadFile } from '@/lib/upload-client';
import { SelfieCapture } from './selfie-capture';

/**
 * Le dépôt des pièces, côté organisateur.
 *
 * ── Deux régimes, et la ligne qui les sépare ──────────────────────────────
 * Une pièce PERSONNELLE — photo du visage, carte d'identité, CIP, passeport —
 * ne peut être déposée que si un modérateur l'a explicitement réclamée, avec
 * un motif écrit. Tant que rien n'a été demandé, cette section n'apparaît pas,
 * et l'API refuse ce qui lui serait envoyé. C'est la proportionnalité exigée
 * par le Livre cinquième du Code du numérique béninois : on ne collecte pas
 * des pièces d'identité « au cas où ».
 *
 * Un document d'ENTITÉ — RCCM, IFU, récépissé, acte de création — se dépose
 * librement. Ce ne sont pas des données personnelles, ils viennent de
 * registres publics, et le troisième contrôle en a besoin : obliger un
 * modérateur à les réclamer formellement ferait passer chaque société par un
 * aller-retour « dossier incomplet » pour un document qu'elle aurait fourni
 * d'elle-même.
 *
 * ── Pourquoi le choix du type a disparu ───────────────────────────────────
 * L'ancienne version montrait une liste déroulante de types, la même pour
 * tout le monde, y compris des pièces sans rapport avec le statut de
 * l'organisation. Ici, chaque pièce a sa carte, sa phrase et son mode de
 * saisie : il n'y a plus rien à choisir, seulement à faire.
 */

type Slot = {
  phase: UploadPhase;
  progress?: number;
  error?: string | null;
};

export function VerificationDocuments({
  request,
  organizationType,
}: {
  request: VerificationRequestDetail;
  organizationType: OrganizationType;
}) {
  const router = useRouter();
  const [slots, setSlots] = React.useState<Record<string, Slot>>({});
  const [consented, setConsented] = React.useState(false);

  const provided = new Set(
    request.documents.filter((document) => document.available).map((document) => document.type),
  );

  const remaining = request.requestedDocuments.filter((type) => !provided.has(type));
  const done = request.requestedDocuments.length - remaining.length;

  /**
   * Les documents d'entité que cette organisation peut fournir d'elle-même.
   *
   * `OTHER` en est exclu : « autre document » n'a de sens que si un modérateur
   * a dit lequel, et il apparaît alors dans les pièces demandées. Une personne
   * physique n'a aucune entité à prouver — rien ne s'affiche pour elle.
   */
  const optional =
    organizationType === 'INDIVIDUAL'
      ? []
      : requestableDocuments(organizationType).filter(
          (spec) =>
            !spec.personal &&
            spec.type !== 'OTHER' &&
            !request.requestedDocuments.includes(spec.type),
        );

  // Une seule décision à prendre, en haut, avant tout dépôt : « j'accepte de
  // prouver mon identité de cette façon ». Tant qu'elle n'est pas prise,
  // aucune pièce personnelle ne peut partir — ni depuis l'écran, ni depuis
  // l'API, qui applique la même règle de son côté.
  const needsConsent = request.requestedDocuments.some((type) => documentSpec(type).personal);

  function patch(type: DocumentType, slot: Partial<Slot>) {
    setSlots((current) => ({ ...current, [type]: { ...current[type], ...slot } as Slot }));
  }

  async function send(type: DocumentType, file: File) {
    patch(type, { phase: 'uploading', progress: 0, error: null });

    const spec = documentSpec(type);
    const query = new URLSearchParams({ type });
    // Le consentement voyage avec la pièce : l'API le réclame pour toute
    // pièce personnelle, et le refus n'est pas rattrapable après coup.
    if (spec.personal) query.set('consent', String(IDENTITY_CONSENT.version));

    const result = await uploadFile(file, `/api/media/verification-document?${query.toString()}`, {
      onProgress: (fraction) => patch(type, { progress: fraction }),
    });

    if (!result.ok) {
      patch(type, { phase: 'error', error: result.message });
      return;
    }

    patch(type, { phase: 'done', progress: 1, error: null });
    router.refresh();
  }

  if (request.requestedDocuments.length === 0 && optional.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {request.requestedDocuments.length === 0 ? null : (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-h3 font-bold">Pièces demandées</h2>
              <p className="text-micro text-text-2">
                {remaining.length === 0
                  ? 'Tout est déposé. Le dossier est reparti en instruction.'
                  : `${done} sur ${request.requestedDocuments.length} déposée${done > 1 ? 's' : ''}.`}
              </p>
            </div>

            {/* Une jauge de trois pièces se lit mieux en points qu'en pourcentage. */}
            <div className="flex items-center gap-1.5" aria-hidden>
              {request.requestedDocuments.map((type) => (
                <span
                  key={type}
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
                    provided.has(type) ? 'bg-mint text-white' : 'bg-fill-muted text-text-3',
                  )}
                >
                  {provided.has(type) ? <Check size={12} strokeWidth={3} /> : null}
                </span>
              ))}
            </div>
          </div>

          <LegalNotice />

          {needsConsent ? (
            <div className="border-b border-border-subtle px-5 py-4">
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-card border p-3.5 transition-colors',
                  consented ? 'border-mint-200 bg-mint-50' : 'border-coral-200 bg-coral-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(event) => setConsented(event.target.checked)}
                  className="mt-1 size-[18px] shrink-0 accent-[var(--color-coral)]"
                />
                <span className="flex flex-col gap-1">
                  <span className="flex items-start gap-1.5 text-body-s font-semibold text-text-strong">
                    <ShieldCheck
                      className={cn(
                        'mt-px size-4 shrink-0',
                        consented ? 'text-mint-700' : 'text-coral',
                      )}
                      aria-hidden
                    />
                    {IDENTITY_CONSENT.label}
                  </span>
                  <span className="text-micro leading-snug text-text-2">
                    {IDENTITY_CONSENT.detail}
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <ul className="divide-y divide-border-subtle">
            {request.requestedDocuments.map((type) => {
              const spec = documentSpec(type);
              const slot = slots[type];
              const already = provided.has(type);
              const locked = spec.personal && !consented;

              return (
                <li key={type} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="flex items-center gap-2 text-body font-semibold text-text-strong">
                        {spec.label}
                        {spec.personal ? (
                          <span
                            className="inline-flex items-center gap-1 text-micro font-semibold text-text-3"
                            title="Pièce personnelle : accès restreint, consultation tracée, destruction après décision."
                          >
                            <Lock size={12} aria-hidden />
                            Personnelle
                          </span>
                        ) : null}
                      </p>
                      <p className="max-w-[62ch] text-micro leading-snug text-text-2">
                        {spec.help}
                      </p>
                    </div>

                    {already ? <Badge tone="success">Déposée</Badge> : null}
                  </div>

                  <details className="group">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-micro font-semibold text-text-2 hover:text-text-strong">
                      <Eye size={13} aria-hidden />
                      Pourquoi cette pièce est demandée
                    </summary>
                    <p className="mt-1.5 max-w-[62ch] rounded-panel border border-border-subtle bg-surface-alt p-3 text-micro leading-relaxed text-text-2">
                      {spec.purpose}
                    </p>
                  </details>

                  {already ? (
                    <p className="text-micro text-text-3">
                      Reçue. Pour la remplacer, dépose-la à nouveau : la précédente est détruite.
                    </p>
                  ) : null}

                  {locked ? (
                    <p className="rounded-panel border border-border-subtle bg-surface-alt p-3 text-micro text-text-3">
                      Coche l’accord ci-dessus pour déposer cette pièce.
                    </p>
                  ) : null}

                  {spec.capture === 'selfie' ? (
                    <SelfieCapture
                      allowed={!locked}
                      onCapture={(file) => void send(type, file)}
                      uploading={slot?.phase === 'uploading'}
                      progress={slot?.progress}
                      error={slot?.error}
                    />
                  ) : (
                    <UploadDropzone
                      label={already ? 'Remplacer cette pièce' : `Déposer — ${spec.short}`}
                      help={
                        spec.accept.includes('application/pdf')
                          ? 'Photo, scan ou PDF · 10 Mo au maximum'
                          : 'Photo nette, sans reflet · 10 Mo au maximum'
                      }
                      accept={spec.accept}
                      // La caméra arrière, pour un document posé à plat : sur un
                      // téléphone, c'est un geste de moins que de passer par
                      // l'application photo puis la galerie.
                      capture={spec.capture === 'identity' ? 'environment' : undefined}
                      phase={slot?.phase ?? (already ? 'done' : 'idle')}
                      progress={slot?.progress}
                      error={slot?.error}
                      disabled={locked}
                      onSelect={(file) => void send(type, file)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {optional.length === 0 ? null : (
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-h3 font-bold">Document de l’organisation</h2>
            <p className="mt-0.5 max-w-[62ch] text-micro text-text-2">
              Facultatif, mais il accélère la vérification : c’est ce qui prouve que l’organisation
              existe légalement et porte bien ce nom. Jamais une pièce d’identité personnelle.
            </p>
          </div>

          <ul className="divide-y divide-border-subtle">
            {optional.map((spec) => {
              const slot = slots[spec.type];
              const already = provided.has(spec.type);

              return (
                <li key={spec.type} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-body font-semibold text-text-strong">{spec.label}</p>
                      <p className="max-w-[62ch] text-micro leading-snug text-text-2">
                        {spec.help}
                      </p>
                    </div>
                    {already ? <Badge tone="success">Déposée</Badge> : null}
                  </div>

                  <UploadDropzone
                    label={already ? 'Remplacer cette pièce' : `Déposer — ${spec.short}`}
                    help="Photo, scan ou PDF · 10 Mo au maximum"
                    accept={spec.accept}
                    phase={slot?.phase ?? (already ? 'done' : 'idle')}
                    progress={slot?.progress}
                    error={slot?.error}
                    onSelect={(file) => void send(spec.type, file)}
                  />
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </div>
  );
}

/**
 * Ce que l'organisateur a le droit de savoir avant d'envoyer sa pièce.
 *
 * Court, en haut, jamais replié : une information sur la protection des
 * données qui ne se lit qu'en dépliant un accordéon n'informe personne. Les
 * quatre phrases correspondent aux quatre obligations qui s'appliquent —
 * finalité, accès, durée, droits.
 */
function LegalNotice() {
  return (
    <div className="border-b border-border-subtle bg-surface-alt px-5 py-3.5">
      <p className="text-micro font-semibold text-text-strong">Ce que deviennent ces pièces</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-micro leading-snug text-text-2">
        <li>
          Elles servent uniquement à vérifier ton identité et celle de ton organisation, pour
          débloquer tes retraits.
        </li>
        <li>
          Seuls les modérateurs habilités y accèdent, par un lien temporaire, et chaque consultation
          est enregistrée avec le nom de qui a regardé.
        </li>
        <li>
          Les pièces d’identité et la photo sont <strong>détruites dès la décision rendue</strong>.
          Aucune reconnaissance faciale n’est utilisée.
        </li>
        <li>
          Tu peux demander à consulter, corriger ou supprimer ces données — écris-nous depuis
          l’aide.
        </li>
      </ul>
    </div>
  );
}
