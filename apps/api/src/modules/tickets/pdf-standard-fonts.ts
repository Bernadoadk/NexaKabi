/**
 * Polices standard de PDFKit, référencées statiquement.
 *
 * ── Le problème que ce fichier règle ────────────────────────────────────────
 * PDFKit charge ses quatorze polices de base à la demande, par un `require`
 * fabriqué à l'exécution (`createRequire` + imports internes
 * `#standard-fonts/…`). L'analyse statique qui assemble une fonction
 * serverless ne suit pas ce chemin : les fichiers de police ne sont pas
 * dans l'archive déployée, et le premier billet demandé en production échoue
 * sur « module introuvable » — sans qu'aucun test local ne l'ait vu, puisque
 * `node_modules` y est complet.
 *
 * Les importer ici, par leurs points d'entrée publics, suffit à les faire
 * embarquer. Toutes, et pas seulement celle utilisée aujourd'hui : un
 * `.font('Helvetica-Bold')` ajouté demain ne doit pas casser en production
 * seulement. Coût : une soixantaine de kilo-octets, déjà en cache dans Node.
 */
import 'pdfkit/standard-fonts/Courier';
import 'pdfkit/standard-fonts/CourierBold';
import 'pdfkit/standard-fonts/CourierBoldOblique';
import 'pdfkit/standard-fonts/CourierOblique';
import 'pdfkit/standard-fonts/Helvetica';
import 'pdfkit/standard-fonts/HelveticaBold';
import 'pdfkit/standard-fonts/HelveticaBoldOblique';
import 'pdfkit/standard-fonts/HelveticaOblique';
import 'pdfkit/standard-fonts/Symbol';
import 'pdfkit/standard-fonts/TimesBold';
import 'pdfkit/standard-fonts/TimesBoldItalic';
import 'pdfkit/standard-fonts/TimesItalic';
import 'pdfkit/standard-fonts/TimesRoman';
import 'pdfkit/standard-fonts/ZapfDingbats';
