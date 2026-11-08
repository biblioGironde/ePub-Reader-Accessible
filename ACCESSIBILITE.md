# Accessibilité de la liseuse — correspondance avec les normes

Ce document relie les fonctions de la liseuse aux critères **WCAG 2.2** (repris par le **RGAA 4.1** en France) et aux besoins des publics visés. Il sert de base à une future déclaration d'accessibilité.

## Contrôles effectués

- Audit automatique **axe-core** (règles WCAG 2.0/2.1/2.2 A et AA + bonnes pratiques) : aucune erreur sur l'accueil (6 thèmes), la page de lecture et les panneaux.
- Rendu vérifié dans Chromium, Firefox et WebKit (moteur de Safari), sur ordinateur et sur écran de téléphone (390 px).
- Restent à faire avec des utilisateurs : lecteurs d'écran (NVDA, VoiceOver, TalkBack), tests avec des personnes dys et malvoyantes du réseau.

## Interface

| Exigence | Mise en œuvre | Critère |
|---|---|---|
| Langue de la page | `lang="fr"` ; la langue du livre est appliquée à son contenu | 3.1.1, 3.1.2 |
| Lien d'évitement | « Aller au texte du livre » / « Aller au contenu principal » | 2.4.1 |
| Structure | repères `header`, `nav`, `main`, `footer`, titres hiérarchisés, titre de cadre sur le texte du livre | 1.3.1, 2.4.6, 4.1.2 |
| Clavier | toutes les fonctions au clavier, raccourcis d'une lettre désactivés dans les champs de saisie | 2.1.1, 2.1.4 |
| Panneaux | boîtes de dialogue natives : focus piégé, `Échap` pour fermer, focus rendu au bouton d'origine | 2.4.3, 2.1.2 |
| Focus visible | contour toujours affiché ; option de contour renforcé | 2.4.7, 2.4.11, 2.4.13 |
| Cibles tactiles | au moins 44 × 44 px | 2.5.5, 2.5.8 |
| Contrastes | ≥ 4,5:1 dans tous les thèmes ; thèmes jaune/noir et blanc/noir à 19:1 et 21:1 | 1.4.3, 1.4.6, 1.4.11 |
| Agrandissement | interface jusqu'à 160 %, texte jusqu'à 300 %, mise en page qui se réorganise à 320 px de large | 1.4.4, 1.4.10 |
| Espacement du texte | interligne, lettres et mots réglables sans perte de contenu | 1.4.12 |
| États annoncés | boutons bascule `aria-pressed`, curseurs avec valeur parlée (`aria-valuetext`), annonces `aria-live` (page, chapitre, signets) | 4.1.2, 4.1.3 |
| Mouvement | animations supprimées si le système le demande ou via l'option | 2.3.3 |
| Préférences système | mode sombre, contraste élevé, mode « couleurs forcées » de Windows respectés | 1.4.3, 1.4.11 |

## Contenu des livres

| Besoin | Fonction |
|---|---|
| Malvoyance | grandes tailles, thèmes à fort contraste, polices Atkinson Hyperlegible et Lexend, texte épaissi, largeur de ligne réduite, lecture à voix haute avec surlignage |
| Surdité / malentendance | sous-titres des vidéos activés d'office, contrôles des médias toujours visibles, signalement visuel des contenus sonores, texte de la synthèse vocale affiché en grand mot à mot, aucune information transmise par le son seul |
| Dyslexie, dyspraxie, troubles de l'attention | OpenDyslexic, texte aéré, aligné à gauche sans césure, italique remplacé, règle et masque de lecture, alternance de couleur des mots, lettres b/d/p/q colorées, lecture vocale synchronisée |
| Métadonnées EPUB Accessibility 1.1 | lecture et traduction en français de `accessMode`, `accessibilityFeature`, `accessibilityHazard`, `accessibilitySummary`, `conformsTo` |

Les aides visuelles (surlignage, couleurs des mots et des lettres) passent par l'API *CSS Custom Highlight* : le texte du livre n'est jamais modifié, ce qui garde intacts les signets et la lecture par les lecteurs d'écran.

## Limites connues

- Les « Media Overlays » EPUB 3 (texte synchronisé avec un enregistrement audio) ne sont pas encore lus : la lecture vocale utilise la synthèse de l'appareil.
- Les livres à mise en page fixe (BD, albums) s'affichent, mais les réglages de texte n'ont que peu d'effet sur eux.
- Pas de traduction en langue des signes (LSF) intégrée ; les vidéos LSF présentes dans un livre sont lues normalement.
