'use client';

import * as React from 'react';
import { AlertTriangle, Camera, Check, RotateCcw, Upload } from 'lucide-react';
import { cn } from '../lib/cn';
import { ProgressRing } from './progress';

/**
 * Zone de dépôt d'un fichier, avec sa progression sur l'icône.
 *
 * ── Pourquoi la progression est SUR l'icône ───────────────────────────────
 * Parce que c'est l'endroit où l'utilisateur a agi. Une barre placée ailleurs
 * dans le formulaire l'oblige à chercher la conséquence de son geste ; un
 * anneau qui se remplit autour de la flèche qu'il vient de toucher répond là
 * où il regarde déjà.
 *
 * ── Pourquoi un pourcentage plutôt qu'un point qui tourne ─────────────────
 * Une photo de carte d'identité fait deux à quatre mégaoctets. Sur un forfait
 * qui se compte en mégaoctets, et sur un réseau qui vacille, savoir qu'on est
 * à 60 % n'est pas un confort : c'est ce qui décide si on attend ou si on
 * abandonne. Un spinner sans fin ne dit jamais lequel des deux est le bon
 * choix.
 *
 * Ce composant ne dépose rien lui-même : il rend visible ce que fait
 * l'appelant, et lui rend le fichier choisi. L'envoi, ses erreurs et ses
 * reprises restent là où vit la logique.
 */

export type UploadPhase = 'idle' | 'uploading' | 'done' | 'error';

export interface UploadDropzoneProps {
  /** Phrase d'invitation : « Dépose ton RCCM », « Photographie ta carte ». */
  label: string;
  /** Ce qu'on attend, en une ligne — formats, cadrage, lisibilité. */
  help?: React.ReactNode;
  /** Types MIME acceptés, tels quels dans l'attribut `accept`. */
  accept: readonly string[];
  /**
   * Ouvre directement l'appareil photo sur mobile.
   * `environment` : caméra arrière, pour un document posé à plat.
   * `user` : caméra frontale.
   */
  capture?: 'user' | 'environment';
  phase?: UploadPhase;
  /** Progression de 0 à 1 pendant l'envoi. */
  progress?: number;
  /** Nom du fichier retenu, une fois l'envoi terminé. */
  fileName?: string | null;
  error?: string | null;
  disabled?: boolean;
  onSelect: (file: File) => void;
  className?: string;
}

export function UploadDropzone({
  label,
  help,
  accept,
  capture,
  phase = 'idle',
  progress,
  fileName,
  error,
  disabled = false,
  onSelect,
  className,
}: UploadDropzoneProps) {
  const inputId = React.useId();
  const [dragging, setDragging] = React.useState(false);

  const busy = phase === 'uploading';
  const locked = disabled || busy;

  function take(file: File | undefined | null) {
    if (!file || locked) return;
    onSelect(file);
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          if (locked) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex items-center gap-3.5 rounded-card border-2 border-dashed p-4 transition-colors',
          'min-h-[var(--tap-large)]',
          locked ? 'cursor-progress' : 'cursor-pointer',
          dragging
            ? 'border-coral bg-coral-50'
            : phase === 'error'
              ? 'border-red-200 bg-red-50'
              : phase === 'done'
                ? 'border-mint-200 bg-mint-50'
                : 'border-border-field bg-surface hover:border-text-3',
          disabled && 'opacity-55',
        )}
      >
        <span className="shrink-0">
          {busy ? (
            <ProgressRing
              value={progress}
              size={46}
              label={`Envoi de la pièce${progress === undefined ? '' : ` : ${Math.round(progress * 100)} %`}`}
            >
              <span className="tabular text-[11px] font-bold text-text-strong">
                {progress === undefined ? '' : `${Math.round(progress * 100)}`}
              </span>
            </ProgressRing>
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                'flex size-[46px] items-center justify-center rounded-full',
                phase === 'done'
                  ? 'bg-mint-200 text-mint-700'
                  : phase === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-coral-50 text-coral',
              )}
            >
              {phase === 'done' ? (
                <Check size={21} strokeWidth={2.5} />
              ) : phase === 'error' ? (
                <RotateCcw size={20} />
              ) : capture ? (
                <Camera size={20} />
              ) : (
                <Upload size={20} />
              )}
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body-s font-semibold text-text-strong">
            {busy
              ? progress === undefined
                ? 'Envoi en cours…'
                : `Envoi… ${Math.round(progress * 100)} %`
              : phase === 'done'
                ? 'Pièce reçue'
                : phase === 'error'
                  ? 'Reprendre l’envoi'
                  : label}
          </span>

          {phase === 'done' && fileName ? (
            <span className="truncate text-micro text-text-2">{fileName}</span>
          ) : help && !busy ? (
            <span className="text-micro leading-snug text-text-2">{help}</span>
          ) : busy ? (
            <span className="text-micro text-text-3">Ne quitte pas cet écran.</span>
          ) : null}
        </span>
      </label>

      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept.join(',')}
        capture={capture}
        disabled={locked}
        onChange={(event) => {
          take(event.target.files?.[0]);
          // Remis à zéro : sans ça, reprendre le MÊME fichier après un échec
          // ne déclenche aucun événement, et l'écran reste bloqué sur l'erreur.
          event.target.value = '';
        }}
      />

      {error ? (
        <p className="flex items-start gap-1.5 text-micro text-red-700">
          <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
