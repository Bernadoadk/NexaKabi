# NEXA-KABI — ANALYSE DU PROJET

> **Phase 0 — Analyse et planification.** Ce document ne contient aucune décision d'implémentation
> exécutée. Il consigne la compréhension du produit, l'analyse du design de référence, l'inventaire
> des écrans, l'architecture de l'information et les parcours critiques.
>
> Date de rédaction : 3 septembre 2026
> Sources analysées : `docs/cahier-des-charge.md` (2 218 lignes) et `design-reference/Nexa-Kabi.dc.html`
> (prototype interactif, 33 écrans). Le dossier `design-reference/` a été lu **sans aucune modification**.

## Carte des documents de la Phase 0

| Sujet demandé                         | Document                          |
| ------------------------------------- | --------------------------------- |
| 1 · Compréhension du produit          | Ce document, §1                   |
| 2 · Utilisateurs et rôles             | Ce document, §2                   |
| 3 · Analyse du design                 | Ce document, §3                   |
| 4 · Inventaire des écrans             | Ce document, §4                   |
| 5 · Information architecture          | Ce document, §5                   |
| 6 · Parcours critiques                | Ce document, §6                   |
| 14 · Stratégie responsive             | Ce document, §7                   |
| Ambiguïtés et hypothèses              | Ce document, §8                   |
| 7 · Architecture technique            | `TECHNICAL_ARCHITECTURE.md`, §1–3 |
| 8 · Architecture backend (modules)    | `TECHNICAL_ARCHITECTURE.md`, §4   |
| 10 · Authentification et autorisation | `TECHNICAL_ARCHITECTURE.md`, §5   |
| 11 · Architecture des paiements       | `TECHNICAL_ARCHITECTURE.md`, §6   |
| 12 · Architecture des QR Codes        | `TECHNICAL_ARCHITECTURE.md`, §7   |
| 13 · Architecture PWA                 | `TECHNICAL_ARCHITECTURE.md`, §8   |
| 9 · Modèle de données                 | `DATABASE_PROPOSAL.md`            |
| 15 · Plan de développement            | `DEVELOPMENT_ROADMAP.md`          |

---

# 1. COMPRÉHENSION DU PRODUIT

## 1.1 Ce qu'est Nexa-Kabi

Nexa-Kabi est une **infrastructure de billetterie et de gestion d'événements pour le Bénin**.

Formulé autrement : aujourd'hui, un événement béninois vit simultanément sur une affiche Facebook,
un groupe WhatsApp, un fichier Excel, des captures d'écran de transferts Mobile Money et une liste
papier à l'entrée. Nexa-Kabi remplace cette chaîne de cinq outils par une seule, en conservant les
canaux que les gens utilisent réellement (WhatsApp, Mobile Money) au lieu de les combattre.

Le prototype exprime cette idée en une phrase que je reprends parce qu'elle cadre toute
l'architecture : **le produit n'est pas une billetterie, c'est une chaîne de confiance à deux bouts.**

- Le participant doit croire qu'un paiement Mobile Money de 15 000 FCFA aboutira réellement à un
  billet valide, et non à une capture d'écran contestable.
- L'organisateur doit croire que l'argent encaissé arrivera bien sur son compte, dans un délai connu,
  avec des frais annoncés à l'avance.

Tout le reste — les écrans, le modèle de données, la file de modération — n'existe que pour tenir
ces deux promesses.

## 1.2 Le problème résolu

| Problème actuel                     | Conséquence concrète                        | Réponse de Nexa-Kabi                            |
| ----------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Inscriptions par WhatsApp           | Aucun décompte fiable, sur-réservation      | Stock décrémenté transactionnellement           |
| Paiement par transfert manuel       | Preuve = capture d'écran falsifiable        | Paiement confirmé par webhook opérateur         |
| Billets papier ou PDF partagés      | Un billet sert plusieurs fois               | Un QR signé par billet, check-in unique         |
| Contrôle manuel à l'entrée          | File de 30 minutes, erreurs                 | Scan en moins d'une seconde, hors ligne         |
| Suivi des ventes sur Excel          | Aucune statistique, aucune décision         | Tableau de bord temps réel                      |
| Encaissement dispersé               | L'organisateur ne sait pas ce qu'il a gagné | Solde, commission et date de déblocage affichés |
| Aucune visibilité centralisée       | Un événement n'existe que pour ses abonnés  | Découverte publique, SEO, partage riche         |
| Recours impossible en cas de fraude | Le participant perd son argent              | Signalement, gel des fonds, remboursement       |

## 1.3 Les utilisateurs

Cinq univers, décrits en détail au §2 : le **visiteur** (sans compte), le **participant**,
l'**organisateur** (via une organisation), le **staff d'organisation** (gestionnaire, contrôleur,
analyste) et l'**administrateur plateforme**.

Point structurant : ces rôles ne sont pas exclusifs. Une même personne physique peut être
participante d'un événement le samedi, propriétaire de son organisation le lundi, et contrôleuse
invitée sur l'événement d'une autre organisation le week-end suivant. Le système d'autorisation doit
partir de ce fait, pas le rattraper après coup (voir `TECHNICAL_ARCHITECTURE.md` §5).

## 1.4 Fonctionnalités principales

Regroupées par chaîne de valeur, avec le périmètre MVP tel qu'il ressort du croisement
cahier des charges / prototype (les entrées orange du sitemap du prototype) :

**Découverte (MVP)** — accueil éditorialisé, catalogue filtrable, page événement optimisée pour le
partage WhatsApp et le SEO, page publique d'organisateur, recherche.

**Achat (MVP)** — sélection de catégories de billets, saisie des coordonnées participant, panier avec
frais visibles dès la première étape, récapitulatif, paiement Mobile Money, confirmation.

**Billet (MVP)** — génération après confirmation de paiement, QR signé, consultation hors ligne, lien
public `/t/:token` partageable, export PDF.

**Organisation (MVP)** — création d'organisation, assistant de création d'événement en 8 étapes,
catégories de billets, publication, tableau de bord des ventes, liste des participants, export.

**Contrôle d'accès (MVP)** — sélection de l'événement assigné, scanner caméra, verdict pleine page,
recherche manuelle de secours, fonctionnement hors ligne avec synchronisation.

**Finances (MVP)** — calcul du solde, commissions, demande de retrait Mobile Money ou bancaire, suivi
des statuts.

**Administration (MVP)** — modération des événements, file de vérification des organisateurs, journal
des transactions, traitement des signalements.

**Post-MVP** — codes promotionnels et invitations (présents dans le prototype mais marqués comme
reportés), favoris, organisateurs suivis, points de vente physiques, agents de vente, affiliation,
mise en avant payante, remboursements automatisés à grande échelle, marketplace de prestataires.

## 1.5 Contraintes spécifiques au marché béninois

Ces contraintes ne sont pas des « détails de localisation » : elles déterminent l'architecture.

**Le Mobile Money est asynchrone.** L'utilisateur quitte l'écran pour valider sur son téléphone via
USSD. Le navigateur ne sait rien pendant ce temps. Conséquence directe : le billet est délivré sur
**webhook opérateur**, jamais sur redirection ; un paiement n'est jamais déclaré échoué parce que
l'utilisateur a fermé l'onglet.

**Le réseau est intermittent, surtout en soirée et en périphérie.** Un scanner qui exige une
connexion à la porte d'un concert est un scanner inutilisable. Le mode hors ligne du check-in n'est
pas une fonctionnalité de confort, c'est une condition de fonctionnement.

**Le parc est majoritairement Android d'entrée de gamme.** Cible affichée par le prototype :
moins de 150 Ko pour le premier écran, PWA de 1,2 Mo, pas de vidéo décorative, images en AVIF, aucune
animation d'entrée de page.

**WhatsApp est le canal réel de distribution.** Le prototype pose comme décision produit que le billet
« vit aussi sur WhatsApp » via un lien `/t/:token` consultable sans compte et transférable, l'email
n'étant que le canal de secours. Cela impacte le modèle de données (jeton public par billet) et la
sécurité (un lien = un accès).

**Le mot de passe est un obstacle réel.** L'authentification retenue par le prototype est
téléphone + code à 6 chiffres (SMS, avec repli WhatsApp), sans mot de passe, session de 90 jours.

**La devise est le FCFA (XOF), sans sous-unité.** Les montants s'écrivent avec espace insécable
comme séparateur de milliers (`5 000 FCFA`), le suffixe toujours d'un poids typographique inférieur
au chiffre. Aucune conversion, aucun arrondi décimal.

**La confiance envers les plateformes en ligne est faible.** D'où trois choix produit :
frais affichés dès la carte d'événement, badge « organisateur vérifié », et gel du solde plutôt que
suspension de l'événement comme premier levier de modération (suspendre pénalise d'abord les
acheteurs).

**Le français allonge les libellés de 15 à 25 %** par rapport à l'anglais. Aucun bouton à largeur
fixe, marge d'une ligne de débordement sur chaque composant.

---

# 2. UTILISATEURS ET RÔLES

## 2.1 Vue d'ensemble

Le prototype distingue **deux plans de rôles** qu'il ne faut pas confondre :

- un **rôle global**, attaché à la personne sur la plateforme (utilisateur ordinaire, personnel de
  support, administrateur) ;
- une **appartenance à une organisation**, avec un rôle propre à cette organisation, une personne
  pouvant appartenir à plusieurs organisations avec des rôles différents.

Le rôle « organisateur » n'est donc **pas** un rôle global : c'est la conséquence d'appartenir à au
moins une organisation.

## 2.2 Visiteur (non authentifié)

**Peut** : consulter l'accueil, le catalogue, une page événement, une page organisateur, les
catégories, les pages légales et d'aide ; rechercher et filtrer ; partager ; consulter un billet via
un lien `/t/:token` reçu par WhatsApp.

**Ne peut pas** : finaliser un achat sans fournir au minimum un numéro de téléphone et un nom.

**Décision produit du prototype à retenir** : l'achat ne requiert pas de création de compte
préalable. Les coordonnées saisies pour le billet créent le compte silencieusement à la livraison.
Une inscription imposée avant paiement coûterait une part importante des conversions. Cette décision
a des conséquences en cascade (voir §8, ambiguïté A3).

## 2.3 Participant

**Peut** : tout ce que peut le visiteur, plus — consulter ses billets (à venir, utilisés, annulés),
afficher un QR en plein écran avec luminosité forcée, télécharger un PDF, partager un billet,
consulter l'historique de ses commandes et le détail d'une commande, recevoir des notifications
(paiement confirmé, rappel d'événement, changement d'horaire, publication d'un organisateur suivi),
modifier son profil, demander un remboursement selon la politique de l'événement, installer la PWA.

**Ne peut pas** : voir les données d'un autre participant, accéder à un espace organisation sans y
être membre.

## 2.4 Organisateur (propriétaire d'organisation)

Le prototype nomme ce rôle **Administrateur d'organisation** et le décrit en une phrase :
« peut tout faire, **y compris retirer l'argent** et supprimer l'organisation ».

**Peut** : créer et administrer l'organisation (nom, ville, logo, contacts, réseaux sociaux),
soumettre le dossier de vérification, créer et gérer des événements, définir les catégories de
billets et leurs périodes de vente, publier et dépublier, consulter les ventes et les statistiques,
gérer les participants et les exporter, inviter et révoquer des membres, consulter les finances,
enregistrer des comptes de réception et **demander des retraits**, annuler un événement et déclencher
les remboursements.

**Nuance à trancher** : le prototype ne distingue pas explicitement le _propriétaire_ (créateur,
unique, seul habilité à supprimer l'organisation ou à transférer la propriété) de l'_administrateur_
(qui peut tout le reste). La proposition retenue dans `TECHNICAL_ARCHITECTURE.md` §5 introduit cette
distinction, car sans elle un administrateur invité peut évincer le créateur.

## 2.5 Équipe d'organisation

Quatre rôles, décrits par le prototype « en une phrase chacun, jamais sous forme de matrice de cases
à cocher : un organisateur indépendant ne doit pas avoir à interpréter des permissions techniques ».

| Rôle               | Phrase affichée à l'utilisateur                                                                                                    | Portée technique                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Administrateur** | Peut tout faire, y compris retirer l'argent et supprimer l'organisation.                                                           | Toute l'organisation, finances incluses            |
| **Gestionnaire**   | Crée et gère les événements, les billets, les participants. Ne voit pas les retraits.                                              | Toute l'organisation sauf finances et équipe       |
| **Contrôleur**     | Voit uniquement le scanner de l'événement auquel il est assigné. Aucun accès aux données financières ni aux coordonnées complètes. | **Un événement précis**, parfois une porte précise |
| **Analyste**       | Lecture seule sur les statistiques et les finances. Pour un comptable ou un sponsor.                                               | Toute l'organisation, en lecture                   |

Deux points d'architecture en découlent :

1. Le rôle **Contrôleur est le seul dont la portée n'est pas l'organisation mais un événement** (voire
   une porte). Le modèle d'autorisation doit donc supporter un scope à trois niveaux :
   plateforme → organisation → événement.
2. Le contrôleur ne doit **pas** voir les coordonnées complètes des participants. Le carnet mis en
   cache sur son appareil doit être minimisé (nom, catégorie, référence tronquée), ce qui est aussi
   une mesure de protection en cas de perte du téléphone.

**Invitation** : lien à usage unique valable 7 jours, envoyé par WhatsApp. Pour un contrôleur, on
choisit en plus l'événement et la porte. Statuts d'appartenance : `Invité` → `Actif` → (`Suspendu` /
`Révoqué`).

**Journal d'activité** : toute action sensible est horodatée et attribuée (modification de quota,
demande de retrait, invitation, création de code promo). Non négociable dès qu'une équipe touche à
l'argent.

## 2.6 Administrateur de la plateforme

Interface **séparée** (`admin.nexakabi.bj`), accès restreint, **double authentification obligatoire**
selon le prototype.

**Peut** : consulter le tableau de bord global (volume, revenus plateforme, files d'attente), gérer
les utilisateurs (rechercher, suspendre), modérer les événements (valider, masquer, suspendre),
traiter la file de vérification des organisateurs, consulter et rechercher les transactions,
exporter la comptabilité, traiter les retraits et les remboursements, traiter les signalements,
**geler le solde d'un organisateur**, gérer les catégories, villes, commissions et mises en avant.

**Ne peut pas** : modifier une transaction. Le prototype est explicite — « une transaction n'est
jamais modifiable : seule une opération inverse (remboursement) est possible, elle-même traçable ».

**Trois contrôles de vérification suffisent** (règle métier posée par le prototype) :

1. Le nom sur la pièce d'identité correspond au titulaire du compte Mobile Money de retrait.
2. Le numéro de téléphone a été confirmé par code.
3. Pour une entreprise ou une association, le document légal existe et le nom correspond.

Le reste (site web, réseaux sociaux, ancienneté) est indicatif et n'entre pas dans la décision.

**Règle de conception majeure** : la vérification conditionne **le retrait des fonds, pas la vente**.
Un organisateur non vérifié peut publier et vendre, mais son solde reste bloqué. C'est la protection
la plus efficace contre les faux événements sans freiner l'activité légitime.

## 2.7 Matrice de synthèse des permissions

Légende : ● accès complet · ◐ accès partiel ou en lecture · ○ aucun accès

| Capacité                            | Visiteur | Participant  | Contrôleur | Analyste | Gestionnaire |    Admin org.    | Admin plateforme |
| ----------------------------------- | :------: | :----------: | :--------: | :------: | :----------: | :--------------: | :--------------: |
| Consulter le catalogue              |    ●     |      ●       |     ●      |    ●     |      ●       |        ●         |        ●         |
| Acheter un billet                   |    ◐     |      ●       |     ●      |    ●     |      ●       |        ●         |        ●         |
| Voir ses propres billets            |    ◐     |      ●       |     ●      |    ●     |      ●       |        ●         |        ●         |
| Créer une organisation              |    ○     |      ●       |     ●      |    ●     |      ●       |        ●         |        ●         |
| Créer / modifier un événement       |    ○     |      ○       |     ○      |    ○     |      ●       |        ●         |        ◐         |
| Publier / dépublier                 |    ○     |      ○       |     ○      |    ○     |      ●       |        ●         |        ◐         |
| Voir la liste des participants      |    ○     |      ○       |     ◐      |    ◐     |      ●       |        ●         |        ●         |
| Exporter les participants           |    ○     |      ○       |     ○      |    ◐     |      ●       |        ●         |        ●         |
| Scanner les billets                 |    ○     |      ○       |     ◐      |    ○     |      ●       |        ●         |        ○         |
| Voir les statistiques               |    ○     |      ○       |     ○      |    ◐     |      ●       |        ●         |        ●         |
| Voir les finances de l'organisation |    ○     |      ○       |     ○      |    ◐     |      ○       |        ●         |        ●         |
| Demander un retrait                 |    ○     |      ○       |     ○      |    ○     |      ○       |        ●         |        ○         |
| Gérer l'équipe                      |    ○     |      ○       |     ○      |    ○     |      ○       |        ●         |        ◐         |
| Supprimer l'organisation            |    ○     |      ○       |     ○      |    ○     |      ○       | ● (propriétaire) |        ◐         |
| Vérifier un organisateur            |    ○     |      ○       |     ○      |    ○     |      ○       |        ○         |        ●         |
| Geler un solde                      |    ○     |      ○       |     ○      |    ○     |      ○       |        ○         |        ●         |
| Traiter un signalement              |    ○     | ◐ (signaler) |     ○      |    ○     |      ○       |        ○         |        ●         |

---

# 3. ANALYSE DU DESIGN

Analyse extraite directement du prototype `Nexa-Kabi.dc.html` (écrans « Direction artistique »,
« Design system », « États UX »). Toutes les valeurs ci-dessous sont relevées dans le fichier, pas
reconstituées.

## 3.1 Intention artistique

Formule du prototype : **« La nuit d'un concert, la clarté d'une banque. »**

Deux registres coexistent :

- un fond **encre profonde** (`#12102B`) pour l'énergie et l'émotion — hero, sidebar, billet, verdict
  de scan, cartes de mise en avant ;
- des surfaces **papier chaud** (`#F6F5F2` / `#FFFFFF`) pour tout ce qui touche à l'argent et aux
  données — récapitulatif, tables, finances, administration.

Un **seul accent**, un corail vif, réservé à l'action. Aucun motif décoratif : la culture est portée
par les photos des événements, pas par des ornements ajoutés.

Attributs revendiqués : Moderne · Premium · Énergique · Culturel · Technologique.

## 3.2 Palette

### Couleurs principales

| Rôle            | Hex       | Usage précis relevé dans le prototype                             |
| --------------- | --------- | ----------------------------------------------------------------- |
| Encre · Primary | `#12102B` | Fonds immersifs, sidebar, texte principal, bouton secondaire fort |
| Encre 700       | `#1E1A48` | Élévation sur fond sombre, hover du bouton encre                  |
| Corail · Accent | `#FF4D2E` | Action principale, prix, date sur carte — **jamais décoratif**    |

### Couleurs de statut

| Rôle             | Hex       | Usage                                                |
| ---------------- | --------- | ---------------------------------------------------- |
| Menthe · Success | `#12B981` | Payé, billet valide, retrait effectué                |
| Ambre · Warning  | `#F0A92E` | En attente, billet déjà utilisé, hors ligne          |
| Rouge · Error    | `#E03535` | Échec, billet invalide, annulation                   |
| Bleu · Info      | `#3B82F6` | Information neutre, remboursement, virement en cours |

### Neutres et surfaces

| Rôle                                             | Hex                   |
| ------------------------------------------------ | --------------------- |
| Papier · Background                              | `#F6F5F2`             |
| Surface                                          | `#FFFFFF`             |
| Surface alternée (ligne de table, pied de carte) | `#FBFAF8`             |
| Bordure                                          | `#E7E4DC`             |
| Bordure de champ                                 | `#D8D4CA`             |
| Séparateur interne                               | `#EFECE5`             |
| Remplissage neutre (skeleton, désactivé)         | `#EDEAE2` / `#F1F0EC` |
| Texte principal                                  | `#12102B`             |
| Texte secondaire fort                            | `#3A3652`             |
| Texte secondaire                                 | `#6E6A80`             |
| Texte tertiaire / caption                        | `#9C98AC`             |
| Texte désactivé                                  | `#B4B0BE` / `#C4C0D0` |

### Teintes dérivées (fonds de badge et d'alerte)

| Teinte    | Fond                          | Texte                                    |
| --------- | ----------------------------- | ---------------------------------------- |
| Corail 50 | `#FFEDE8`                     | `#C0341A` (ou `#FF4D2E` pour les icônes) |
| Menthe 50 | `#EEFBF6`                     | `#0B7A57`                                |
| Ambre 50  | `#FFF7ED` (bordure `#F6E2C0`) | `#8A6A20` / `#C08A20`                    |
| Rouge 50  | `#FEECEC` (bordure `#F6C9C9`) | `#C42B2B`                                |
| Bleu 50   | `#EEF4FF` (bordure `#CFDDFA`) | `#2A5BC0`                                |
| Neutre 50 | `#F1F0EC`                     | `#5C5870`                                |

### Couleurs sur fond encre

| Rôle                             | Hex                             |
| -------------------------------- | ------------------------------- |
| Texte secondaire sur encre       | `#B9B5D0`                       |
| Texte tertiaire sur encre        | `#8A86A8` / `#6B6790`           |
| Accent clair sur encre (eyebrow) | `#FF9E86` / `#FFB9A9`           |
| Accent chiffré sur encre         | `#FF7A5C`                       |
| Succès sur encre                 | `#7BE3BF`                       |
| Fond d'élévation sur encre       | `rgba(255,255,255,.07)` à `.16` |

### Règles d'usage (posées explicitement par le prototype)

1. **Un seul élément corail par zone de décision.** Deux boutons corail visibles ensemble signalent
   une hiérarchie ratée.
2. Le **corail porte un texte encre**, jamais blanc : contraste supérieur et rendu moins « bouton web
   générique ».
3. Le corail n'est jamais utilisé pour du **texte courant** sur fond clair en dessous de 16 px
   semi-gras.
4. Contraste vérifié **AA** sur tous les couples texte/fond.
5. **Un statut n'est jamais porté par la couleur seule** : toujours un mot, plus un point ou une icône
   pour les cas critiques.

## 3.3 Typographie

Deux familles seulement, choisies pour leur support complet des diacritiques françaises :

- **Bricolage Grotesque** (400/500/700/800, axe optique 12–96) — titres, montants mis en avant, logo.
- **Plus Jakarta Sans** (400/500/600/700/800) — interface, corps de texte, libellés, tables.

Les montants utilisent systématiquement `font-variant-numeric: tabular-nums`.

### Échelle relevée

| Rôle               | Taille / interligne | Graisse | Letter-spacing       | Famille   |
| ------------------ | ------------------- | ------- | -------------------- | --------- |
| Display            | 56 / 1.02           | 700     | −0.035 em            | Bricolage |
| H1                 | 34 / 1.1            | 700     | −0.025 em            | Bricolage |
| H2                 | 24 / 1.2            | 700     | −0.02 em             | Bricolage |
| H3                 | 17 / 1.3            | 700     | 0                    | Jakarta   |
| Body L             | 15 / 1.65           | 400     | 0                    | Jakarta   |
| Body               | 13.5 / 1.6          | 400     | 0                    | Jakarta   |
| Body S             | 12.5 / 1.55         | 400–600 | 0                    | Jakarta   |
| Micro              | 11.5 / 1.5          | 400–700 | 0                    | Jakarta   |
| Caption            | 11 / 1.45           | 700     | +0.14 em, majuscules | Jakarta   |
| Eyebrow (section)  | 10 / 1.4            | 700     | +0.14 em, majuscules | Jakarta   |
| Montant principal  | 30–32               | 700     | −0.02 em, tabulaire  | Bricolage |
| Montant secondaire | 18–19               | 700     | tabulaire            | Jakarta   |
| Montant en table   | 13.5–15             | 600–700 | tabulaire            | Jakarta   |

Le suffixe `FCFA` est toujours à un poids et une taille inférieurs au chiffre, en `#6E6A80`.

### Règles typographiques

- Marge de débordement d'une ligne sur tout composant (allongement du français).
- Aucun bouton à largeur fixe.
- Aucune ligne de texte au-delà de **75 caractères** (limite appliquée au palier grand écran).
- Espace insécable comme séparateur de milliers : `5 000 FCFA`.
- Titre d'événement limité à 80 caractères, avec avertissement contre les majuscules complètes
  (tronquées sur mobile).

## 3.4 Espacement

Base 4, échelle explicitement documentée avec sa sémantique :

| Valeur | Usage                        |
| ------ | ---------------------------- |
| 4      | Icône ↔ label                |
| 8      | Éléments liés                |
| 12     | Intérieur de carte compacte  |
| 16     | Gouttière de grille          |
| 24     | Intérieur de carte standard  |
| 40     | Entre sections               |
| 72     | Respiration de page publique |

Valeurs intermédiaires observées dans les écrans : 6, 9, 10, 11, 13, 14, 18, 20, 22, 26, 30, 34.
Le prototype travaille donc en pas de 1 px autour de l'échelle nominale — l'implémentation devra
**normaliser sur l'échelle de 4** plutôt que reproduire chaque valeur au pixel près.

## 3.5 Rayons

| Valeur   | Usage                                              |
| -------- | -------------------------------------------------- |
| 6 px     | Badge                                              |
| 10 px    | Champ de formulaire                                |
| 11 px    | Bouton                                             |
| 14 px    | Carte                                              |
| 16–18 px | Carte de section, panneau                          |
| 24 px    | Bloc immersif, hero                                |
| 29–44 px | Cadre de maquette téléphone (prototype uniquement) |
| 999 px   | Pill, chip, avatar                                 |

## 3.6 Ombres

| Niveau              | Valeur                                 | Usage                          |
| ------------------- | -------------------------------------- | ------------------------------ |
| sm · repos          | `0 1px 2px rgba(18,16,43,.06)`         | Carte au repos                 |
| md · survol         | `0 6px 18px -6px rgba(18,16,43,.18)`   | Élévation au survol (120 ms)   |
| lg · sheet          | `0 20px 44px -16px rgba(18,16,43,.32)` | Bottom sheet, modale, dialogue |
| xl · maquette       | `0 20px 44px -26px rgba(18,16,43,.22)` | Encadré de page complète       |
| Bottom sheet mobile | `0 -20px 44px -16px rgba(18,16,43,.4)` | Ombre inversée vers le haut    |

## 3.7 Composants identifiés

### Boutons (hauteur tactile minimale 44 px, 48 px sur surfaces mobiles, 52–56 px pour les actions primaires mobiles)

| Variante            | Fond        | Texte               | Bordure       | Hover              |
| ------------------- | ----------- | ------------------- | ------------- | ------------------ |
| Primaire (corail)   | `#FF4D2E`   | `#12102B`, 700      | —             | `#E93F21`          |
| Encre               | `#12102B`   | `#FFFFFF`, 700      | —             | `#1E1A48`          |
| Secondaire          | `#FFFFFF`   | `#12102B`, 600      | `1px #D8D4CA` | `#F6F5F2`          |
| Tertiaire (lien)    | transparent | `#6E6A80`, 600      | —             | `#12102B`          |
| Destructif          | `#FEECEC`   | `#C42B2B`, 600      | `1px #F6C9C9` | `#FDDFDF`          |
| Destructif confirmé | `#E03535`   | `#FFFFFF`, 700      | —             | —                  |
| Icône seule         | `#FFFFFF`   | `#12102B`           | `1px #D8D4CA` | `#F6F5F2` — 44×44  |
| Chargement          | `#FFB9A9`   | `#12102B` + spinner | —             | `cursor: progress` |
| Désactivé           | `#EDEAE2`   | `#B4B0BE`           | —             | —                  |

### Formulaires

Champ standard : `min-height: 44px` (48 px en mobile), bordure `1px #D8D4CA`, rayon 10–11 px,
fond blanc, texte 14–16 px. Focus : bordure `#12102B` + `outline: 3px solid rgba(18,16,43,.10)`.

Variantes relevées : champ avec **préfixe pays** (`🇧🇯 +229` sur fond `#F6F5F2`, séparateur à droite),
champ avec **suffixe devise** (`FCFA` sur fond `#F6F5F2`, séparateur à gauche), select avec chevron
`▾` en `#9C98AC`, champ date/heure avec icône de tête, **zone de dépôt de fichier** (bordure
`1.5px dashed #D8D4CA`, fond `#FBFAF8`, pastille corail 44×44).

État d'erreur : bordure `#E03535`, fond `#FEF6F6`, libellé complété d'un motif en `#C42B2B`, message
d'aide sous le champ **orienté conséquence** (« Vérifie l'adresse : c'est là que le billet sera
envoyé en secours ») et non purement technique.

Saisie OTP : 6 cases de 56 px, bordure `1.5px`, case active en `#12102B` sur fond `#FBFAF8`,
collage automatique depuis le SMS sur Android.

### Badges de statut

Format constant : `font-size: 11.5px`, `font-weight: 700`, `padding: 5px 10px`, `border-radius: 7px`.

| Libellé                                               | Fond                        | Texte     |
| ----------------------------------------------------- | --------------------------- | --------- |
| Payé / En vente / Actif / Valide / Effectué / Vérifié | `#EEFBF6`                   | `#0B7A57` |
| En attente / À vérifier / Incomplet / Invité          | `#FFF7ED`                   | `#8A6A20` |
| Échoué                                                | `#FEECEC`                   | `#C42B2B` |
| Remboursé / En cours (virement)                       | `#EEF4FF`                   | `#2A5BC0` |
| Brouillon / Clôturé                                   | `#F1F0EC`                   | `#5C5870` |
| Publié                                                | `#12102B`                   | `#FFFFFF` |
| Bientôt complet / Gratuit                             | `#FFEDE8`                   | `#C0341A` |
| Entré · 19h42                                         | `#EEFBF6` + point `#12B981` | `#0B7A57` |
| ✓ Organisateur vérifié                                | `#12102B`                   | `#7BE3BF` |

### Carte d'événement — quatre variantes d'un même composant

| Variante        | Contexte                | Structure                                                                                                                                                                                                                                   |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Large**       | Sections principales    | 300×330, image plein cadre 3:4, dégradé encre vers le bas (`rgba(18,16,43,.94)` → transparent à 70 %), badges en haut à gauche, bloc texte en bas (eyebrow date corail clair, titre Bricolage 23 px, lieu, prix + frais)                    |
| **Standard**    | Listes, grilles         | 220 px, image 16:9 de 132 px, badge catégorie en haut à droite, corps blanc : eyebrow date corail, titre 15 px, lieu, ligne de pied séparée avec prix et places restantes                                                                   |
| **Horizontale** | Mobile, recommandations | Vignette 1:1 de 94 px, texte au centre, bouton « Billet » corail à droite                                                                                                                                                                   |
| **Compacte**    | Dashboard               | **Pas d'image** — pastille de date encre 42 px (mois en corail clair, jour en 16 px), titre tronqué, sous-ligne, badge de statut. Justification donnée : « dans un dashboard, la photo n'aide pas à décider et coûte de la bande passante » |

### Table de données (densité pro)

En-tête `#F6F5F2`, caption 11 px majuscules `#6E6A80`. Lignes séparées par `1px #EFECE5`, hover
`#FBFAF8`, ligne inactive sur fond `#FBFAF8` avec texte grisé. Colonnes numériques alignées à droite
en tabulaire. Menu `⋯` en fin de ligne. Pied de table sur `#F6F5F2` avec total à gauche et pagination
à droite (boutons 30×30, page active en encre).

**Comportement mobile** : la table devient une pile de cartes — libellé en titre, prix et restants en
ligne secondaire, statut en badge à droite, menu au balayage. **Aucun défilement horizontal.**

### Billet numérique

Objet composé : visuel 112 px avec dégradé et sur-titre, grille 2×2 d'informations
(participant, catégorie, lieu, ouverture), **perforation** (deux demi-cercles encre en débord + ligne
pointillée `repeating-linear-gradient`), QR de **176 px minimum**, référence en tabulaire avec
`letter-spacing: .04em`, badge « ✓ Disponible hors ligne », deux actions (Partager corail / PDF).

États du billet : **valide** (QR net), **utilisé** (QR à 35 % d'opacité, badge « ✓ Entré le … »),
**annulé** (QR à 25 %, mention `ANNULÉ` en `#C42B2B`, badge de remboursement).

### Feedback

- **Toast succès** : fond encre, coche `#7BE3BF`, titre + ligne de détail, croix de fermeture.
- **Bandeau warning** : `#FFF7ED` / bordure `#F6E2C0`, icône `◐`, texte `#8A6A20`.
- **Bandeau erreur** : `#FEECEC` / bordure `#F6C9C9`, texte `#C42B2B`, **toujours suivi d'une action**
  (« Modifier le numéro → »).
- **Dialogue de confirmation destructive** : conséquences chiffrées explicites (« 128 billets vendus
  pour 1 340 000 FCFA. Les participants seront remboursés sous 5 jours ouvrés »), bouton d'annulation
  neutre à gauche, action rouge à droite.

### Micro-interactions — trois seulement

Le prototype restreint volontairement pour tenir la promesse de légèreté :

1. Élévation de carte au survol (120 ms).
2. Compteur de montant qui s'incrémente au changement de quantité.
3. Pulsation du verdict de scan.

**Interdits explicites** : animation d'entrée de page, parallaxe, vidéo décorative, spinner plein
écran sur une liste.

## 3.8 Layouts identifiés

| Layout                  | Structure                                                                                                                                                            | Écrans concernés                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Public**              | En-tête 70 px (logo, nav, sélecteur de ville, lien pro, connexion) + contenu + pied de page                                                                          | Accueil, découverte, événement, organisateur |
| **Public immersif**     | Hero encre 340 px avec image et dégradé + contenu en deux colonnes (contenu / panneau d'achat collant)                                                               | Page événement                               |
| **Tunnel d'achat**      | Carte centrale max 760–880 px avec stepper en tête, pied d'action collant, colonne latérale 320 px explicative                                                       | Étapes 1 à 4                                 |
| **Espace participant**  | Navigation légère + contenu 1 colonne, cartes compactes                                                                                                              | Tableau de bord, billets, commandes          |
| **Espace organisateur** | Sidebar d'organisation persistante + sélecteur d'organisation ; en ouvrant un événement, **second niveau d'onglets** dans l'en-tête de l'événement avec fil d'Ariane | Vue générale, événements, finances, équipe   |
| **Assistant**           | En-tête (quitter / aperçu / enregistrer) + colonne d'étapes 240 px + contenu 660 px + pied navigation                                                                | Création d'événement, 8 étapes               |
| **Check-in**            | Plein écran mobile, une action par écran, verdict en fond de couleur pleine page                                                                                     | Sélection, scanner, verdicts                 |
| **Administration**      | Bandeau d'identification du sous-domaine + grille de KPI 4–5 colonnes + tables denses + panneau de détail latéral                                                    | Tous les écrans admin                        |

## 3.9 États UX — patron générique

Règle posée : **« Un écran n'est livré que lorsque ses cinq états sont dessinés. »**

| État                 | Traitement imposé                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vide (initial)**   | Icône 62 px sur fond corail 50, titre Bricolage 19 px, phrase d'aide, **bouton d'action principal**, lien secondaire (« Voir un exemple »)                                                                                    |
| **Vide (recherche)** | Titre reprenant la requête, puis **au moins deux relances** (élargir la zone, élargir la catégorie, créer une alerte). « Un état vide qui ne propose aucune sortie est un cul-de-sac »                                        |
| **Chargement**       | Squelette reprenant **exactement la géométrie finale** (aucun décalage à l'arrivée des données), animation de pulsation décalée de 0,15 s par élément. Jamais de spinner plein écran sur une liste                            |
| **Succès**           | Fond encre, pastille menthe 64 px, référence de commande en tabulaire, action principale corail + action WhatsApp secondaire                                                                                                  |
| **Erreur**           | Pastille rouge, titre explicite, **rassurance chiffrée** (« Aucun montant n'a été débité. Ton panier est conservé 28 minutes »), 2 à 3 sorties, et en pied la **cause probable** plus la référence — jamais un code brut seul |
| **Hors ligne**       | Bandeau ambre **non bloquant**. « Le hors-ligne n'affiche jamais une page pleine "pas de connexion" : on dégrade la fonctionnalité, on ne coupe pas l'accès »                                                                 |
| **Attente longue**   | Anneau de progression, message d'action (« Valide la demande sur ton téléphone »), barre de progression, **compte à rebours**, rappel « aucun débit tant que tu ne valides pas »                                              |

---

# 4. INVENTAIRE DES ÉCRANS

33 écrans sont formellement définis dans le prototype (constante `SCREENS`), dont 6 écrans de
documentation de conception. L'inventaire ci-dessous liste les **27 écrans applicatifs**, complétés
par les écrans implicites nécessaires mais non maquettés (marqués _déduit_).

Légende de la colonne **MVP** : ● dans le MVP · ○ post-MVP (entrées grises du sitemap du prototype).

## 4.1 Espace public

| #   | Nom                             | Objectif                                         | Utilisateur | Route                                                        | Fonctionnalités principales                                                                                                                                                                                                                                                                                                                                       |                             Responsive                             | MVP |
| --- | ------------------------------- | ------------------------------------------------ | ----------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------: | :-: |
| P1  | Accueil                         | Découverte immédiate, recherche en héros         | Visiteur    | `/`                                                          | Hero de recherche (ville, date, catégorie), sections éditorialisées (populaires, ce week-end, gratuits, proches, par catégorie), sélecteur de ville, CTA « Organiser un événement »                                                                                                                                                                               |            1 col. → 2 → 3 → 4 ; hero réduit sur mobile             |  ●  |
| P2  | Découvrir · recherche           | Filtres, tri, grille, chargement progressif      | Visiteur    | `/evenements?ville=&cat=&date=&prix=`                        | Filtres (aujourd'hui / semaine / week-end / mois, gratuit, payant, en ligne, présentiel, ville, catégorie, fourchette de prix), tri, bascule grille/liste, pagination progressive, état vide avec relances                                                                                                                                                        | Filtres en bottom sheet → panneau coulissant → colonne persistante |  ●  |
| P3  | Catégorie                       | Page d'atterrissage SEO par catégorie            | Visiteur    | `/evenements/categorie/[slug]`                               | Identique à P2, filtre préappliqué, texte d'introduction SEO                                                                                                                                                                                                                                                                                                      |                              idem P2                               |  ●  |
| P4  | Page événement                  | Convertir un visiteur en acheteur                | Visiteur    | `/e/[slug]`                                                  | Hero 340 px avec badges (catégorie, format, âge), titre, dates, lieu ; description, programme, intervenants ; **liste des catégories de billets avec prix et frais** ; carte et indications ; bon à savoir (conditions, âge, politique de remboursement) ; bloc organisateur ; partage ; **panneau d'achat collant** en desktop, **barre d'achat fixe** en mobile |       Panneau latéral collant ≥1024 ; barre fixe basse <768        |  ●  |
| P5  | Sélection de billets (modale)   | Choisir les catégories et quantités              | Visiteur    | `/e/[slug]/billets`                                          | Compteurs par catégorie, frais visibles immédiatement, quota max par personne, catégories épuisées, code promo                                                                                                                                                                                                                                                    |                Modale desktop / bottom sheet mobile                |  ●  |
| P6  | Profil organisateur             | Signal de confiance, catalogue de l'organisation | Visiteur    | `/o/[slug]`                                                  | Logo, description, badge vérifié, contacts, réseaux, événements à venir et passés, nombre d'événements réalisés                                                                                                                                                                                                                                                   |                         1 → 2 → 3 colonnes                         |  ●  |
| P7  | Recherche                       | Résultats textuels transverses                   | Visiteur    | `/recherche?q=`                                              | Résultats mixtes (événements, organisateurs, catégories), suggestions, état vide avec relances                                                                                                                                                                                                                                                                    |                         1 colonne partout                          |  ●  |
| P8  | Inscription · connexion         | Entrer sans friction                             | Visiteur    | `/connexion`, `/inscription`                                 | **3 étapes** : (1) numéro de téléphone `+229`, ou Google, ou email ; (2) code OTP 6 chiffres, renvoi + repli WhatsApp, compte à rebours 0:42 ; (3) nom complet + email facultatif + consentement alertes                                                                                                                                                          |                   Carte pleine largeur en mobile                   |  ●  |
| P9  | Récupération d'accès _(déduit)_ | Retrouver son compte                             | Visiteur    | `/mot-de-passe-oublie`                                       | Le prototype supprime le mot de passe ; cette route devient « accès par téléphone + code », à conserver pour les comptes email                                                                                                                                                                                                                                    |                             1 colonne                              |  ●  |
| P10 | Landing organisateur            | Convaincre un organisateur                       | Visiteur    | `/organiser`                                                 | Argumentaire, tarification, témoignages, CTA création d'organisation                                                                                                                                                                                                                                                                                              |                           1 → 2 colonnes                           |  ○  |
| P11 | Pages légales et aide           | Conformité et support                            | Visiteur    | `/a-propos`, `/aide`, `/cgu`, `/confidentialite`, `/contact` | Contenu statique, FAQ, contact WhatsApp                                                                                                                                                                                                                                                                                                                           |                             1 colonne                              |  ●  |

## 4.2 Tunnel d'achat

| #   | Nom                               | Objectif                                   | Utilisateur            | Route                                | Fonctionnalités principales                                                                                                                                                                                          |                 Responsive                 | MVP |
| --- | --------------------------------- | ------------------------------------------ | ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------: | :-: |
| A1  | Étape 1 · Billets et participants | Sélection des catégories, puis coordonnées | Visiteur / Participant | `/checkout/[orderRef]/billets`       | Stepper 4 étapes, compteurs de quantité, **nom par billet si l'événement l'exige**, téléphone d'abord et prérempli si connu, email facultatif                                                                        |     Étapes en bottom sheet sur mobile      |  ●  |
| A2  | Étape 2 · Récapitulatif           | Transparence totale des frais              | idem                   | `/checkout/[orderRef]/recapitulatif` | Liste des billets nominatifs, **détail du montant** (sous-total, frais de service explicités, code promo), total en 32 px, acceptation des conditions de vente et de la politique de remboursement, opt-in WhatsApp  | Colonne latérale explicative masquée <1024 |  ●  |
| A3  | Étape 3 · Paiement — choix        | Choisir le moyen de paiement               | idem                   | `/checkout/[orderRef]/paiement`      | Liste ordonnée pilotée par le back-office : MTN MoMo (recommandé), Moov Money, Celtiis Cash, carte bancaire, point de vente physique (désactivé, « Bientôt ») ; mention de non-conservation des codes secrets        |                 1 colonne                  |  ●  |
| A4  | Étape 3 · Paiement — attente      | Rassurer pendant la validation USSD        | idem                   | idem, état `pending`                 | Anneau de progression, montant et numéro rappelés, **compte à rebours d'expiration**, aide USSD (`*880#`), boutons « Renvoyer la demande » et « Changer de numéro », message de reprise en cas de perte de connexion |       1 colonne, plein écran mobile        |  ●  |
| A5  | Étape 3 · Paiement — succès       | Confirmer et livrer                        | idem                   | `/commandes/[ref]/confirmation`      | Fond encre, pastille menthe, récapitulatif (référence, événement, billets, montant, moyen), CTA « Voir mes billets », CTA « Envoyer sur WhatsApp »                                                                   |                 1 colonne                  |  ●  |
| A6  | Étape 3 · Paiement — échec        | Récupérer l'acheteur                       | idem                   | idem, état `failed`                  | « Aucun montant n'a été débité », panier conservé 28 min, réessayer avec le même opérateur, changer de moyen, support WhatsApp, **cause probable + référence**                                                       |                 1 colonne                  |  ●  |
| A7  | Étape 4 · Billet numérique        | Livrer le billet                           | Participant            | `/billets/[id]`, `/t/[token]`        | Billet composé avec perforation, QR ≥176 px, badge hors ligne, partage, PDF, luminosité forcée ; états utilisé / annulé                                                                                              |         Mobile-first, plein écran          |  ●  |

## 4.3 Espace participant

| #   | Nom                   | Objectif                                    | Route                         | Fonctionnalités principales                                                                                                                                                                      | MVP |
| --- | --------------------- | ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-: |
| U1  | Tableau de bord       | Mettre en avant le prochain événement       | `/mon-compte`                 | Prochain événement en carte large, accès rapide au QR, billets à venir, recommandations                                                                                                          |  ●  |
| U2  | Mes billets           | Retrouver un billet en toutes circonstances | `/mon-compte/billets`         | Onglets **À venir · Utilisés · Annulés**, bandeau « prêts hors ligne », carte par événement avec bouton « Voir le QR »                                                                           |  ●  |
| U3  | Détail d'un billet    | Afficher le QR                              | `/mon-compte/billets/[id]`    | Voir A7                                                                                                                                                                                          |  ●  |
| U4  | Mes commandes         | Historique et statuts                       | `/mon-compte/commandes`       | Liste avec référence, date, montant, statut ; filtre par statut                                                                                                                                  |  ●  |
| U5  | Détail d'une commande | Preuve d'achat                              | `/mon-compte/commandes/[ref]` | Détail des lignes, frais, moyen de paiement, reçu, demande de remboursement                                                                                                                      |  ●  |
| U6  | Notifications         | Centre d'alertes                            | `/mon-compte/notifications`   | 4 types seulement : paiement confirmé, rappel d'événement, changement d'information, publication d'un organisateur suivi. Chacune actionnable, aucune notification promotionnelle non sollicitée |  ●  |
| U7  | Profil                | Modifier ses informations                   | `/mon-compte/profil`          | Nom, téléphone (avec re-vérification), email, préférences de notification, suppression du compte                                                                                                 |  ●  |
| U8  | Favoris               | Sauvegarder des événements                  | `/mon-compte/favoris`         | —                                                                                                                                                                                                |  ○  |
| U9  | Organisateurs suivis  | Suivre une organisation                     | `/mon-compte/suivis`          | —                                                                                                                                                                                                |  ○  |
| U10 | Paramètres            | Langue, alertes                             | `/mon-compte/parametres`      | —                                                                                                                                                                                                |  ○  |

## 4.4 Espace organisateur (`/pro`)

| #   | Nom                                   | Objectif                   | Route                                 | Fonctionnalités principales                                                                                                                                                                                                        |   MVP    |
| --- | ------------------------------------- | -------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: |
| O1  | Vue générale                          | Piloter l'organisation     | `/pro`                                | Revenus, billets vendus, participants, check-in en cours, événements actifs, ventes récentes, sélecteur d'organisation                                                                                                             |    ●     |
| O2  | Mes événements                        | Liste et actions rapides   | `/pro/evenements`                     | Filtres par statut, actions dupliquer / dépublier / annuler, état vide « premier événement »                                                                                                                                       |    ●     |
| O3  | Créer un événement                    | Assistant guidé            | `/pro/evenements/nouveau`             | **8 étapes** : ① Informations générales ② Date et heure ③ Lieu ④ Visuels ⑤ Billets ⑥ Paramètres ⑦ Aperçu ⑧ Publication. Brouillon auto-sauvegardé, reprise exacte à l'étape                                                        |    ●     |
| O4  | Gestion d'un événement — Vue générale | Suivi d'un événement       | `/pro/e/[id]`                         | KPI de l'événement, courbe des ventes, actions rapides                                                                                                                                                                             |    ●     |
| O5  | — Billets                             | Gérer les catégories       | `/pro/e/[id]/billets`                 | Table (nom, prix, vendus, restants, statut), création, quotas, périodes de vente, billets cachés                                                                                                                                   |    ●     |
| O6  | — Participants                        | Gérer les inscrits         | `/pro/e/[id]/participants`            | Table (nom, contact, catégorie, statut de paiement, statut d'entrée), recherche, filtres, **export CSV/Excel**, renvoi de billet                                                                                                   |    ●     |
| O7  | — Check-in                            | Suivre les entrées         | `/pro/e/[id]/check-in`                | Compteur d'entrées, taux de présence, historique par contrôleur, conflits de double scan                                                                                                                                           |    ●     |
| O8  | — Promotions et invitations           | Codes promo et invitations | `/pro/e/[id]/promotions`              | Codes (pourcentage, montant fixe, gratuit), quotas, expiration, billets concernés ; invitations gratuites                                                                                                                          |    ○     |
| O9  | — Statistiques                        | Analyser                   | `/pro/e/[id]/statistiques`            | Ventes par jour, par catégorie, taux de présence, sources de trafic                                                                                                                                                                | ● (base) |
| O10 | — Paramètres                          | Modifier l'événement       | `/pro/e/[id]/parametres`              | Reprise des étapes de l'assistant, annulation d'événement                                                                                                                                                                          |    ●     |
| O11 | Revenus et retraits                   | Encaisser                  | `/pro/finances`                       | 5 KPI (revenus bruts, commission, frais opérateurs, remboursements, **solde disponible**), historique des retraits, **formulaire de retrait** (montant, compte de réception, montant net), relevé PDF, explication du solde bloqué |    ●     |
| O12 | Détail des retraits                   | Suivi d'une demande        | `/pro/finances/retraits/[id]`         | Statuts En attente → En cours → Effectué / Échoué, motif d'échec, action corrective                                                                                                                                                |    ●     |
| O13 | Équipe et rôles                       | Déléguer                   | `/pro/equipe`                         | Table des membres (avatar, contact, rôle, phrase d'accès, statut), invitation par téléphone ou email avec choix du rôle et de l'événement pour un contrôleur, **journal d'activité horodaté**                                      |    ●     |
| O14 | Organisation                          | Identité et vérification   | `/pro/organisation`                   | Nom, logo, description, contacts, réseaux, **dépôt des pièces de vérification**, comptes de réception                                                                                                                              |    ●     |
| O15 | Agents et points de vente             | Vente déléguée             | `/pro/agents`, `/pro/points-de-vente` | —                                                                                                                                                                                                                                  |    ○     |

## 4.5 Check-in (`/scan`)

| #   | Nom                     | Objectif                                 | Route                        | Fonctionnalités principales                                                                                                                                                                            | MVP |
| --- | ----------------------- | ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-: |
| C1  | Mes événements assignés | Choisir l'événement et charger le carnet | `/scan`                      | Événement du jour mis en avant, horaires, porte assignée, nombre attendu, **badge « Carnet à jour »**, événements futurs grisés (« le scan s'ouvrira 1 h avant »), bouton unique « Ouvrir le scanner » |  ●  |
| C2  | Scanner                 | Scanner en continu                       | `/scan/[eventId]`            | Caméra permanente, cadre de visée avec ligne animée, indicateur hors ligne, **compteurs entrées validées / en attente de sync**, torche, bouton « Recherche manuelle »                                 |  ●  |
| C3  | Verdict — billet valide | Autoriser l'entrée                       | idem, superposition          | **Fond vert plein écran**, coche 104 px, nom du participant en 19 px, catégorie, référence tronquée, heure d'entrée, **retour auto au scanner après 1,5 s**, « Annuler cette entrée »                  |  ●  |
| C4  | Verdict — déjà utilisé  | Alerter                                  | idem                         | **Fond ambre plein écran**, heure et porte de la première entrée, nom du porteur légitime, consigne (« vérifie la pièce d'identité »), « Autoriser malgré tout · responsable »                         |  ●  |
| C5  | Verdict — invalide      | Refuser et rebondir                      | idem                         | **Fond rouge**, message « Billet introuvable », puis bascule immédiate vers la **recherche manuelle**                                                                                                  |  ●  |
| C6  | Recherche manuelle      | Secours                                  | `/scan/[eventId]/recherche`  | Recherche par nom, téléphone ou **4 derniers caractères de la référence**, fonctionne hors ligne sur le carnet en cache, validation directe depuis le résultat                                         |  ●  |
| C7  | Historique              | Vérifier a posteriori                    | `/scan/[eventId]/historique` | Liste des scans de la session, annulation possible                                                                                                                                                     |  ●  |
| C8  | Comptage par porte      | Statistiques d'affluence                 | `/scan/[eventId]/comptage`   | —                                                                                                                                                                                                      |  ○  |

## 4.6 Administration (`admin.nexakabi.bj`)

| #   | Nom                       | Objectif               | Route                                                   | Fonctionnalités principales                                                                                                                                                                                        | MVP |
| --- | ------------------------- | ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-: |
| M1  | Dashboard global          | Piloter la plateforme  | `/`                                                     | Volume (GMV), revenus plateforme, utilisateurs, événements, **files d'attente** (vérifications, signalements, retraits)                                                                                            |  ●  |
| M2  | Modération des événements | Contrôler le catalogue | `/evenements`                                           | Recherche, filtres, actions valider / masquer / suspendre / supprimer, motif obligatoire                                                                                                                           |  ●  |
| M3  | Organisateurs             | Vérifier l'identité    | `/organisateurs`                                        | **File de vérification** triée par ancienneté, délai cible 48 h, panneau de dossier (pièces, responsable, téléphone vérifié, compte de retrait, ancienneté), actions Vérifier / Demander une pièce                 |  ●  |
| M4  | Utilisateurs              | Support                | `/utilisateurs`                                         | Recherche, consultation, suspension                                                                                                                                                                                |  ●  |
| M5  | Transactions              | Réconcilier            | `/transactions`                                         | 4 KPI (encaissé du jour, en attente opérateur, échecs 24 h, **écart de réconciliation**), table (référence, utilisateur, événement, moyen, montant, statut), filtres, **export comptable**, immuabilité des lignes |  ●  |
| M6  | Retraits                  | Traiter les versements | `/retraits`                                             | File, validation, exécution, motif d'échec                                                                                                                                                                         |  ●  |
| M7  | Signalements              | Modérer                | `/signalements`                                         | 4 compteurs (Nouveau / En cours / Résolu / Fermé sans suite), fiches avec contexte chiffré, actions Prendre en charge / Contacter / **Suspendre et geler les fonds** / Marquer résolu / Ajouter une note           |  ●  |
| M8  | Remboursements            | Arbitrer               | `/remboursements`                                       | Approuver, refuser, traiter                                                                                                                                                                                        |  ○  |
| M9  | Référentiels              | Configurer             | `/categories`, `/villes`, `/commissions`, `/parametres` | Catégories, villes, grilles de commission, ordre des moyens de paiement                                                                                                                                            |  ○  |
| M10 | Mises en avant            | Monétiser              | `/mises-en-avant`                                       | —                                                                                                                                                                                                                  |  ○  |

## 4.7 Écrans transverses _(déduits)_

| Nom                              | Route                 | Rôle                                                  |
| -------------------------------- | --------------------- | ----------------------------------------------------- |
| Erreur 404                       | `*`                   | État vide avec relances                               |
| Erreur 500                       | —                     | Message + référence d'incident + support WhatsApp     |
| Maintenance                      | —                     | Bandeau non bloquant si partielle                     |
| Invitation d'équipe              | `/invitation/[token]` | Acceptation d'un lien à usage unique, valable 7 jours |
| Consultation invitée d'un billet | `/t/[token]`          | Billet sans compte, hors ligne                        |

---

# 5. INFORMATION ARCHITECTURE

## 5.1 Découpage en domaines

Le prototype organise le produit en **cinq univers** avec des domaines distincts. Ce découpage est
repris tel quel car il porte des implications de sécurité et de performance.

| Univers            | Domaine / préfixe        | Caractéristique                                                                           |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------------------- |
| A · Public         | `nexakabi.bj`            | Sans compte, SEO, partage WhatsApp, léger avant tout                                      |
| B · Participant    | `nexakabi.bj/mon-compte` | Personnel, minimal, billet accessible hors ligne                                          |
| C · Organisateur   | `nexakabi.bj/pro`        | Dense, vocabulaire professionnel, deux niveaux (organisation puis événement)              |
| D · Check-in       | `nexakabi.bj/scan`       | Application dans l'application : 3 écrans, forts contrastes, une main, hors ligne         |
| E · Administration | `admin.nexakabi.bj`      | **Sous-domaine séparé**, tables denses, files de traitement, traçabilité, 2FA obligatoire |

## 5.2 Sitemap complet

```
nexakabi.bj
│
├─ /                                   Accueil                                    MVP
├─ /evenements                         Découvrir                                  MVP
│  ├─ ?ville= &cat= &date= &prix= &format=
│  └─ /categorie/[slug]                Page catégorie (SEO)                       MVP
├─ /e/[slug]                           Page événement                             MVP
│  └─ /billets                         Sélection (modale / sheet)                 MVP
├─ /o/[slug]                           Profil organisateur                        MVP
├─ /recherche?q=                       Recherche transverse                       MVP
├─ /t/[token]                          Billet invité, hors ligne, sans compte     MVP
├─ /invitation/[token]                 Acceptation d'invitation d'équipe          MVP
│
├─ /connexion                          Téléphone → OTP                            MVP
├─ /inscription                        Idem + complément de profil                MVP
├─ /acces-perdu                        Reconnexion par téléphone                  MVP
│
├─ /checkout/[orderRef]
│  ├─ /billets                         Étape 1 · billets et participants          MVP
│  ├─ /recapitulatif                   Étape 2 · récapitulatif et frais           MVP
│  └─ /paiement                        Étape 3 · choix, attente, succès, échec    MVP
│
├─ /mon-compte                         Tableau de bord participant                MVP
│  ├─ /billets                         À venir · utilisés · annulés               MVP
│  │  └─ /[id]                         QR plein écran                             MVP
│  ├─ /commandes                       Historique                                 MVP
│  │  └─ /[ref]                        Détail et reçu                             MVP
│  ├─ /notifications                                                              MVP
│  ├─ /profil                                                                     MVP
│  ├─ /favoris                                                                    post
│  ├─ /suivis                                                                     post
│  └─ /parametres                                                                 post
│
├─ /pro                                Vue générale organisation                  MVP
│  ├─ /evenements                      Liste                                      MVP
│  │  └─ /nouveau                      Assistant 8 étapes                         MVP
│  ├─ /e/[id]                          Gestion d'un événement                     MVP
│  │  ├─ (vue générale)                                                           MVP
│  │  ├─ /billets                                                                 MVP
│  │  ├─ /participants                                                            MVP
│  │  ├─ /check-in                                                                MVP
│  │  ├─ /statistiques                                                            MVP
│  │  ├─ /parametres                                                              MVP
│  │  └─ /promotions                   Codes promo et invitations                 post
│  ├─ /finances                        Solde, commissions, historique             MVP
│  │  └─ /retraits/[id]                Détail d'une demande                       MVP
│  ├─ /equipe                          Membres, rôles, invitations, journal       MVP
│  ├─ /organisation                    Identité, vérification, comptes            MVP
│  ├─ /agents                                                                     post
│  └─ /points-de-vente                                                            post
│
├─ /scan                               Événements assignés au contrôleur          MVP
│  └─ /[eventId]
│     ├─ (scanner)                                                                MVP
│     ├─ /recherche                    Recherche manuelle hors ligne              MVP
│     ├─ /historique                                                              MVP
│     └─ /comptage                     Par porte                                  post
│
├─ /organiser                          Landing professionnelle                    post
├─ /a-propos · /aide · /contact                                                   MVP
└─ /cgu · /confidentialite · /cgv                                                 MVP

admin.nexakabi.bj
├─ /                                   Dashboard global                           MVP
├─ /utilisateurs                                                                  MVP
├─ /organisateurs                      + file de vérification                     MVP
├─ /evenements                         Modération                                 MVP
├─ /transactions                       + export comptable                         MVP
├─ /retraits                                                                      MVP
├─ /signalements                                                                  MVP
├─ /remboursements                                                                post
├─ /categories · /villes                                                          post
├─ /commissions · /parametres                                                     post
└─ /mises-en-avant                                                                post
```

## 5.3 Conventions de routes

| Convention                                          | Raison                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/e/[slug]` et `/o/[slug]` (préfixes courts)        | Lien partagé sur WhatsApp le plus court possible ; l'exemple du prototype `nxk.bj/yele` confirme la recherche de compacité |
| Slug d'événement lisible et stable                  | `nexakabi.bj/e/yele-2026` — SEO et mémorisation ; le slug ne change pas après publication (redirection 301 si renommage)   |
| `/t/[token]` distinct de `/mon-compte/billets/[id]` | Deux chemins d'accès au même billet : l'un authentifié, l'autre par jeton public à durée de vie contrôlée                  |
| Filtres en **query string**, pas en segments        | Partageable, indexable, combinable ; les catégories ont en plus une route dédiée pour le SEO                               |
| `/pro` plutôt que `/organisateur`                   | Court, cohérent avec le vocabulaire professionnel de l'espace                                                              |
| `/scan` sur le domaine principal                    | Le contrôleur reçoit un lien WhatsApp ; un sous-domaine supplémentaire complique l'installation PWA                        |
| `admin.` en sous-domaine                            | Isolation du bundle, des cookies et de la surface d'attaque                                                                |
| Toutes les routes en français                       | Public béninois francophone ; cohérence avec les libellés du prototype                                                     |

## 5.4 Navigation

**Public — desktop** : logo · Découvrir · Catégories · Ce week-end · Aide | recherche | sélecteur de
ville · « Organiser un événement » · Connexion.

**Public — mobile** : barre basse à **5 onglets** — Accueil, Découvrir, Billets, Alertes, Profil.
La recherche vit dans l'écran Découvrir, **pas dans un onglet** (décision explicite du prototype).

**Organisateur** : sidebar persistante avec sélecteur d'organisation en tête. À l'ouverture d'un
événement, un **second niveau d'onglets** apparaît dans l'en-tête de l'événement, avec fil d'Ariane
de retour. En mobile : sidebar en tiroir, actions clés en barre basse.

**Check-in** : aucune navigation globale. Retour arrière uniquement.

**Administration** : sidebar dense, files de traitement en tête.

---

# 6. PARCOURS CRITIQUES

Le prototype identifie cinq parcours pilotes et marque d'un `◆` chaque bifurcation qui doit être
conçue explicitement — « c'est là que les plateformes perdent leurs utilisateurs ».

## 6.1 Parcours 1 — Du lien WhatsApp au billet en poche

**Cible : moins de 90 secondes, 3 taps hors saisie du code Mobile Money.**

```
Lien WhatsApp partagé
  (aperçu riche : image, date, prix)
        ↓
Page événement  /e/[slug]
  (barre d'achat fixe en bas sur mobile)
        ↓
Sheet · Billets et quantité
  (frais visibles immédiatement)
        ↓
Sheet · Coordonnées
  (téléphone d'abord, prérempli si connu)
        ↓
Récapitulatif
  (montant identique à celui vu sur la carte d'événement)
        ↓
◆ Choix du moyen de paiement
        ↓
◆ ATTENTE Mobile Money
  timeout 3 min · relance possible
  JAMAIS d'échec affiché avant le webhook
        ↓
Webhook opérateur → confirmation serveur
        ↓
Génération des billets + compte créé en silence
        ↓
SUCCÈS · billet + QR + envoi WhatsApp
```

**Bifurcations et sorties d'erreur à concevoir** :

| Situation                         | Comportement attendu                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Solde Mobile Money insuffisant    | Proposer un autre numéro **ou** un autre opérateur, panier conservé                                  |
| Expiration du délai opérateur     | Commande conservée 30 minutes, reprise possible, places toujours bloquées                            |
| Billets épuisés pendant la saisie | Bascule proposée vers la catégorie disponible la plus proche                                         |
| L'utilisateur ferme la page       | La transaction continue ; le statut est visible dans « Mes commandes » et mis à jour automatiquement |
| Perte de connexion                | Idem — le webhook fait foi, pas le navigateur                                                        |
| Double soumission                 | Idempotence par référence de commande                                                                |

## 6.2 Parcours 2 — Retrouver son billet

Trois portes d'entrée **volontairement redondantes**, parce qu'un billet introuvable à la porte est
un échec produit :

1. Onglet « Mes billets » de la PWA (QR mis en cache dès la première ouverture) ;
2. Lien direct `/t/[token]` reçu par WhatsApp ou SMS, consultable **hors ligne** ;
3. Reconnexion par numéro de téléphone + code à 6 chiffres, **sans mot de passe** — un participant qui
   change de téléphone la veille retrouve son billet avec son seul numéro.

Quatrième filet : le PDF téléchargé.

## 6.3 Parcours 3 — Organisateur, de zéro à la première vente

```
1. Créer l'organisation
   nom · ville · logo · téléphone
        ↓
2. Assistant événement en 8 étapes
   brouillon auto-sauvegardé, reprise exacte à l'étape
        ↓
3. Types de billets + périodes de vente
        ↓
◆ PUBLICATION CONDITIONNELLE
   L'événement est publiable immédiatement,
   mais le RETRAIT reste bloqué tant que
   l'identité n'est pas vérifiée.
   → On ne freine pas la vente, on sécurise l'argent.
        ↓
4. Kit de promotion généré automatiquement
   visuel 1:1 Instagram · visuel 9:16 statut WhatsApp
   lien court nxk.bj/[slug] · message pré-rédigé · QR à imprimer
        ↓
✓ Première vente
   → notification push + invitation à ajouter un contrôleur
```

Étape 8 — machine à états de publication relevée dans le prototype :

`Brouillon` → `Prêt à publier` (tous les contrôles obligatoires passés) → `Vérification plateforme`
(automatique sous 2 h pour un organisateur vérifié, **manuelle au premier événement**) → `Publié`.

## 6.4 Parcours 4 — Le contrôleur à la porte

```
1. Lien d'invitation WhatsApp
   → PWA installée, aucun mot de passe (code à 6 chiffres)
        ↓
2. Choix de l'événement
   → carnet de billets mis en cache (612 jetons dans l'exemple)
        ↓
3. Caméra ouverte en permanence, scan automatique
        ↓
◆ VERDICT EN PLEINE PAGE
   vert / ambre / rouge, lisible à un mètre, + vibration distincte
        ↓
4. Retour auto au scanner après 1,5 s
   → aucun tap requis si le billet est valide
        ↓
↺ Secours : recherche par nom, téléphone,
   ou 4 derniers caractères de la référence
```

**Règles de conception non négociables** :

- Verdict en **moins d'une seconde**, **zéro tap** si le billet est valide.
- Le fond entier change de couleur — un badge dans un coin ne se lit pas à bout de bras dans la
  pénombre.
- Le scan fonctionne **hors ligne** ; un compteur « en attente de sync » reste visible pour que le
  contrôleur sache que rien n'est perdu.
- **Double scan simultané** : deux contrôleurs hors ligne peuvent valider le même billet. À la
  synchronisation, le second devient un **conflit signalé à l'organisateur** — jamais une erreur
  affichée au contrôleur pendant l'événement, qui ne peut rien y faire sur le moment.

## 6.5 Parcours 5 — Encaisser ses recettes

```
Solde disponible = billets encaissés − commission − frais opérateurs − remboursements
        ↓
Date de déblocage affichée
   J+2 après l'événement pour un nouvel organisateur
   après 3 événements sans incident : 60 % immédiat
        ↓
Demande de retrait
   montant (min. 5 000 FCFA) · frais 1 % plafonnés à 2 000 FCFA
   choix du compte Mobile Money ou bancaire
   → montant net affiché avant validation
        ↓
En attente → En cours → Effectué
   chaque changement notifié
        ↓
◆ ÉCHEC
   L'argent n'est jamais perdu : retour au solde sous 24 h,
   notification expliquant la cause exacte
   (« le numéro n'est pas un compte marchand »),
   + bouton pour corriger le compte de destination.
   Jamais un simple message rouge.
```

## 6.6 Parcours 6 — Modération d'un signalement _(déduit du prototype admin)_

```
Signalement déposé par un participant
        ↓
Nouveau — non assigné, compteur de 4 h ouvrées visible
        ↓
En cours — un nom, une action engagée, notes horodatées
        ↓
◆ LEVIER DE PREMIER RECOURS : GELER LE SOLDE
   Suspendre un événement pénalise d'abord les acheteurs.
   Le gel laisse la vente continuer, empêche l'argent de partir,
   et donne à l'organisateur une raison concrète de répondre dans l'heure.
        ↓
Résolu (action décrite, signalant informé)
   ou Fermé sans suite (motif obligatoire, réouvrable)
```

---

# 7. STRATÉGIE RESPONSIVE

Le prototype est explicite : **« Ce ne sont pas des redimensionnements : la structure change à chaque
palier parce que la tâche change. »**

## 7.1 Les quatre paliers

| Palier          | Largeur        | Structure                                                                                                                                                                    |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mobile**      | 360 – 767 px   | 1 colonne · filtres en **bottom sheet** · navigation basse à 5 onglets · cartes 4:5 · barre d'action fixe · **aucune table, uniquement des cartes**                          |
| **Tablette**    | 768 – 1023 px  | 2 colonnes · filtres en panneau coulissant · navigation haute réapparaît · les tables professionnelles deviennent des cartes larges à deux niveaux d'information             |
| **Desktop**     | 1024 – 1439 px | Filtres en colonne persistante · grille de 3 · tri et bascule grille/liste · tables complètes côté professionnel · **panneau latéral d'achat collant** sur la page événement |
| **Grand écran** | ≥ 1440 px      | Grille de 4 · largeur de contenu **plafonnée à 1440 px** · colonne contextuelle (carte, recommandations) · aucune ligne de texte au-delà de 75 caractères                    |

## 7.2 Ce qui ne change jamais

- Le **prix** et le **CTA d'achat** sont visibles à tous les paliers **sans défilement**.
- La hiérarchie typographique est identique ; seules les tailles de titre bougent
  (Display : 52 → 24 px).
- Les hauteurs tactiles minimales (44 px, 48 px en mobile) s'appliquent partout, y compris en desktop.

## 7.3 Ce qui disparaît sur mobile

Colonnes contextuelles, graphiques secondaires, tables.

**Point d'architecture important** : le prototype précise que « rien n'est masqué en CSS : les
composants concernés ne sont simplement pas montés, pour ne pas payer leur poids de chargement ».

Cela impose une stratégie mixte plutôt qu'un `display:none` généralisé :

| Cas                                                                                             | Technique                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Changement de disposition (colonnes, gouttières, ordre)                                         | CSS pur (grille / flex + breakpoints Tailwind) — aucun coût JS                                                                          |
| Composant lourd absent en mobile (graphique de statistiques, carte interactive, table complexe) | Import dynamique conditionné par un hook de breakpoint, avec rendu mobile-first par défaut au SSR pour éviter un décalage d'hydratation |
| Composant exclusivement mobile (bottom sheet, barre d'achat fixe, scanner)                      | Import dynamique côté client uniquement                                                                                                 |

## 7.4 Ce qui n'existe qu'en mobile

Le scanner de check-in, l'installation PWA, les bottom sheets, la barre d'achat fixe, et **l'affichage
plein écran du QR avec luminosité forcée**.

## 7.5 Conséquences sur les composants

| Composant            | Mobile                                      | Tablette                  | Desktop                                | Grand écran                              |
| -------------------- | ------------------------------------------- | ------------------------- | -------------------------------------- | ---------------------------------------- |
| Carte d'événement    | Horizontale ou 4:5 pleine largeur           | Standard, 2 par ligne     | Standard, 3 par ligne                  | Standard, 4 par ligne                    |
| Filtres              | Bottom sheet déclenché par un bouton        | Panneau coulissant        | Colonne persistante 260 px             | Colonne persistante                      |
| Table de données     | Pile de cartes, menu au balayage            | Cartes larges à 2 niveaux | Table complète                         | Table complète + colonne d'actions       |
| Page événement       | Contenu linéaire + barre d'achat fixe basse | Idem, contenu plus large  | Deux colonnes, panneau d'achat collant | Trois zones (contenu, achat, contextuel) |
| Tunnel d'achat       | Étapes en bottom sheet plein écran          | Carte centrée             | Carte + colonne explicative            | Idem, largeur plafonnée                  |
| Sidebar organisateur | Tiroir + barre basse d'actions              | Tiroir                    | Persistante 240–274 px                 | Persistante                              |
| Billet               | Plein écran, QR ≥176 px, luminosité forcée  | Centré                    | Centré, colonne d'explication          | Idem                                     |

---

# 8. AMBIGUÏTÉS, HYPOTHÈSES ET POINTS À TRANCHER

Conformément à la règle « ne pas inventer silencieusement une logique métier », chaque point ci-dessous
identifie l'ambiguïté, propose une résolution, et indique ce qui est bloquant.

## A1 — Modèle de commission : TRANCHÉ ✅

> **Révision du 3 septembre 2026.** Une première lecture concluait à une contradiction entre le
> récapitulatif et l'encart de répartition. La vérification des montants montre que **la structure
> est cohérente** ; l'écart porte uniquement sur la formule des frais de service. Sévérité abaissée
> de 🔴 bloquant à 🟠 important.

**Constat.** Les montants du prototype se recoupent parfaitement :

```
Récapitulatif                              Répartition du montant
  Sous-total billets      10 000             Organisateur            8 550
  Frais de service         + 500             Commission plateforme     500
  Code promo YELE25      − 1 000             Frais opérateur MoMo      450
  ─────────────────────────────              ─────────────────────────────
  Total à payer            9 500                                     9 500

  organisateur = 10 000 − 1 000 − 450 = 8 550  ✓
```

Les frais de service sont donc **ajoutés au participant** (modèle B) et les frais opérateur
**prélevés sur la part organisateur**. L'écran _Revenus et retraits_ présente la même réalité sous un
autre angle (déduction depuis le brut encaissé), sans contradiction.

**L'ambiguïté résiduelle est plus étroite** : le libellé annonce « 5 % du prix du billet **+ 100 FCFA
par billet** », ce qui donnerait 700 FCFA sur ce panier, alors que le montant affiché est 500 — soit
les 5 % seuls. Par ailleurs, l'écran finances qualifie les 100 FCFA de « frais opérateurs par
transaction », et non de part fixe de la commission.

**Proposition retenue et implémentée.** Grille paramétrable versionnée
(`packages/contracts/src/fees.ts`), applicable au niveau plateforme, organisation ou événement :

```
commission_plateforme = pourcentage × sous_total + montant_fixe × nb_billets_payants
répartition           = buyerSharePercent ∈ [0..100]   → modèles A, B ou C
frais_operateur       = coût réel facturé par le PSP, toujours à charge organisateur
```

Valeurs par défaut alignées sur les **montants** affichés (qui font foi sur le libellé) :
`percentageBps = 500`, `fixedAmountPerTicket = 0`, `buyerSharePercent = 100`. Les trois modèles sont
couverts par les tests ; basculer de l'un à l'autre est un changement de configuration, sans
migration ni reprise de code.

**Décision prise le 4 septembre 2026** : **5 % avec un plancher de 100 FCFA par commande**, et non
une part fixe par billet.

Le raisonnement, arbitré entre les trois intérêts en présence :

| Prix du billet | 5 % seul | Avec +100 **par billet** | Poids réel |
| -------------- | -------- | ------------------------ | ---------- |
| 1 000 FCFA     | 50       | 150                      | **15 %**   |
| 3 000 FCFA     | 150      | 250                      | 8,3 %      |
| 5 000 FCFA     | 250      | 350                      | 7 %        |
| 25 000 FCFA    | 1 250    | 1 350                    | 5,4 %      |

Une part fixe **par billet** pèse démesurément sur les petits prix — précisément le segment le plus
courant au Bénin et celui qui porte l'accessibilité du produit. Mais la plateforme supporte un coût
fixe réel **par transaction** : frais opérateur Mobile Money, SMS, génération et livraison du billet.
Sans plancher, une commande à 500 FCFA coûterait plus cher à traiter qu'elle ne rapporterait.

Le plancher **par commande** couvre ce coût une fois, ce qui correspond à sa nature réelle, sans
pénaliser l'achat groupé de petits billets. Aucun plafond n'est appliqué : il transférerait à la
plateforme le coût des gros paniers, qui sont ceux qui financent le service.

Le scénario du prototype reste inchangé : 5 % de 10 000 = 500, au-dessus du plancher.

La grille reste versionnée et modifiable par configuration, au niveau plateforme, organisation ou
événement.

## A2 — Format des numéros de téléphone béninois 🔴 bloquant

**Constat.** Le prototype affiche partout des numéros à 8 chiffres (`+229 97 44 12 08`). Le Bénin a
migré vers un plan de numérotation à **10 chiffres** (préfixe `01` ajouté). Le numéro étant
l'identifiant d'authentification et la clé de rapprochement Mobile Money, une erreur ici casse
l'inscription et le paiement.

**Proposition.** Normaliser en **E.164** en base (`+2290197441208`), afficher au format national, et
implémenter une **règle de migration** acceptant l'ancien format à la saisie en le convertissant.
Valider le plan de numérotation en vigueur avec l'ARCEP-Bénin avant la Phase 3.

**Bloquant** : oui.

## A3 — Achat sans compte et création silencieuse 🟠 important

**Constat.** Le prototype crée le compte « en silence » à partir des coordonnées de l'achat. Trois
questions non tranchées :

1. Que se passe-t-il si le numéro correspond déjà à un compte existant ? (Rattachement automatique de
   la commande à ce compte, sans vérification, permettrait à un tiers d'associer une commande à un
   compte qui n'est pas le sien.)
2. Le consentement aux CGU/CGV est-il recueilli ? (Oui, l'écran récapitulatif comporte une case
   d'acceptation — à conserver comme preuve horodatée.)
3. Le compte créé est-il « actif » ou « en attente de vérification » ?

**Proposition.** Créer un compte à l'état `UNVERIFIED` rattaché au numéro. Les billets sont accessibles
via `/t/[token]` sans authentification. La bascule vers `ACTIVE` (et donc l'accès à l'espace
`/mon-compte`) exige une vérification OTP du numéro. Si le numéro correspond à un compte `ACTIVE`
existant, la commande est rattachée mais l'accès à l'espace personnel exige l'OTP.

**Bloquant** : non, mais structurant pour le modèle `User`.

## A4 — Politique de déblocage du solde 🟠 important

**Constat.** Le prototype pose : « J+2 après l'événement pour les nouveaux organisateurs, immédiat
après vérification » dans le parcours 5, puis « libérées 48 h après sa tenue » et « après trois
événements réalisés sans incident, le déblocage devient immédiat à hauteur de 60 % des ventes » dans
l'écran finances. Ces deux formulations ne coïncident pas exactement.

**Proposition.** Retenir la version détaillée de l'écran finances, exprimée comme une **politique
paramétrable** :

| Palier | Condition                                | Règle                                                   |
| ------ | ---------------------------------------- | ------------------------------------------------------- |
| 0      | Organisation non vérifiée                | Solde intégralement bloqué, retrait impossible          |
| 1      | Vérifiée, moins de 3 événements réalisés | Déblocage à J+48 h après la fin de l'événement          |
| 2      | Vérifiée, ≥ 3 événements sans incident   | 60 % des ventes débloqués immédiatement, solde à J+48 h |

Politique stockée en configuration, pas en dur.

**Bloquant** : non.

## A5 — Statut de vérification d'un événement 🟠 important

**Constat.** L'étape 8 de l'assistant décrit une « Vérification plateforme : automatique sous 2 h pour
un organisateur vérifié · manuelle au premier événement », mais le sitemap présente la publication
comme immédiate et le parcours 3 dit « publiable immédiatement ».

**Proposition.** Deux chemins selon l'organisation :

- Organisation vérifiée avec au moins un événement publié → `PUBLISHED` immédiatement, contrôle
  automatique a posteriori.
- Premier événement, ou organisation non vérifiée → `PENDING_REVIEW`, visible uniquement par lien
  privé, publication effective après validation par un administrateur (SLA 2 h ouvrées).

**Bloquant** : non, mais affecte la machine à états `Event`.

## A6 — Nom du participant obligatoire ou non 🟡 mineur

**Constat.** L'étape 6 de l'assistant propose « Nom requis par billet : Non · concert », donc un
paramètre par événement. Mais le billet affiche systématiquement un nom de participant, et le
contrôleur vérifie « la pièce d'identité » en cas de double scan.

**Proposition.** Paramètre `requiresAttendeeName` sur l'événement. Si `false`, tous les billets d'une
commande portent le nom de l'acheteur. Le champ reste donc toujours renseigné en base, ce qui évite
un cas nul dans le carnet de scan.

**Bloquant** : non.

## A7 — Transfert de billet 🟡 mineur

**Constat.** Le prototype mentionne que deux places donnent « deux billets distincts, **transférables
séparément par lien** ». Cette fonctionnalité n'est pas décrite par le cahier des charges et n'a pas
d'écran.

**Proposition.** Ne pas implémenter le transfert nominatif au MVP. Le lien `/t/[token]` est de fait
transférable (n'importe qui le détenant peut afficher le QR), ce qui suffit à l'usage réel décrit.
Prévoir dans le modèle un champ de traçabilité (`transferredAt`, `transferredToPhone`) pour une
évolution ultérieure, sans logique associée.

**Bloquant** : non.

## A8 — Celtiis Cash 🟡 mineur

**Constat.** Le prototype propose trois opérateurs Mobile Money (MTN MoMo, Moov Money, **Celtiis
Cash**) alors que le cahier des charges n'en cite que deux.

**Proposition.** L'architecture par provider rend l'ajout trivial. Confirmer la disponibilité d'une
API marchand Celtiis avant de l'annoncer dans l'interface. Traiter les trois de la même façon dans le
modèle, l'ordre d'affichage étant piloté par le back-office (« à Cotonou MTN d'abord, à Dakar Wave
d'abord »).

**Bloquant** : non.

## A9 — Facturation, TVA et obligations fiscales 🟠 important

**Constat.** Le cahier des charges (§24) demande des factures participant et organisateur, ainsi que
des factures de commission. Le prototype ne comporte aucun écran de facturation ; il parle de
« reçu » et de « relevé PDF ».

**Proposition.** Distinguer trois documents et ne livrer que le premier au MVP :

| Document                          | Nature                                                          | MVP |
| --------------------------------- | --------------------------------------------------------------- | --- |
| **Reçu de commande**              | Preuve d'achat sans valeur fiscale, généré automatiquement      | ●   |
| **Relevé de ventes organisateur** | Récapitulatif périodique, PDF                                   | ●   |
| **Facture de commission**         | Document fiscal avec IFU, TVA, numérotation séquentielle légale | ○   |

La facture de commission exige une validation par un expert-comptable béninois (régime de TVA
applicable aux services numériques, mentions obligatoires, numérotation). **À ne pas improviser.**

**Bloquant** : non pour le MVP, oui pour la commercialisation.

## A10 — Statut réglementaire de la détention de fonds 🔴 risque juridique

**Constat.** Nexa-Kabi encaisse pour le compte de tiers et conserve les fonds jusqu'au retrait. Dans
l'espace UEMOA, cette activité peut relever de la réglementation BCEAO sur les établissements de
paiement / de monnaie électronique.

**Proposition.** Structurer l'architecture pour que **les fonds ne transitent jamais par un compte
propre** de Nexa-Kabi si le montage juridique le permet : utiliser un PSP agréé offrant des
sous-comptes marchands ou un mécanisme de _split payment_. À défaut, opérer sous le statut d'agent
d'un établissement agréé. Le modèle de données (grand livre) reste valable dans les deux cas.

**Bloquant** : oui pour la mise en production, non pour le développement.

## A11 — Nom et domaine 🟡 mineur

Le cahier des charges laisse le nom « à définir ». Le prototype tranche pour **Nexa-Kabi** avec
`nexakabi.bj`, `admin.nexakabi.bj` et le lien court `nxk.bj`. Hypothèse retenue : ce nom est validé.
Vérifier la disponibilité des trois domaines et le dépôt de marque avant la Phase 2.

## A12 — Périmètre exact des statistiques MVP 🟡 mineur

Le cahier des charges cite les sources de trafic « dans une phase avancée ». Le prototype affiche un
onglet Statistiques sans détailler. Hypothèse retenue : au MVP, ventes par jour, ventes par catégorie,
taux de présence. Les sources de trafic exigent un suivi d'attribution (paramètre `ref` sur les liens
courts) reporté après le lancement.

---

# 9. SYNTHÈSE

**Ce que le prototype apporte au-delà du cahier des charges** — et qui doit être considéré comme
la référence de conception :

1. L'authentification sans mot de passe (téléphone + OTP), qui simplifie l'architecture et supprime
   toute une classe de problèmes de sécurité.
2. L'achat sans compte préalable, décision de conversion majeure.
3. Le principe « le webhook fait foi », qui commande toute la machine à états du paiement.
4. Le mode hors ligne du check-in comme condition de fonctionnement, avec la gestion explicite des
   conflits de double scan.
5. Le gel du solde comme levier de modération de premier recours plutôt que la suspension.
6. La vérification qui conditionne le retrait et non la vente.
7. Le billet comme objet de promotion (perforation, visuel, QR dominant) et non comme reçu.
8. Les cinq états obligatoires par écran, et la restriction à trois micro-interactions.

**Ce que le cahier des charges apporte et que le prototype ne couvre pas** : la facturation, les
remboursements partiels, le report d'événement, les rappels programmés (J-7, J-1, H-x), le programme
d'affiliation, les agents de vente, la marketplace de prestataires, et le modèle économique par
abonnement.

**Les décisions restant à prendre** : le format de numérotation téléphonique (A2, 🔴 bloquant pour
l'authentification et le rapprochement Mobile Money) et le montage juridique de détention des fonds
(A10, 🔴 bloquant pour la mise en production). La grille de commission (A1) est tranchée : 5 % avec
un plancher de 100 FCFA par commande.
