# Provenance du fichier brut

Le fichier **allocine_brut.csv est fourni**, intact, avec l’application. Il contient
**59 966 lignes de films**, en UTF-8, séparateur virgule, avec 12 colonnes métier
et une première colonne d’index Pandas sans nom.

Source de référence : **AlloCine Ratings Analysis**, Olivier Maillot,
[ibmw/Allocine-project](https://github.com/ibmw/Allocine-project).

Le README original annonce un brut de 59 966 films et un clean de 10 424 films
ayant les deux notes. Nous utilisons exclusivement le brut.

## Récupération vérifiée le 16 septembre 2026

L’archive liée par la source est :
http://olivier-maillot.fr/wp-content/uploads/2017/08/allocine_dataset.zip

La variante HTTPS renvoie HTTP 404 ; la variante HTTP ne fournit pas une archive ZIP
exploitable. Aucun fichier synthétique n’a été substitué.

Le README original lie également l’analyse
[Camille2T/Movies_ratings_allocine](https://github.com/Camille2T/Movies_ratings_allocine),
dont le README attribue explicitement le dataset à ibmw/Allocine-project. Ce dépôt
contient une copie du **brut de 59 966 films**, récupérée pour cette application :

- Commit : `5365239058968b293e0e1672b703c0ef21b7fb1d`
- [Fichier source figé](https://raw.githubusercontent.com/Camille2T/Movies_ratings_allocine/5365239058968b293e0e1672b703c0ef21b7fb1d/allocine_brut.csv)
- SHA-256 : `e22e64eb4193b7298dfb44b3b863e5e0db232e690cd4ec5706379d98a0e44528`

Cette copie a une provenance documentée et une structure vérifiée. L’archive
d’origine étant inaccessible, son identité binaire avec cette archive ne peut pas
être vérifiée.

Colonnes, dans l’ordre constaté :

```text
(colonne d’index sans nom)
actors
re_release_date
release_date
directors
duration
genre
nationality
nber_press_vote
nber_user_vote
press_rating
user_rating
movie_title
```

Le parseur nomme uniquement la colonne vide `_index0` pour pouvoir la représenter.
Les noms des 12 colonnes métier restent intacts avant normalisation.

## Restaurer le fichier

Depuis la racine du projet :

```bash
python3 scripts/fetch-dataset.py
```

Le script télécharge le fichier figé, contrôle son empreinte, ses colonnes et son
nombre de lignes avant de l’écrire.

Si vous disposez de l’archive originale, décompressez-la, choisissez le fichier
**brut**, puis placez-le ici sous le nom `allocine_brut.csv`. Vous pouvez aussi
importer directement son CSV dans le navigateur. L’application n’ouvre pas les ZIP.
Ne choisissez pas le fichier clean si vous voulez conserver les films sans note presse.

## Données historiques et droits

Les notes, votes, dates et autres métadonnées sont ceux du fichier ; aucune mise à
jour ni requête Allociné n’est effectuée. Certains libellés sont incohérents et des
dates de sorties annoncées dépassent la période de collecte. Ils sont conservés.

Le README d’origine indique « This project is free. Have fun. » sans fichier de
licence standard identifié. Cette attribution ne constitue pas une licence nouvelle
pour les données Allociné ; aucun droit supplémentaire n’est revendiqué ici.

# Complément Allociné 2026

Le deuxième fichier livré, **allocine_movies_2026.csv**, est une copie intacte de
[Olivier/allocine-movies](https://huggingface.co/datasets/Olivier/allocine-movies).
Le nom local inclut 2026 pour distinguer les deux formats.

- Dernière modification publiée : **7 juin 2026**.
- Révision figée : `7ee445730377d4339ea6a8b391b04537930cd7f2`.
- [CSV original figé](https://huggingface.co/datasets/Olivier/allocine-movies/resolve/7ee445730377d4339ea6a8b391b04537930cd7f2/allocine_movies.csv).
- SHA-256 : `01d1ab7efbf82c8bd67fcb6f9aaeeb5a2d4dc2df18045eb2ac9397a483008604`.
- **42 634 lignes**, 13 colonnes ; **1 258** dates en 2026 dont **984** avec note.
- Le README de ce complément déclare une licence MIT et un scraping via
  [ibmw/allocine-dataset-scraper](https://github.com/ibmw/allocine-dataset-scraper).
- Le fichier `data_quality_report.csv` du dépôt est un rapport d’erreurs, **pas**
  un fichier de films. Il n’est pas importé.

Colonnes constatées :

```text
id,title,release_date,duration,genres,directors,actors,nationality,
press_rating,number_of_press_rating,spec_rating,number_of_spec_rating,summary
```

`summary` fournit les synopsis. Les listes sont séparées par des virgules.
`release_date` est décrit par l’auteur comme une sortie en France : ne pas la
confondre avec l’année originale. Les textes, valeurs absentes et éventuelles
troncatures sont ceux de la source.

L’application charge les deux CSV locaux. Elle rapproche **11 836** entrées selon
la règle documentée dans le README principal et affiche **90 764 fiches**,
dont **39 739** avec synopsis. Les rapprochements incertains restent séparés.

La commande `python3 scripts/fetch-dataset.py` restaure désormais **les deux**
fichiers aux révisions figées, après validation de leurs empreintes et structures.
Aucune consultation de Hugging Face n’est nécessaire pendant l’utilisation.
