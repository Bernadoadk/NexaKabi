'use client';

import * as React from 'react';
import { Alert } from '@nexakabi/ui';

/**
 * Dépôt d'un visuel — logo, bannière ou photo de profil.
 *
 * Généralise le geste déjà éprouvé dans l'assistant d'événement (couverture,
 * plan du lieu) : on choisit un fichier, il part immédiatement vers l'API
 * (`uploadUrl`), l'aperçu se met à jour dès la réponse — pas de bouton
 * « Enregistrer » séparé à retrouver plus bas dans un formulaire.
 *
 * `shape` choisit seulement l'APERÇU (rond pour un visage, rectangle 16:9
 * pour une bannière) : le recadrage réel est fait côté API, par le même
 * `sharp` qui traite déjà les couvertures d'événement.
 */
export interface ImageUploaderProps {
  /** Endpoint de dépôt, ex. `/api/media/avatar`. */
  uploadUrl: string;
  currentUrl: string | null;
  shape?: 'square' | 'video';
  label: string;
  hint?: string;
  /** `null` après un retrait — à toi de persister l'un ou l'autre côté appelant. */
  onChange: (url: string | null) => void | Promise<void>;
  disabled?: boolean;
}

export function ImageUploader({
  uploadUrl,
  currentUrl,
  shape = 'square',
  label,
  hint,
  onChange,
  disabled = false,
}: ImageUploaderProps) {
  const [preview, setPreview] = React.useState(currentUrl);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-body-s font-semibold text-text-strong">{label}</span>

      {error ? (
        <Alert tone="danger" title="Dépôt impossible">
          {error}
        </Alert>
      ) : null}

      <div className={shape === 'square' ? 'flex items-center gap-4' : 'flex flex-col gap-3'}>
        {preview ? (
          <div
            className={
              shape === 'square'
                ? 'size-20 shrink-0 overflow-hidden rounded-full border border-border'
                : 'overflow-hidden rounded-card border border-border'
            }
          >
            {/* Aperçu du visuel déposé. */}
            <img
              src={preview}
              alt=""
              className={shape === 'square' ? 'size-full object-cover' : 'aspect-video w-full object-cover'}
            />
          </div>
        ) : null}

        <div className="flex flex-1 flex-col gap-2">
          <label
            htmlFor={inputId}
            className="flex cursor-pointer items-center gap-3.5 rounded-card border-[1.5px] border-dashed border-border-field bg-surface-alt p-4"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-coral-50 text-[18px] text-coral">
              ↑
            </span>
            <span className="flex-1">
              <span className="block text-body font-semibold">
                {preview ? 'Changer l’image' : 'Déposer une image'}
              </span>
              {hint ? <span className="block text-[12px] text-text-2">{hint}</span> : null}
            </span>
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              disabled={disabled || uploading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;

                setUploading(true);
                setError(null);

                const body = new FormData();
                body.append('file', file);

                try {
                  const response = await fetch(uploadUrl, { method: 'POST', body });

                  if (!response.ok) {
                    const payload: unknown = await response.json().catch(() => null);
                    setError((payload as { message?: string } | null)?.message ?? 'Dépôt impossible.');
                    return;
                  }

                  const { url } = (await response.json()) as { url: string };
                  setPreview(url);
                  await onChange(url);
                } catch {
                  setError('L’API n’est pas joignable.');
                } finally {
                  setUploading(false);
                }
              }}
            />
            <span className="rounded-button border border-border-field bg-surface px-3.5 py-2 text-body-s font-semibold">
              {uploading ? 'Envoi…' : 'Parcourir'}
            </span>
          </label>

          {preview ? (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={async () => {
                setPreview(null);
                await onChange(null);
              }}
              className="self-start text-body-s font-semibold text-text-2 hover:text-text-strong"
            >
              Retirer l’image
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
