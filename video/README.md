# Vidéo marketing Nexa Kabi

Projet [Remotion](https://www.remotion.dev) autonome : il ne dépend pas du code de l'application et ne
fait pas partie du workspace pnpm. Deux formats, 30 images/s, 45 s :

| Composition     | Format      | Usage                           |
| --------------- | ----------- | ------------------------------- |
| `NexaKabi-16x9` | 1920 × 1080 | YouTube, site web               |
| `NexaKabi-9x16` | 1080 × 1920 | Reels, TikTok, statuts WhatsApp |

## Démarrer

```bash
cd video
npm install
npx remotion studio        # http://localhost:3100
```

Le Studio a besoin d'internet au premier lancement (polices Google Fonts).

## Exporter en MP4

```bash
npx remotion render NexaKabi-16x9 out/nexakabi-16x9.mp4
npx remotion render NexaKabi-9x16 out/nexakabi-9x16.mp4
```

Ou les deux d'un coup : `npm run render`. Les fichiers arrivent dans `video/out/` (ignoré par git).

## Ajouter la musique

Déposez votre fichier sous `public/audio/musique.mp3`. Il est détecté tout seul, joué dans les deux
formats avec un fondu d'entrée et de sortie. Sans fichier, la vidéo est muette. Volume, fondus ou
autre nom de fichier : section `music` de `src/config.ts`.

## Modifier la vidéo

**Tout ce qui se règle sans toucher aux animations est dans `src/config.ts`** :

- **Textes** de chaque scène (`scenes`). `*mots*` passe en corail, `\n` force un retour à la ligne.
- **Durées** en secondes (`scenes.<scène>.seconds`, `transitionSeconds`). Changer la durée d'une
  scène étire ou resserre toute son animation ; la durée totale se recalcule seule.
- **Couleurs** (`colors`), relevées dans le design system de l'application. Elles s'appliquent
  partout, maquettes comprises.
- **Marque** (`brand`) : nom, URL, slogan, promesse, logo.
- **Données fictives** (`data`) : événements, prix, noms, statistiques, soldes.
- **Taille des titres** (`typography`).

Pour aller plus loin, chaque scène vit dans son fichier, dans l'ordre de la vidéo :

| Fichier                      | Scène                                        |
| ---------------------------- | -------------------------------------------- |
| `src/scenes/S1Hook.tsx`      | Accroche : l'info éparpillée                 |
| `src/scenes/S2Brand.tsx`     | Logo et promesse                             |
| `src/scenes/S3Discover.tsx`  | Découverte, filtre, carte                    |
| `src/scenes/S4Checkout.tsx`  | Billets, paiement Mobile Money, confirmation |
| `src/scenes/S5Ticket.tsx`    | Billet QR et scanner hors ligne              |
| `src/scenes/S6Organizer.tsx` | Assistant, statistiques, retrait             |
| `src/scenes/S7Benefits.tsx`  | Double bénéfice                              |
| `src/scenes/S8Cta.tsx`       | Appel à l'action                             |

En tête de chaque scène, l'objet `T` liste ses repères (en images, 30 par seconde) : clic, changement
d'écran, apparition d'un texte. Décaler un moment = changer un nombre. Les objets `TARGET` donnent la
position des clics du curseur, en pixels de l'écran du téléphone (360 × 760).

L'ordre des scènes et les transitions entre elles se règlent dans `src/Video.tsx`.

## Organisation

```
src/
  config.ts            ← textes, durées, couleurs, musique, données
  Video.tsx            ← enchaînement des scènes et transitions, musique
  Root.tsx             ← les deux compositions
  scenes/              ← les 8 scènes
  screens/             ← écrans de l'application recréés (accueil, paiement, scanner…)
  components/ui/       ← composants du design system (badge, bouton, carte, billet…)
  components/motion/   ← texte animé, curseur, cadres téléphone et navigateur, fonds
public/
  logo.png             ← copie de apps/web/public/icons/logo.png
  paiements/           ← logos de paiement (marques de substitution de l'application)
  audio/               ← votre musique
```

## À savoir

- Les maquettes réutilisent les classes Tailwind et les jetons de l'application : elles restent
  fidèles à la vraie interface. Les visuels d'événements sont des illustrations SVG ; une vraie
  image se déclare avec `image` sur l'événement dans la config (fichier dans `public/`).
- Toutes les données affichées sont fictives. Le QR code du billet mène au site.
- Le fond de la carte des événements est un plan stylisé de Cotonou : l'application affiche Google
  Maps, qu'on ne reproduit pas.
