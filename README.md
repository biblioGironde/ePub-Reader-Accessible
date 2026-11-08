# ePub Reader Accessible — liseuse EPUB accessible

Liseuse de livres numériques **EPUB** pensée d'abord pour l'accessibilité : personnes **malvoyantes**, **malentendantes** et publics **dys**. Elle fonctionne dans tous les navigateurs récents (ordinateur, tablette, téléphone) et existe aussi en **application de bureau** pour Windows, macOS et Linux.

Rien n'est envoyé sur Internet : les livres et les réglages restent sur l'appareil.

## Utiliser la liseuse

- **En ligne** : ouvrir la page GitHub Pages du dépôt (`https://bibliogironde.github.io/ePub-Reader-Accessible/`). Elle s'installe comme une application (« Installer » / « Ajouter à l'écran d'accueil ») et fonctionne ensuite **hors connexion**.
- **Application de bureau** : télécharger le fichier correspondant à votre système dans la page **Releases** :
  | Système | Fichier |
  |---|---|
  | Windows (installation) | `Liseuse-accessible-x.y.z-installation-windows.exe` |
  | Windows (sans installation) | `Liseuse-accessible-x.y.z-portable-windows.exe` |
  | macOS (Apple Silicon / Intel) | `…-mac-arm64.dmg` / `…-mac-x64.dmg` |
  | Linux | `…-linux-x86_64.AppImage` ou `…-linux-amd64.deb` |

  Avec l'application de bureau, un double-clic sur un fichier `.epub` l'ouvre directement dans la liseuse.

> **macOS** : l'application n'est pas signée par Apple. Au premier lancement, faire clic droit › **Ouvrir**, ou dans le Terminal : `xattr -cr "/Applications/Liseuse accessible.app"`.
> **Windows** : si SmartScreen s'affiche, cliquer sur « Informations complémentaires » › « Exécuter quand même ».

## Les classiques de biblio.gironde

La page d'accueil propose directement les livres des dépôts
[Kit-Liseuses-Les-Classiques-En-Numerique](https://github.com/biblioGironde/Kit-Liseuses-Les-Classiques-En-Numerique)
et [Kit-Liseuses-Classiques-au-bac](https://github.com/biblioGironde/Kit-Liseuses-Classiques-au-bac),
classés par siècle ou par objet d'étude du bac, avec une recherche par titre ou auteur. Un bouton **Lire** télécharge le livre et l'ouvre ; il reste ensuite disponible hors connexion.

La liste se met à jour toute seule : à chaque visite (au plus toutes les 10 minutes, ou avec le bouton « Actualiser la liste »), la liseuse relit la liste des fichiers `epub/*/*.epub` de chaque dépôt et son `catalogue.csv` (titres accentués, années, programme du bac). Ajouter, retirer ou renommer un EPUB dans un dépôt suffit, rien à modifier ici. Pour ajouter une autre collection, compléter `SOURCES` dans `webapp/js/catalogue.js`.

## Fonctions d'accessibilité

Un bouton **Accessibilité** (touche `A`), toujours visible, ouvre le panneau de réglages. Trois **profils** s'activent d'un clic et se combinent ; chaque réglage reste ensuite ajustable un par un.

| Profil | Ce qu'il active |
|---|---|
| **Malvoyants** | Texte à 170 %, thème jaune sur noir, police Atkinson Hyperlegible, texte épaissi, interface agrandie (130 %), contour de focus très visible, animations coupées, barre de lecture vocale affichée |
| **Malentendants** | Sous-titres des vidéos affichés automatiquement, texte lu par la voix affiché en grand (mot par mot), alertes visuelles (changement de chapitre, présence de son ou de vidéo, signets…) |
| **Dys** | Police OpenDyslexic, fond crème, texte aéré (interligne, espacement des mots et des lettres), aligné à gauche sans césure, italique remplacé par du gras, règle de lecture |

Réglages disponibles individuellement :

- **Couleurs** : clair, crème, sépia, sombre, jaune sur noir, blanc sur noir.
- **Texte** : 6 polices (dont Atkinson Hyperlegible, Lexend, OpenDyslexic, embarquées et utilisables hors ligne), taille 80–300 %, interligne, espacement des lettres et des mots, texte épaissi, alignement à gauche, suppression de l'italique et de la césure.
- **Aides dys** : règle ou masque de lecture qui suit la souris, le doigt ou le clavier (`Alt` + `↑`/`↓`), alternance de couleur des mots, coloration des lettres miroirs **b d p q**.
- **Mise en page** : pages ou défilement continu, largeur des lignes, double page sur grand écran.
- **Lecture à voix haute** (touche `L`) : voix de l'appareil, surlignage de la phrase et du mot en cours, vitesse réglable (0,9 par défaut), choix de la voix, passage automatique au chapitre suivant.
- **Interface** : taille de l'interface jusqu'à 160 %, focus renforcé, animations supprimées.
- **Informations d'accessibilité du livre** : la liseuse affiche en français les métadonnées EPUB Accessibility (schema.org) fournies par l'éditeur.

Les préférences du système sont reprises au premier lancement (mode sombre, contraste élevé, réduction des animations).

### Navigation au clavier

| Touche | Action |
|---|---|
| `→` / `←` | Page suivante / précédente |
| `T` | Sommaire |
| `R` | Rechercher |
| `S` | Signets |
| `L` | Lire à voix haute / arrêter |
| `Espace` | Pause / reprise de la voix |
| `A` | Accessibilité |
| `+` / `−` | Taille du texte |
| `B` | Bibliothèque |
| `?` | Aide |
| `Échap` | Fermer un panneau |

Sur écran tactile : glisser vers la gauche ou la droite pour tourner les pages.

## Compatibilité

Chrome / Edge, Firefox, Safari (macOS, iPhone, iPad) et navigateurs Android récents. La coloration des mots et des lettres utilise l'API *CSS Custom Highlight* (Chrome 105+, Safari 17.2+, Firefox 140+) ; sur un navigateur plus ancien, ces deux options sont simplement indisponibles.

**Voix de synthèse** : la liseuse utilise les voix installées sur l'appareil. Windows, macOS, iOS et Android en fournissent ; sous Linux, installer `speech-dispatcher` et une voix française (par exemple `espeak-ng` ou `rhvoice`). Si aucune voix n'est disponible, un message l'indique.

Les livres protégés par DRM (Adobe, LCP) ne peuvent pas être ouverts.

## Structure du dépôt

```
webapp/                 la liseuse (HTML/CSS/JS sans compilation)
  index.html
  css/  js/             interface, réglages, bibliothèque, lecture vocale
  vendor/               epub.js et JSZip (copies locales, hors ligne)
  fonts/                Atkinson Hyperlegible, Lexend, OpenDyslexic (SIL OFL)
  exemples/             livre d'exemple (3 fables de La Fontaine, domaine public)
  sw.js, manifest.webmanifest   fonctionnement hors ligne / installation
electron/               application de bureau (main.js, preload.js)
build/icon.png          icône des applications
outils/creer-exemple.py régénère le livre d'exemple
.github/workflows/      Pages (webapp) et Releases (applications)
```

## Développement

```bash
npm install
npm run web       # webapp sur http://localhost:8080
npm start         # application de bureau
npm run dist      # construit l'application pour le système courant (dossier dist/)
```

### Publier

- **Webapp** : activer GitHub Pages (Settings › Pages › Source : *GitHub Actions*). Chaque modification de `webapp/` sur `main` est publiée automatiquement.
- **Applications** : changer `version` dans `package.json`, puis :
  ```bash
  git tag v1.0.1 && git push origin v1.0.1
  ```
  L'action *Releases Electron* construit Windows, macOS et Linux et publie les fichiers dans la Release.

Après une modification de la webapp, augmenter la valeur `CACHE` en haut de `webapp/sw.js` pour que les appareils déjà installés récupèrent la nouvelle version.

## Licences

- Code de la liseuse : MIT.
- [epub.js](https://github.com/futurepress/epub.js) : BSD-2-Clause. [JSZip](https://stuk.github.io/jszip/) : MIT ou GPLv3.
- Polices Atkinson Hyperlegible, Lexend, OpenDyslexic : SIL Open Font License 1.1.
- Livre d'exemple : textes de Jean de La Fontaine (1668), domaine public.

---

Un bug, une idée ? [Signaler un bug ou proposer une amélioration](https://github.com/biblioGironde/ePub-Reader-Accessible/issues/new?title=Retour%20de%20test%20%E2%80%94%20ePub%20Reader%20Accessible%20%28liseuse%29&body=%2A%2ANom%20testeur%20%3A%2A%2A%0A%0A%2A%2ANom%20webApp/kit%20%28choisir%29%20%3A%2A%2A%0A-%20%5B%20%5D%20Kit%20Effets%20Sp%C3%A9ciaux%20%E2%80%93%20Atelier%20Fond%20Vert%0A-%20%5B%20%5D%20Kit%20bib-e-lots%20%E2%80%93%20Atelier%20Neva%20%28impression%203D%29%0A-%20%5B%20%5D%20Kit%20Les%20Classiques%20En%20Num%C3%A9rique%0A-%20%5B%20%5D%20Classiques%20En%20Num%C3%A9rique%20%E2%80%93%20Audio%0A-%20%5B%20%5D%20Classiques%20au%20bac%0A-%20%5B%20%5D%20G%C3%A9n%C3%A9rateur%20de%20programme%20QDNB%0A-%20%5B%20%5D%20Kit%20biblio.deco%20%E2%80%93%20kit%20Cricut%0A-%20%5B%20%5D%20Kit%20Brodeuse%20%28module%20Respira%29%0A-%20%5B%20%5D%20Kit%20Podcast%0A-%20%5B%20%5D%20Kit%20Livre%20Augment%C3%A9%0A-%20%5B%20%5D%20Liste%20VR%20vid%C3%A9o%20360%0A-%20%5Bx%5D%20ePub%20Reader%20Accessible%20%28liseuse%29%0A%0A%2A%2ANavigateur%20%3A%2A%2A%0A-%20%5B%20%5D%20Edge%0A-%20%5B%20%5D%20Chrome%0A-%20%5B%20%5D%20Firefox%0A%0A%2A%2AMat%C3%A9riel%20branch%C3%A9%20%3A%2A%2A%0A-%20%5B%20%5D%20Imprimante%0A-%20%5B%20%5D%20Liseuse%0A-%20%5B%20%5D%20Webcam%0A-%20%5B%20%5D%20Cricut%0A-%20%5B%20%5D%20Brodeuse%0A%0A%23%23%20Liste%20des%20bugs%0A%0A_Pour%20chaque%20bug%20%3A%20une%20capture%20d%27%C3%A9cran%20annot%C3%A9e%20%28glisser-d%C3%A9poser%20l%27image%20ici%29%20et%20le%20niveau%20du%20bug%20%28voir%20le%20tableau%20ci-dessous%29._%0A%0A%23%23%23%20Bug%201%0A-%20%2A%2ANiveau%20%3A%2A%2A%20Bloquant%20/%20Majeur%20/%20Mineur%20/%20Cosm%C3%A9tique%0A-%20%2A%2ADescription%20%3A%2A%2A%0A-%20%2A%2ACapture%20annot%C3%A9e%20%3A%2A%2A%0A%0A%23%23%23%20Bug%202%0A-%20%2A%2ANiveau%20%3A%2A%2A%0A-%20%2A%2ADescription%20%3A%2A%2A%0A-%20%2A%2ACapture%20annot%C3%A9e%20%3A%2A%2A%0A%0A%7C%20Niveau%20%7C%20D%C3%A9finition%20%7C%20Exemple%20%7C%0A%7C%20---%20%7C%20---%20%7C%20---%20%7C%0A%7C%20Bloquant%20%7C%20L%27atelier%20ne%20peut%20pas%20avoir%20lieu%20%7C%20L%27appli%20Electron%20ne%20s%27ouvre%20pas%20sous%20Windows%20%7C%0A%7C%20Majeur%20%7C%20Une%20fonction%20cl%C3%A9%20%C3%A9choue%2C%20contournement%20possible%20%7C%20L%27export%20audio%20%C3%A9choue%2C%20mais%20l%27enregistrement%20brut%20est%20r%C3%A9cup%C3%A9rable%20%7C%0A%7C%20Mineur%20%7C%20G%C3%AAne%20d%27usage%20ou%20d%27affichage%20%7C%20Bouton%20coup%C3%A9%20sur%20petit%20%C3%A9cran%20%7C%0A%7C%20Cosm%C3%A9tique%20%7C%20Faute%2C%20alignement%2C%20couleur%20%7C%20Coquille%20dans%20un%20libell%C3%A9%20%7C%0A%0A%23%23%20Id%C3%A9es%20d%27am%C3%A9lioration%20/%20d%27ajout%0A1.%20Id%C3%A9e%201%0A2.%20Id%C3%A9e%202%0A3.%20Id%C3%A9e%203%0A4.%20%E2%80%A6%0A) (issue GitHub préremplie)
