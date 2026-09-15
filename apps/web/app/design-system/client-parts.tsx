'use client';

import * as React from 'react';
import {
  AffixField,
  Button,
  Field,
  Input,
  MoneyInput,
  OtpInput,
  Pagination,
  PhoneInput,
  Surface,
  Textarea,
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
