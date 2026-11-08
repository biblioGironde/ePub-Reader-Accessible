#!/usr/bin/env python3
"""Génère le livre d'exemple (EPUB 3 accessible) : trois fables de La Fontaine (domaine public).
Usage : python3 outils/creer-exemple.py  →  webapp/exemples/fables-de-la-fontaine.epub
"""
import io, uuid, zipfile, datetime, pathlib, html

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = None

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "webapp" / "exemples" / "fables-de-la-fontaine.epub"

FABLES = [
    ("La Cigale et la Fourmi", """La Cigale, ayant chanté
Tout l'été,
Se trouva fort dépourvue
Quand la bise fut venue :
Pas un seul petit morceau
De mouche ou de vermisseau.
Elle alla crier famine
Chez la Fourmi sa voisine,
La priant de lui prêter
Quelque grain pour subsister
Jusqu'à la saison nouvelle.
« Je vous paierai, lui dit-elle,
Avant l'Oût, foi d'animal,
Intérêt et principal. »
La Fourmi n'est pas prêteuse :
C'est là son moindre défaut.
« Que faisiez-vous au temps chaud ?
Dit-elle à cette emprunteuse.
— Nuit et jour à tout venant
Je chantais, ne vous déplaise.
— Vous chantiez ? j'en suis fort aise :
Eh bien ! dansez maintenant. »"""),
    ("Le Corbeau et le Renard", """Maître Corbeau, sur un arbre perché,
Tenait en son bec un fromage.
Maître Renard, par l'odeur alléché,
Lui tint à peu près ce langage :
« Hé ! bonjour, Monsieur du Corbeau.
Que vous êtes joli ! que vous me semblez beau !
Sans mentir, si votre ramage
Se rapporte à votre plumage,
Vous êtes le Phénix des hôtes de ces bois. »
À ces mots le Corbeau ne se sent pas de joie ;
Et pour montrer sa belle voix,
Il ouvre un large bec, laisse tomber sa proie.
Le Renard s'en saisit, et dit : « Mon bon Monsieur,
Apprenez que tout flatteur
Vit aux dépens de celui qui l'écoute :
Cette leçon vaut bien un fromage, sans doute. »
Le Corbeau, honteux et confus,
Jura, mais un peu tard, qu'on ne l'y prendrait plus."""),
    ("Le Loup et l'Agneau", """La raison du plus fort est toujours la meilleure :
Nous l'allons montrer tout à l'heure.
Un Agneau se désaltérait
Dans le courant d'une onde pure.
Un Loup survient à jeun, qui cherchait aventure,
Et que la faim en ces lieux attirait.
« Qui te rend si hardi de troubler mon breuvage ?
Dit cet animal plein de rage :
Tu seras châtié de ta témérité.
— Sire, répond l'Agneau, que Votre Majesté
Ne se mette pas en colère ;
Mais plutôt qu'elle considère
Que je me vas désaltérant
Dans le courant,
Plus de vingt pas au-dessous d'Elle ;
Et que par conséquent, en aucune façon,
Je ne puis troubler sa boisson.
— Tu la troubles, reprit cette bête cruelle ;
Et je sais que de moi tu médis l'an passé.
— Comment l'aurais-je fait si je n'étais pas né ?
Reprit l'Agneau ; je tette encor ma mère.
— Si ce n'est toi, c'est donc ton frère.
— Je n'en ai point. — C'est donc quelqu'un des tiens ;
Car vous ne m'épargnez guère,
Vous, vos bergers et vos chiens.
On me l'a dit : il faut que je me venge. »
Là-dessus, au fond des forêts
Le Loup l'emporte, et puis le mange,
Sans autre forme de procès."""),
]

INTRO = """<p>Ce petit livre sert à <em>essayer la liseuse accessible</em> du réseau des bibliothèques de la Gironde. Il réunit trois fables de Jean de La Fontaine, publiées pour la première fois en 1668 et aujourd'hui dans le domaine public.</p>
<p>Essayez par exemple le bouton <strong>Accessibilité</strong> : activez le profil <em>Dys</em> pour aérer le texte et afficher une règle de lecture, ou le profil <em>Malvoyants</em> pour agrandir les caractères et passer en fort contraste. Le bouton <strong>Lire à voix haute</strong> fait lire le texte par la voix de votre appareil, en surlignant la phrase en cours.</p>
<p>Les fables sont des poèmes courts. Chacune raconte une petite histoire, souvent avec des animaux, et se termine par une leçon que l'on appelle la morale.</p>"""

CSS = """body { font-family: Georgia, serif; line-height: 1.5; margin: 0 1em; }
h1 { text-align: center; font-size: 1.6em; margin: 1.5em 0 1em; }
.vers p { margin: 0; text-indent: 0; }
.vers { margin: 0 auto; max-width: 30em; }
p { text-align: justify; margin: 0 0 .6em; }
.couv { text-align: center; } .couv img { max-width: 100%; max-height: 95vh; }"""


def xhtml(title, body, lang="fr"):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{lang}" xml:lang="{lang}">
<head><meta charset="UTF-8"/><title>{html.escape(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
{body}
</body>
</html>"""


def cover_png():
    if Image is None:
        return None
    W, H = 1200, 1800
    img = Image.new("RGB", (W, H), "#1d3a5f")
    d = ImageDraw.Draw(img)
    d.rectangle([60, 60, W - 60, H - 60], outline="#f4ecd8", width=8)
    try:
        f1 = ImageFont.truetype("DejaVuSerif-Bold.ttf", 120)
        f2 = ImageFont.truetype("DejaVuSerif.ttf", 70)
    except OSError:
        f1 = f2 = ImageFont.load_default()
    def center(y, text, font, fill="#f4ecd8"):
        w = d.textlength(text, font=font)
        d.text(((W - w) / 2, y), text, font=font, fill=fill)
    center(520, "Fables", f1)
    center(670, "choisies", f1)
    center(950, "Jean de La Fontaine", f2, "#ffd54f")
    center(1500, "Livre d'exemple", f2)
    buf = io.BytesIO(); img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def main():
    uid = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, "biblio.gironde/liseuse/fables"))
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    chapters = [("intro.xhtml", "À propos de ce livre", xhtml("À propos de ce livre", "<section epub:type=\"preface\" role=\"doc-preface\"><h1>À propos de ce livre</h1>\n" + INTRO + "</section>"))]
    for i, (t, text) in enumerate(FABLES, 1):
        lines = "\n".join(f"<p>{html.escape(l)}</p>" for l in text.split("\n"))
        chapters.append((f"fable{i}.xhtml", t, xhtml(t, f'<section epub:type="chapter" role="doc-chapter"><h1>{html.escape(t)}</h1>\n<div class="vers">\n{lines}\n</div></section>')))

    png = cover_png()
    nav_items = "\n".join(f'<li><a href="{f}">{html.escape(t)}</a></li>' for f, t, _ in chapters)
    nav = xhtml("Sommaire", f'<nav epub:type="toc" role="doc-toc" id="toc"><h1>Sommaire</h1><ol>\n{nav_items}\n</ol></nav>\n<nav epub:type="landmarks" hidden=""><ol><li><a epub:type="bodymatter" href="fable1.xhtml">Début</a></li></ol></nav>')
    ncx_points = "\n".join(f'<navPoint id="n{i}" playOrder="{i}"><navLabel><text>{html.escape(t)}</text></navLabel><content src="{f}"/></navPoint>' for i, (f, t, _) in enumerate(chapters, 1))
    ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="{uid}"/></head>
<docTitle><text>Fables choisies</text></docTitle><navMap>{ncx_points}</navMap></ncx>"""

    manifest = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
                '<item id="css" href="style.css" media-type="text/css"/>']
    spine = []
    if png:
        manifest.append('<item id="cover-img" href="couverture.png" media-type="image/png" properties="cover-image"/>')
        manifest.append('<item id="cover" href="couverture.xhtml" media-type="application/xhtml+xml"/>')
        spine.append('<itemref idref="cover" linear="yes"/>')
    for i, (f, t, _) in enumerate(chapters):
        manifest.append(f'<item id="c{i}" href="{f}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{i}"/>')

    opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="fr" prefix="a11y: http://www.idpf.org/epub/vocab/package/a11y/#">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="uid">{uid}</dc:identifier>
  <dc:title>Fables choisies</dc:title>
  <dc:creator>Jean de La Fontaine</dc:creator>
  <dc:language>fr</dc:language>
  <dc:publisher>biblio.gironde — livre d'exemple</dc:publisher>
  <dc:rights>Domaine public</dc:rights>
  <meta property="dcterms:modified">{now}</meta>
  <meta name="cover" content="cover-img"/>
  <meta property="schema:accessMode">textual</meta>
  <meta property="schema:accessModeSufficient">textual</meta>
  <meta property="schema:accessibilityFeature">structuralNavigation</meta>
  <meta property="schema:accessibilityFeature">tableOfContents</meta>
  <meta property="schema:accessibilityFeature">readingOrder</meta>
  <meta property="schema:accessibilityFeature">displayTransformability</meta>
  <meta property="schema:accessibilityFeature">alternativeText</meta>
  <meta property="schema:accessibilityHazard">none</meta>
  <meta property="schema:accessibilitySummary">Livre entièrement textuel, structuré par titres, avec table des matières. La couverture est décrite par un texte alternatif. Aucun risque de clignotement, de mouvement ou de son.</meta>
  <link rel="dcterms:conformsTo" href="http://www.idpf.org/epub/a11y/accessibility-20170105.html#wcag-aa"/>
  <meta property="dcterms:conformsTo">EPUB Accessibility 1.1 - WCAG 2.1 Level AA</meta>
  <meta property="a11y:certifiedBy">biblio.gironde</meta>
</metadata>
<manifest>
{chr(10).join(manifest)}
</manifest>
<spine toc="ncx">
{chr(10).join(spine)}
</spine>
</package>"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>""", compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/nav.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/toc.ncx", ncx, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/style.css", CSS, compress_type=zipfile.ZIP_DEFLATED)
        if png:
            z.writestr("OEBPS/couverture.png", png)
            z.writestr("OEBPS/couverture.xhtml", xhtml("Couverture", '<section epub:type="cover" class="couv"><img src="couverture.png" alt="Couverture : Fables choisies, Jean de La Fontaine. Livre d\'exemple."/></section>'), compress_type=zipfile.ZIP_DEFLATED)
        for f, _, content in chapters:
            z.writestr("OEBPS/" + f, content, compress_type=zipfile.ZIP_DEFLATED)
    print("Écrit :", OUT, OUT.stat().st_size, "octets")


if __name__ == "__main__":
    main()
