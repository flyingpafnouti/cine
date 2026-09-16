# CinéScope

Explorateur de cinéma en français, sans backend ni build, en HTML/CSS/JavaScript
natif. **Deux datasets réels sont inclus et chargés automatiquement : 90 764 fiches après rapprochement.**

Deux niveaux indépendants :

- **Contraintes fortes** : critères obligatoires, combinés par ET.
- **Préférences souples** : critères pondérés qui classent les films retenus,
  sans éliminer ceux qui correspondent moins bien.

## Lancer

Depuis ce répertoire :

```bash
python3 -m http.server 8000
```

Ouvrir **http://localhost:8000**. Sur un système où Python 3 s’appelle `python`,
`python -m http.server 8000` convient également.

Aucun `npm install` n’est nécessaire pour utiliser l’application. Un navigateur
moderne prenant en charge les modules ES et les Web Workers est requis.
L’ouverture directe en `file://` n’est pas prise en charge.

Les fichiers importés sont traités localement, sans appel réseau externe.
Les presets sont conservés dans le stockage local de cette origine
(protocole/hôte/port). Les films importés et comparaisons restent en mémoire :
exportez votre travail avant de fermer la page. Au rechargement, les deux datasets fournis
sont à nouveau chargés ; les presets restent disponibles.

## Complément Allociné 2026 et synopsis

Le brut historique est conservé et enrichi au démarrage avec le CSV
[Olivier/allocine-movies](https://huggingface.co/datasets/Olivier/allocine-movies),
révision du 7 juin 2026. Ce complément contient 42 634 fiches.

| Collection chargée par défaut | Valeur mesurée |
|---|---:|
| Lignes des deux fichiers | 102 600 |
| Rapprochements entre sources | 11 836 |
| Fiches après rapprochement | 90 764 |
| Fiches avec synopsis | 39 739 |
| Fiches avec note spectateur | 67 133 |
| Années renseignées | 1913–2026 |
| Fiches datées de 2026 avec note spectateur | 984 |

Cliquez sur le **titre d’un film**, dans le tableau ou les cartes : sa fiche
affiche le synopsis, les métadonnées, les sources et la décomposition du score.
Le synopsis apparaît également dans la comparaison. S’il manque, la fiche indique
« Synopsis non renseigné pour ce film ». Le texte est celui de la source,
sans génération ni reconstruction ; les extraits tronqués dans la source restent
tronqués. Il est conservé à l’export CSV et JSON et affiché comme texte, jamais HTML.

### Rapprochement prudent des sources

L’identifiant Allociné explicite est prioritaire lorsqu’il existe dans les deux
entrées. Le brut historique n’en a pas : on rapproche uniquement un **titre
normalisé + une année + une liste de réalisateurs identiques**, avec correspondance
unique dans chaque source. Des IDs explicites différents interdisent la fusion.
Aucun rapprochement sur le titre seul ; ambiguïtés et dates différentes restent
séparées. Il peut donc subsister plusieurs fiches pour un même film réel.

Un rapprochement conserve l’ID interne, la date originale et les métadonnées
historiques connues. Il ajoute le synopsis récent et l’ID Allociné, et remplace
chaque note connue par la note récente avec son nombre de votes associé.
Si la note récente manque, l’ancienne paire note/votes est conservée.
Les champs historiques absents sont complétés quand possible.
Le modèle conserve aussi `sources`, `sourceId`, `dateKind` et `frenchReleaseDate`.

**Dates du complément :** ce sont des dates de sortie en France, pas nécessairement
des sorties originales. Pour une nouvelle fiche, cette date sert au filtre d’année
et sa nature est indiquée dans la fiche. Pour une correspondance historique, la
date originale est conservée. Le filtre 2026 n’est donc pas un décompte garanti des
films produits ou sortis pour la première fois en 2026.

Mapping automatique du complément :

| Source 2026 | Modèle |
|---|---|
| id | sourceId ; ID interne préfixé `allocine-` |
| title | title |
| summary | synopsis |
| release_date | releaseDate, year, frenchReleaseDate |
| spec_rating | audienceRating |
| number_of_spec_rating | audienceRatingCount |
| press_rating | pressRating |
| number_of_press_rating | pressRatingCount |
| genres / directors / actors / nationality | genres / directors / actors / countries |
| duration | duration |

Les listes de ce format sont séparées par des virgules, contrairement aux listes
Python du brut. Le format est reconnu à l’import sans mapping manuel.
Un import utilisateur remplace toujours la collection en mémoire ; le rapprochement
automatique concerne les deux fichiers livrés. Si l’un des fichiers manque au
démarrage, l’autre reste utilisable et un message précise lequel a été chargé.

## Source historique et inventaire réellement mesuré

Source de référence : [ibmw/Allocine-project — AlloCine Ratings Analysis](https://github.com/ibmw/Allocine-project).

L’archive d’origine n’étant plus téléchargeable sous forme de ZIP exploitable,
le brut a été récupéré dans
[Camille2T/Movies_ratings_allocine](https://github.com/Camille2T/Movies_ratings_allocine),
une analyse liée par l’auteur et attribuant explicitement ses données à la source.

Le fichier fourni n’a pas été modifié. Commit, URL figée, empreinte SHA-256,
historique du téléchargement et restauration :
[data/source/README.md](data/source/README.md).

| Mesure | Valeur calculée |
|---|---:|
| Films | 59 966 |
| Lignes sans titre ignorées | 0 |
| Films avec note spectateur | 38 129 |
| Films avec nombre de votes spectateurs | 38 129 |
| Genres distincts, libellés conservés | 37 |
| Réalisateurs distincts | 23 469 |
| Années originales renseignées : minimum–maximum | 1919–2025 |
| Films avec disponibilité VOD renseignée | 0 |

Ces nombres sont calculés au chargement, jamais utilisés comme constantes
d’affichage. Les valeurs ci-dessus documentent uniquement le fichier livré.
La source distingue le **brut (59 966)** du **clean (10 424)** exigeant les deux notes.
L’application ne demande jamais de note presse pour inclure un film.

Les dates futures annoncées, valeurs manquantes et libellés inhabituels du
fichier historique sont conservés ; la plage 1919–2025 n’est pas une affirmation
sur la date de collecte ni sur des sorties effectivement réalisées.

## Parcours d’utilisation

1. Dans **Contraintes fortes**, choisir année, note minimum, votes, genres et,
   si utile, VOD, réalisateur, acteur, nationalité, durée et note presse.
2. Choisir le mode de genres : au moins un, tous, ou exclusion.
3. Dans **Préférences**, régler les poids et les préférences sans modifier
   l’admissibilité des films.
4. Trier par score, note, votes, date, titre, genre ou presse. Les en-têtes du
   tableau permettent d’inverser le tri. Une valeur absente reste en fin de tri.
5. Cliquer sur un titre ou sur son score pour voir le détail des contributions.
6. Cocher jusqu’à huit films puis **Comparer**.
7. Choisir Tous / Top 10 / 25 / 50 / 100, puis exporter en CSV ou JSON, ou copier.
8. Enregistrer, charger, renommer et supprimer les configurations.
9. Dans **Analyse**, choisir deux dimensions et une mesure ; cliquer une cellule
   ajoute exactement ses deux contraintes à la sélection.

La recherche porte sur titre, réalisateurs et acteurs, sans distinction de casse
ou d’accents. Le raccourci `/` place le focus dans la recherche.

Exemple contrôlé :
**Thriller + 1990–1999 + note spectateur ≥ 4 + votes ≥ 100 = 22 films sur le brut seul, 25 fiches dans la collection enrichie**.

Les statistiques, tableaux croisés et exports portent sur toute la sélection
courante, **Top N compris**, indépendamment de la pagination. Le Top suit le tri
choisi ; sélectionner le tri par score pour obtenir un Top selon les préférences.

## Disponibilité en VOD

Ce critère est disponible comme **contrainte forte** et comme **préférence
pondérée**, mais aucun des deux fichiers fournis ne contient de disponibilité VOD.

Trois états distincts : `true` (disponible), `false` (indisponible), `null`
(non renseignée). « Disponible » exclut donc les films inconnus ; il retourne
zéro film sur la collection livrée sans enrichissement VOD.

Pour utiliser ce critère, importer un CSV Allociné enrichi avec :

- `vod_available` : oui/non, true/false, 1/0 ; vide ou inconnu → null ;
- `vod_providers` : tableau ou liste de plateformes ;
- `vod_country` : territoire de disponibilité, par exemple FR ;
- `vod_checked_at` : date de vérification, affichée dans la fiche du film.

Pour un JSON normalisé, utiliser `vodAvailable`, `vodProviders`, `vodCountry`
et `vodCheckedAt`. Les colonnes peuvent également être associées manuellement.
L’import remplace le dataset en mémoire ; il ne fusionne pas deux sources.

La disponibilité dépend du territoire et du moment. L’application affiche les
informations importées et ne vérifie pas les catalogues en direct. Aucune clé API,
connexion payante ou promesse de disponibilité actuelle n’est nécessaire.

## Import et normalisation

Le pipeline ne dépend des noms Allociné qu’à l’étape du mapping :

```text
CSV / JSON → parsing → mapping → Movie[] → contraintes → scoring → tri
                                                → Top N → statistiques / export / pivot
                                                        → pagination → rendu
```

Le CSV historique est automatiquement reconnu par `movie_title` ; le complément par `title` et `spec_rating`. Un JSON ou CSV
avec uniquement les champs du modèle normalisé est également reconnu.
Pour les autres schémas, l’interface propose une association manuelle. Le titre
est obligatoire, les autres champs sont facultatifs. Une ligne sans titre est
ignorée et comptabilisée. Un fichier sans aucun titre exploitable est refusé.

CSV : virgule, point-virgule ou tabulation détectés à partir de l’en-tête, BOM UTF-8,
champs entre guillemets, guillemets doubles échappés et sauts de ligne dans les
champs. Les lignes de largeur incorrecte et guillemets non fermés sont signalés.
L’import propose UTF-8 et Windows-1252 ; des caractères de remplacement entraînent
un message explicite au lieu d’un chargement silencieusement corrompu.

JSON : tableau non vide d’objets. L’export JSON peut être réimporté.

| Source Allociné | Modèle interne |
|---|---|
| movie_title | title |
| release_date | releaseDate et year |
| re_release_date | reReleaseDate |
| duration | duration, en minutes |
| genre | genres |
| directors | directors |
| actors | actors |
| nationality | countries |
| press_rating | pressRating |
| nber_press_vote | pressRatingCount |
| user_rating | audienceRating |
| nber_user_vote | audienceRatingCount |

Les noms `nber_press_vote` et `nber_user_vote` sont lus tels quels.
La colonne d’index Pandas n’est pas un identifiant métier.

L’ID est un hash FNV-1a du titre et de la date originale (ou de l’année disponible),
avec suffixe de collision déterministe pour l’ordre du fichier. Les doublons
sont conservés. Réordonner des lignes ayant exactement la même clé peut modifier
leur suffixe ; il ne s’agit pas d’un identifiant Allociné universel.

Le parseur de listes Python est un lexer de données, sans exécution de code.
Il accepte listes vides, null/None/nan, apostrophes, doubles guillemets,
échappements, virgule finale et crochet fermant manquant. Une chaîne simple
est divisée sur `|` ou `;`. Il ne cherche pas à interpréter des expressions Python.
Les libellés de genre restent ceux de la source, sans fusion automatique.

Les notes invalides ou hors 0–5 deviennent null. Les nombres acceptent la
virgule décimale, les espaces de milliers et les flottants pandas (`3021.0`).
Les durées reconnaissent notamment `1h 47min` et les préfixes historiques
comme « en DVD ». Les dates manquantes ou invalides deviennent null.
Pour le brut, l’année vient de la **sortie originale**, jamais de la ressortie. Pour le complément, voir la distinction sur les dates de sortie en France ci-dessus.

Les filtres numériques excluent une valeur absente dès qu’ils sont activés.
Sans ces filtres, les films sans note restent présents.
Le tri par **note spectateur** exclut automatiquement les films sans cette note ;
le tri par score peut les conserver et leur attribue 0 à cette composante.

## Scoring exact

Chaque score élémentaire `sᵢ` est compris entre 0 et 1.
Pour des poids positifs ou nuls `wᵢ` :

```text
Wᵢ = wᵢ / somme(w)
Score = 100 × somme(Wᵢ × sᵢ)
Contributionᵢ = 100 × Wᵢ × sᵢ
```

Poids tous nuls : score 0, avec message dans l’interface. Les poids 60/20/20 et
3/1/1 sont équivalents. Par défaut : note 60, genre 25, année 15, autres 0.
Les composantes manquantes valent 0 ; leurs poids ne sont pas redistribués.
La fiche expose toutes les contributions, les notes et les votes.

### Note spectateur et moyenne bayésienne

Sans correction : `s_note = R / 5`.

Avec correction (activée par défaut) :

```text
WR = (v × R + m × C) / (v + m)
s_note = WR / 5
```

- R : note spectateur brute du film ;
- v : votes spectateurs, 0 si inconnu ;
- C : moyenne arithmétique des notes connues du **dataset complet**,
  recalculée à l’import, constante quand on change les filtres ;
- m : force du rappel vers C, configurable, 100 par défaut.

Une note absente reste absente et vaut 0 dans le score ; elle n’est pas remplacée
par C. Une note existante sans votes connus est ramenée à C si m > 0.
Pour m = 0, WR = R, y compris si v = 0. Si le dataset n’a aucune note, C = 0.
Cette correction réduit l’avantage artificiel d’un 5/5 avec trois votes.

### Année

Soit `clamp(x) = min(1, max(0, x))`, et `d` la distance en années :

- Plage [a,b] : `d = max(a − année, 0, année − b)`.
- Cible t : `d = abs(année − t)`.
- Plage ou cible : `s_année = clamp(1 − d / écart)`, écart réglable,
  30 années par défaut, minimum 1.
- Récent : `(année − année_min_dataset) / (année_max_dataset − année_min_dataset)`.
- Ancien : `(année_max_dataset − année) / (année_max_dataset − année_min_dataset)`.

Quand toutes les années connues sont identiques, les modes récent/ancien donnent
1 aux années connues. Année absente : 0. Inverser une plage de contraintes fortes
ne retourne aucun résultat ; garder les bornes ordonnées pour la préférence.

### Genre

Chaque genre a une préférence de 0 à 10, **5 par défaut**.
Score = moyenne des préférences de **tous les genres du film**, divisée par 10.
L’alternative Maximum utilise la plus forte préférence / 10. Sans genre : 0.
Les genres non configurés participent avec leur valeur par défaut, ils ne sont
pas ignorés.

### Autres préférences

| Critère | Score élémentaire |
|---|---|
| Votes | ln(1 + votes) / ln(1 + maximum de votes du dataset), maximum ≥ 1 |
| Presse | note presse / 5 |
| Durée | clamp(1 − abs(durée − durée idéale) / écart de durée), écart ≥ 1 |
| Nationalité | 1 si une nationalité contient le texte préféré, sinon 0 |
| Réalisateur | 1 si un réalisateur contient le texte préféré, sinon 0 |
| Acteur | 1 si un acteur contient le texte préféré, sinon 0 |
| VOD | 1 si explicitement disponible, sinon 0 |

Les trois préférences textuelles sont insensibles à la casse et aux accents.
Une préférence textuelle vide vaut 0. Les notes presse et spectateurs sont
indépendantes ; une note presse manquante n’exclut jamais un film à elle seule.

## Tableau croisé et statistiques

Dimensions : genre, décennie, année, tranche de note [0,1[, [1,2[, [2,3[,
[3,4[, [4,5] et nationalité. Valeur manquante : « Non renseigné ».

Un film multi-genres ou multinational participe à chaque catégorie concernée.
Les totaux additionnés entre cellules peuvent dépasser le nombre de films.
Les moyennes ignorent les valeurs absentes, mais conservent les zéros.
Une cellule expose son nombre de films et applique les deux catégories exactes,
y compris les catégories manquantes, sans approximation par recherche textuelle.
Les contraintes du croisement apparaissent sous forme de pastilles supprimables.

Statistiques : effectif, moyenne et médiane des notes, votes moyens, année
médiane, cinq principaux genres et décennies. Calcul sur toute la sélection,
pas seulement sur la page visible.

## Architecture

```text
index.html
css/styles.css
js/
  app.js                    coordination de l’interface et requêtes au Worker
  state.js                  configuration centrale et valeurs initiales
  worker.js                 protocole de messages et erreurs
  engine.js                 pipeline métier, dataset détenu par le Worker
  data/
    loader.js               sélection CSV/JSON et encodage
    csv-parser.js           analyse CSV
    allocine-parser.js      listes Python sans interpréteur
    normalizer.js           mappings et modèle Movie
    merge.js                rapprochements prudents entre les sources
  filters/filters.js        contraintes et tris
  scoring/scoring.js        poids, composantes et moyenne bayésienne
  analysis/
    pivot.js
    statistics.js
  ui/
    dom.js                  DOM sûr et utilitaires de présentation
    controls.js             contraintes et préférences
    results.js              tableau, cartes, détail et croisement
    import.js               import et association de colonnes
    dataset-ui.js           inventaire et provenance
    presets-ui.js           gestion des configurations
  storage/presets.js
  export/export.js
  utils/values.js
data/source/
  allocine_brut.csv          59 966 films, original non modifié
  allocine_movies_2026.csv   42 634 films, complément non modifié
  README.md                 provenance détaillée
scripts/
  fetch-dataset.py
  benchmark.js
tests/
  core.test.js
  collection.test.js
  browser/app.spec.js
artifacts/                  captures et export issus de la vérification
package.json
package-lock.json
playwright.config.js
README.md
```

Le métier ne dépend pas du DOM et s’exécute aussi sous Node pour les tests.
Normalisation, filtre, score, tri, agrégations et préparation d’export sont
dans un Worker. Seules les pages de résultats et les agrégats nécessaires sont
transmis à l’interface. La recherche normalisée est précalculée par film.
Les entrées sont temporisées de 180 ms ; les réponses devenues obsolètes
ne remplacent pas la dernière sélection.

Pagination 50 / 100 / 250, indépendamment du Top N.
Les tableaux croisés très larges défilent horizontalement ; croiser Année × Année
produit davantage de cellules DOM et peut être moins confortable sur mobile.

Les données importées sont insérées par `textContent` ou des nœuds texte.
Aucun `eval`, `new Function` ou injection HTML. Le CSV exporté protège les
cellules pouvant être interprétées comme formules par un tableur.
Aucune police, image ou bibliothèque distante nécessaire à l’exécution.

## Tests et mesures

Node.js 20+ pour les tests métier, sans installation de dépendances :

```bash
npm test
npm run benchmark
```

Parcours Chrome réels, uniquement pour le développement :

```bash
npm ci
npm run test:browser
```

Le navigateur par défaut est `/usr/bin/google-chrome`. Pour un autre Chrome/Chromium :

```bash
CHROME_PATH=/chemin/vers/chromium npm run test:browser
```

Le serveur Python est démarré automatiquement par les tests si nécessaire.
Playwright est une dépendance de développement, jamais chargée par l’application.

**Vérification effectuée : 24 tests métier et 6 parcours navigateur passent.**

Tests couvrant CSV, listes Python, dates, nombres, durées, normalisation,
données absentes, mapping, filtres combinés, tous les modes de genre, recherche,
VOD, scores et poids, bayésien, tris, pivot, statistiques, export sécurisé et
pipeline du vrai dataset. Les seules données synthétiques sont dans les tests.

Parcours navigateur : chargement réel, filtres, scores détaillés, comparaison,
cartes, presets, croisement cliquable, Top N, export, recherche, poids nuls,
import CSV avec mapping, JSON, chaînes HTML malveillantes affichées comme texte,
message CSV invalide et affichage mobile.

Mesures de développement, variables selon machine : voir les mesures actualisées via `npm run benchmark`, qui traite les deux sources et
les 90 764 fiches. Le chargement inclut maintenant la lecture des synopsis et
le rapprochement de 102 600 lignes. Le traitement
coûteux reste hors du thread de rendu. Les temps dépendent de la machine.

## Limites assumées

- Notes et métadonnées historiques, pas de mise à jour automatique.
- VOD utilisable après enrichissement/import, aucune couverture native.
- Pas de fusion d’imports personnels, de serveur, de comptes ou de synchronisation de presets.
- Rapprochement prudent : des doublons incertains subsistent ; pas de traduction/fusion des genres.
- Comparaison limitée à huit films ; presets locaux au navigateur et à l’origine.
- Export JSON complet ; CSV aplati pour les listes, sans détail des contributions.
- Les fichiers ZIP doivent être décompressés avant import.
- Pas de graphiques ni de thème sombre : priorité à l’exploration tabulaire.
