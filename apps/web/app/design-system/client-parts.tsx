'use client';

import * as React from 'react';
import {
  AffixField,
  BusyOverlay,
  Button,
  Field,
  Input,
  LoadingPanel,
  MoneyInput,
  OtpInput,
  Pagination,
  PhoneInput,
  ProgressRing,
  Spinner,
  Surface,
  Textarea,
  TopProgressBar,
  UploadDropzone,
} from '@nexakabi/ui';

/**
 * Parties interactives de la galerie du design system.
 * Isolées dans un composant client pour que le reste de la page reste rendu
 * côté serveur — le budget de 150 Ko sur le premier écran s'applique aussi ici.
 */

export function FormsSection() {
  const [phone, setPhone] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState<number | null>(15_000);
  const [otp, setOtp] = React.useState('491');

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em]">Formulaires</h2>
        <p className="max-w-[520px] text-body-s text-text-2">
          Le numéro de téléphone est l’identifiant d’authentification : il est présenté en premier
          partout, avec l’indicatif figé. La valeur remontée est normalisée en E.164.
        </p>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Nom complet" htmlFor="ds-name">
          <Input id="ds-name" defaultValue="Adjovi Kponou" />
        </Field>

        <Field
          label="Téléphone"
          htmlFor="ds-phone"
          help={phone ? `Normalisé : ${phone}` : 'Ancien format à 8 chiffres accepté'}
        >
          <PhoneInput id="ds-phone" defaultValue="97 44 12 08" onValueChange={setPhone} />
        </Field>

        <Field label="Montant du billet" htmlFor="ds-amount">
          <MoneyInput id="ds-amount" value={amount} onValueChange={setAmount} />
        </Field>

        <Field label="Catégorie" htmlFor="ds-category">
          <AffixField id="ds-category" defaultValue="Musique & concerts" readOnly suffix="▾" />
        </Field>

        <Field
          label="Email"
          error="format invalide"
          help="Vérifie l’adresse : c’est là que le billet sera envoyé en secours."
          htmlFor="ds-email"
          className="md:col-span-2"
        >
          <Input id="ds-email" defaultValue="adjovi@" invalid />
        </Field>

        <Field
          label="Description de l’événement"
          htmlFor="ds-description"
          className="md:col-span-2"
        >
          <Textarea
            id="ds-description"
            defaultValue="Trois scènes, dix-huit artistes, deux jours de concerts à la Plage de Fidjrossè."
          />
        </Field>
      </div>

      <div className="grid gap-5 border-t border-border-subtle pt-5 md:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <p className="eyebrow text-text-3">Code à 6 chiffres · remplace le mot de passe</p>
          <OtpInput value={otp} onValueChange={setOtp} />
          <div className="flex items-center justify-between text-body-s">
            <span className="text-text-2">
              Nouveau code dans <b className="tabular text-text-strong">0:42</b>
            </span>
            <a href="#" className="font-semibold">
              Recevoir sur WhatsApp
            </a>
          </div>
          <Button variant="primary" size="primary" block disabled={otp.length < 6}>
            Vérifier
          </Button>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="eyebrow text-text-3">Dépôt de fichier</p>
          <div className="flex items-center gap-3.5 rounded-card border-[1.5px] border-dashed border-border-field bg-surface-alt p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-coral-50 text-[18px] text-coral">
              ↑
            </div>
            <div className="flex-1">
              <div className="text-body font-semibold">Image de couverture</div>
              <div className="text-[12px] text-text-2">
                JPG ou PNG · 1600×900 minimum · 2 Mo max, compressée automatiquement
              </div>
            </div>
            <Button variant="secondary" size="compact">
              Parcourir
            </Button>
          </div>
        </div>
      </div>
    </Surface>
  );
}

export function PaginationDemo() {
  const [page, setPage] = React.useState(1);
  return <Pagination page={page} totalPages={2} onPageChange={setPage} />;
}

/**
 * Les attentes, en état de marche.
 *
 * Une galerie qui montrerait ces composants figés ne prouverait rien : tout
 * leur intérêt est dans le mouvement, et c'est là qu'ils se cassent. On les
 * fait donc tourner pour de bon — la barre avance, l'anneau se remplit, le
 * voile bloque vraiment les clics.
 */
export function WaitingSection() {
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [navigating, setNavigating] = React.useState(false);

  // Envoi simulé : c'est une galerie, il n'y a pas de fichier à déposer.
  React.useEffect(() => {
    if (!uploading) return;

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 1) {
          setUploading(false);
          return 1;
        }
        return Math.min(1, current + 0.07);
      });
    }, 160);

    return () => window.clearInterval(timer);
  }, [uploading]);

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em]">Attentes</h2>
        <p className="max-w-[520px] text-body-s text-text-2">
          Le squelette reste la règle pour du contenu dont on connaît la forme. Ces trois-là
          servent aux attentes qui n’en ont pas : la navigation, l’envoi d’un fichier, l’action en
          cours.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="eyebrow text-text-3">Filet de navigation</p>
          <p className="text-body-s text-text-2">
            Il n’atteint jamais la fin tout seul : il ralentit à l’approche des quatre-vingt-dix
            pour cent et ne franchit le bout qu’à l’arrivée de la page.
          </p>
          <div className="relative h-10 overflow-hidden rounded-field border border-border-subtle">
            <TopProgressBar active={navigating} className="absolute" />
          </div>
          <Button
            variant="secondary"
            size="compact"
            className="self-start"
            onClick={() => {
              setNavigating(true);
              window.setTimeout(() => setNavigating(false), 2600);
            }}
          >
            Lancer une navigation
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <p className="eyebrow text-text-3">Dépôt d’un fichier</p>
          <p className="text-body-s text-text-2">
            L’anneau entoure l’icône que l’utilisateur vient de toucher, et porte un pourcentage
            réel — pas un point qui tourne sans fin.
          </p>
          <UploadDropzone
            label="Déposer une pièce"
            help="JPG, PNG, WebP ou PDF · 10 Mo au maximum"
            accept={['image/jpeg', 'image/png', 'application/pdf']}
            phase={uploading ? 'uploading' : progress >= 1 ? 'done' : 'idle'}
            progress={progress}
            fileName="rccm-yele-productions.pdf"
            onSelect={() => undefined}
          />
          <Button
            variant="secondary"
            size="compact"
            className="self-start"
            onClick={() => {
              setProgress(0);
              setUploading(true);
            }}
          >
            Simuler un envoi
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="eyebrow text-text-3">Voile d’action</p>
        <p className="text-body-s text-text-2">
          Il ne remplace pas l’état d’attente du bouton : il empêche de cliquer le bouton D’À CÔTÉ
          pendant qu’une action part.
        </p>
        <BusyOverlay busy={busy} label="Publication…">
          <div className="flex flex-wrap gap-2 rounded-card border border-border-subtle p-4">
            <Button variant="primary" size="default" onClick={() => setBusy(true)}>
              Publier
            </Button>
            <Button variant="secondary" size="default">
              Modifier
            </Button>
            <Button variant="destructive" size="default">
              Supprimer
            </Button>
          </div>
        </BusyOverlay>
        <div className="flex items-center gap-3">
          <Button variant="tertiary" size="compact" onClick={() => setBusy((value) => !value)}>
            {busy ? 'Libérer la zone' : 'Occuper la zone'}
          </Button>
          <span className="flex items-center gap-2 text-body-s text-text-2">
            <Spinner size={14} tone="coral" />
            <Spinner size={14} tone="ink" />
            <Spinner size={14} tone="muted" />
            Trois teintes de spinner
          </span>
        </div>
      </div>

      <div className="grid gap-5 border-t border-border-subtle pt-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="eyebrow text-text-3">Anneau seul</p>
          <p className="text-body-s text-text-2">
            Avec une valeur, il dit où on en est. Sans valeur, il tourne — c’est la forme honnête
            quand l’attente dépend de quelqu’un d’autre : l’acheteur devant son téléphone,
            l’opérateur Mobile Money.
          </p>
          <div className="flex items-center gap-5 rounded-card border border-border-subtle p-4">
            <ProgressRing value={progress} label="Envoi">
              <span className="tabular text-micro font-bold">{Math.round(progress * 100)}%</span>
            </ProgressRing>
            <ProgressRing label="Paiement en cours de validation" />
            <ProgressRing value={1} tone="ink">
              <span className="text-body-s font-bold">✓</span>
            </ProgressRing>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="eyebrow text-text-3">Attente centrée</p>
          <p className="text-body-s text-text-2">
            Réservée aux zones SANS géométrie connue — une carte qui charge son SDK. Une liste, un
            tableau, une grille de cartes ont une forme prévisible : ils méritent un squelette, et
            un point qui tourne y serait un aveu de paresse.
          </p>
          <div className="rounded-card border border-border-subtle bg-paper">
            <LoadingPanel
              title="Chargement de la carte…"
              description="Les épingles apparaîtront dès que la carte est prête."
            />
          </div>
        </div>
      </div>
    </Surface>
  );
}
