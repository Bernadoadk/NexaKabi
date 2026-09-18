import { Skeleton } from '@nexakabi/ui';

/**
 * L'espace organisateur, pendant qu'une page arrive.
 *
 * Posé à la racine de `/pro` : il couvre toutes les pages de l'espace qui
 * n'ont pas leur propre squelette — finances, équipe, paramètres,
 * vérification. Le cadre (en-tête, navigation, barre basse) est dans le
 * layout : il reste à l'écran, seul le contenu est remplacé. C'est ce qui rend
 * un squelette générique acceptable ici, alors qu'il ne le serait pas s'il
 * emportait la navigation avec lui.
 */
export default function ProLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[11px] w-[90px]" />
        <Skeleton className="h-[28px] w-[240px] max-w-full" index={1} />
      </div>

      {/* Les cartes de chiffres : quatre, comme partout dans l'espace pro. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-card border border-border-subtle p-4"
          >
            <Skeleton className="h-[9px] w-[60%]" index={index} />
            <Skeleton className="h-[22px] w-[75%]" index={index + 1} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-card border border-border-subtle p-3.5"
          >
            <Skeleton className="size-11 shrink-0 rounded-field" index={index} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-[11px] w-[55%]" index={index} />
              <Skeleton className="h-[9px] w-[35%]" index={index + 1} />
            </div>
            <Skeleton className="h-[26px] w-[74px] rounded-full" index={index} />
          </div>
        ))}
      </div>
    </div>
  );
}
