# Vidéo marketing Nexa Kabi

Projet [Remotion](https://www.remotion.dev) autonome : il ne dépend pas du code de l'application et ne
fait pas partie du workspace pnpm. Deux vidéos, chacune en deux formats, 30 images/s :

| Composition              | Format      | Usage                           |
| ------------------------ | ----------- | ------------------------------- |
| `NexaKabi-16x9`          | 1920 × 1080 | YouTube, site web               |
| `NexaKabi-9x16`          | 1080 × 1920 | Reels, TikTok, statuts WhatsApp |
| `NexaKabi-Jeunesse-16x9` | 1920 × 1080 | YouTube, site web               |
| `NexaKabi-Jeunesse-9x16` | 1080 × 1920 | Reels, TikTok, statuts WhatsApp |

La vidéo principale (45 s) présente le produit, public et organisateurs. La vidéo « Jeunesse »
(41 s) raconte une histoire : voir [plus bas](#vidéo--jeunesse-).

## Démarrer

```bash
cd video
npm install
npx remotion studio        # http://localhost:3100
```

Le Studio a besoin d'internet au premier lancement (polices Google Fonts).

## Exporter en MP4

```bash
npm run render:16x9     # → out/nexakabi-16x9.mp4
npm run render:9x16     # → out/nexakabi-9x16.mp4
```

Ou les deux d'un coup : `npm run render`. Les fichiers arrivent dans `video/out/` (ignoré par git).

Chaque export passe ensuite par un mastering du son (`scripts/master.mjs`) : le volume est ramené à
−14 LUFS, le niveau de référence des plateformes vidéo, et les crêtes restent sous −1,5 dBTP. L'image
n'est pas retouchée. Après un `npx remotion render` lancé à la main :
`npm run master -- out/fichier.mp4`.

## Le son

Trois couches, toutes facultatives (un fichier absent est ignoré), réglées dans la section « SON » de
`src/config.ts` :

- **Musique** : `public/audio/musique.mp3`. Morceau retenu : « Water | Afro-pop Music » de kontraa,
  [sur Pixabay](https://pixabay.com/music/afrobeat-water-afro-pop-music-445661/). Licence Pixabay :
  usage commercial autorisé, sans obligation de créditer, mais pas de redistribution du fichier seul.
  Il n'est donc pas versionné : sur un autre poste, téléchargez-le et enregistrez-le sous ce nom.
  `startAt` choisit l'instant du morceau qui démarre avec la vidéo : réglé à 4,233 s, il fait tomber
  l'entrée du refrain sur l'impact du logo. Pendant la voix off, la musique descend à `duckedVolume`.
- **Voix off** : une phrase par fichier dans `public/audio/voix/`, n'importe quel format audio
  courant. Noms, instants et textes dans `voiceover.lines` ; mode d'emploi dans
  `public/audio/voix/LISEZ-MOI.txt`. Le volume des phrases est égalisé tout seul (`normalize`), et une phrase
  trop longue est signalée dans la console du Studio.
- **Effets sonores** : souffles des transitions, touchers, « ding » de confirmation, bip du scanner,
  pièces, et pour la vidéo « Jeunesse » vibration du téléphone, messages reçus et envoyés, canon à
  confettis… Synthétisés de toutes pièces par `scripts/sfx.mjs` (aucun échantillon externe, donc libres
  de droits) dans `public/audio/sfx/`. `npm run sfx` les régénère, `sfx.enabled: false` les coupe.

Chaque scène pose ses effets sur ses propres repères, par exemple dans `S4Checkout.tsx` :

```tsx
<Sfx at={T.payClick} sound="tap" />
<Sfx at={T.confirmationAppear + 1} sound="ding" volume={0.75} />
```

Déplacer un repère de `T` déplace l'animation et son bruitage ensemble.

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
- **Son** (`music`, `voiceover`, `sfx`) : voir plus haut.

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

## Vidéo « Jeunesse »

Une histoire en 41 s, centrée sur une bande d'amis :

1. **La question** (`J1Question`) : vendredi, dans la discussion de groupe, « On fait quoi ce
   week-end ? ». Personne ne sait. Aïcha : « Attendez, je regarde 👀 ».
2. **À la une** (`J2Une`) : Nexa Kabi s'ouvre ; le carrousel « À la une » de Découvrir passe au
   festival, marqué « Sponsorisé ». « Prendre mon billet ».
3. **L'achat** (`J3Achat`) : la bande dit oui (« 5 000 ? Ça passe »), quatre Pass Standard, total
   frais compris, paiement MTN MoMo, « C'est confirmé ».
4. **Le partage** (`J4Partage`) : un lien par billet ; Aïcha envoie à chacun le sien, sans compte à
   créer pour le recevoir. C'est elle qui l'envoie : aucun envoi automatique n'est montré.
5. **L'intermède** (`J5Tenue`) : « Le plus dur maintenant ? Choisir la tenue. »
6. **L'entrée** (`J6Entree`) : samedi, quatre scans, quatre « Entrée autorisée » au nom de chacun.
7. **Le concert** (`J7Ambiance`) : la question revient en bulle, la réponse tombe : « Ça. »
8. **L'appel à l'action** : la scène 8 de la vidéo principale, avec ses propres textes.

```bash
npm run render:jeunesse:16x9   # → out/nexakabi-jeunesse-16x9.mp4
npm run render:jeunesse:9x16   # → out/nexakabi-jeunesse-9x16.mp4
npm run render:jeunesse        # les deux
```

**Réglages : `src/jeunesse/config.ts`** (textes, messages de la discussion, durées, personnages,
voix off, passage de la musique). Les couleurs, la marque et les événements restent ceux de
`src/config.ts`. Les textes marketing vouvoient ; les messages de la discussion sont ceux des
personnages, entre amis ; les écrans de l'application gardent leur tutoiement.

**Musique** : le même morceau que la vidéo principale, à partir de 19,74 s. Le montage est calé
dessus (110 BPM, un temps = 16,36 images) : les messages, les « + », les paiements et les scans
tombent sur les temps ; la coupure du morceau accompagne « Attendez, je regarde », sa reprise ouvre
Nexa Kabi, et le dernier refrain arrive avec le concert. Changer la durée d'une scène décale ces
rendez-vous.

**Voix off** : sept phrases à enregistrer, dans `public/audio/voix/jeunesse/` (mode d'emploi :
`LISEZ-MOI.txt` du dossier). Sans elles, la vidéo se comprend : la discussion et les titres
portent l'histoire.

**Personnages** : Aïcha, Koffi, Sèna et Yann, dessinés en SVG
(`src/jeunesse/components/Friends.tsx`) — pastilles de profil, et silhouettes de dos au concert.
Ils sont fictifs, comme toutes les données des maquettes.

## Organisation

```
src/
  config.ts            ← textes, durées, couleurs, son, données
  Video.tsx            ← enchaînement des scènes et transitions
  Root.tsx             ← les compositions, détection de la musique et de la voix
  scenes/              ← les 8 scènes
  jeunesse/            ← la vidéo « Jeunesse » : config.ts, Video.tsx, scenes/, components/,
                         screens/ (Découvrir et sa une)
  screens/             ← écrans de l'application recréés (accueil, paiement, scanner…)
  components/ui/       ← composants du design system (badge, bouton, carte, billet…)
  components/motion/   ← texte animé, curseur, cadres téléphone et navigateur, fonds
  components/audio/    ← musique et voix off (Soundtrack), effets sonores (Sfx)
scripts/
  sfx.mjs              ← fabrique les effets sonores
  master.mjs           ← mastering du son des vidéos exportées
public/
  logo.png             ← copie de apps/web/public/icons/logo.png
  paiements/           ← logos de paiement (marques de substitution de l'application)
  audio/               ← musique, voix/ (voix off ; voix/jeunesse/ pour la vidéo « Jeunesse »),
                         sfx/ (effets sonores)
```

## À savoir

- Les maquettes réutilisent les classes Tailwind et les jetons de l'application : elles restent
  fidèles à la vraie interface. Les visuels d'événements sont des illustrations SVG ; une vraie
  image se déclare avec `image` sur l'événement dans la config (fichier dans `public/`).
- Toutes les données affichées sont fictives. Le QR code du billet mène au site.
- Le fond de la carte des événements est un plan stylisé de Cotonou : l'application affiche Google
  Maps, qu'on ne reproduit pas.
