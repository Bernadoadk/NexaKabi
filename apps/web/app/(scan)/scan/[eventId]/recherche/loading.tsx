import { Skeleton } from '@nexakabi/ui';
import { ScanPanelLoading } from '../panel-loading';

export default function ManualSearchLoading() {
  return (
    <ScanPanelLoading title="Recherche manuelle">
      {/* Le champ à sa hauteur finale : c'est là que le contrôleur va taper
          dès que l'écran répond, et un décalage de cette zone lui ferait
          perdre le focus au premier caractère. */}
      <Skeleton className="h-[var(--tap-primary)] w-full rounded-field bg-white/10" index={1} />
    </ScanPanelLoading>
  );
}
