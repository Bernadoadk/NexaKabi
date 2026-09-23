/**
 * Fichiers CSV lisibles tels quels dans Excel.
 *
 * ── Pourquoi un point-virgule et un BOM ─────────────────────────────────────
 * Excel en configuration française attend le point-virgule comme séparateur ;
 * avec une virgule, tout atterrit dans une seule colonne. Le BOM UTF-8 lui
 * fait reconnaître l'encodage — sans lui, « Yélé » devient « YÃ©lÃ© ».
 *
 * Deux détails idiots qui font toute la différence entre un fichier utilisable
 * et un fichier qu'on renonce à ouvrir. Tous les exports passent par ici, pour
 * qu'aucun ne les oublie.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return BOM + [header, ...rows].map(toCsvLine).join(LINE_BREAK);
}

/** Une cellule : un texte, un montant entier, ou rien. */
export type CsvCell = string | number | null | undefined;

/**
 * Marque d'ordre des octets.
 *
 * Écrite par son code plutôt que par le caractère lui-même : un U+FEFF littéral
 * est invisible dans un éditeur, disparaît au premier copier-coller, et se fait
 * signaler comme « espace irrégulier » par les analyseurs.
 */
const BOM = String.fromCharCode(0xfeff);

/** Fin de ligne CSV. Excel attend CRLF, y compris sous macOS. */
const LINE_BREAK = String.fromCharCode(13, 10);

/** Échappe une ligne CSV : guillemets doublés, champ cité s'il le faut. */
function toCsvLine(cells: readonly CsvCell[]): string {
  return cells
    .map((cell) => {
      const text = cell === null || cell === undefined ? '' : String(cell);
      return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(';');
}
