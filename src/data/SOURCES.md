# Sources des données régionales

Toutes les valeurs de `regions-stats.json` sont produites par `scripts/build-data.ts`
(`npm run data`). Aucune valeur n'est saisie à la main. Le script interroge les sources
ci-dessous, recalcule les indicateurs dérivés et vérifie la cohérence : chaque répartition
totalise 100 ± 0,5, la population par âge correspond à la population légale, l'Île-de-France
a le revenu médian le plus élevé et la population totale est plausible.

Périmètre : les 13 régions de France métropolitaine (codes INSEE, géographie 2026 de l'API
Melodi, identique au découpage régional de 2016).

Les données INSEE sont publiées sous Licence Ouverte / Open Licence 2.0 (Etalab).

| Champ | Définition | Source | Millésime |
|---|---|---|---|
| `population` | Population municipale | INSEE, recensement de la population, série historique. API Melodi, jeu `DS_RP_SERIE_HISTORIQUE`, mesure `POP`.<br>https://api.insee.fr/melodi/data/DS_RP_SERIE_HISTORIQUE<br>Catalogue : https://catalogue-donnees.insee.fr/fr/catalogue/recherche/DS_RP_SERIE_HISTORIQUE | RP 2023 |
| `density` | Population / superficie (hab/km²), **calculée** | Même jeu, mesure `SUP` (superficie en km²) | RP 2023 |
| `ageStructure` | Part (en %) des moins de 25 ans, 25-39, 40-54, 55-64 et 65 ans ou plus dans la population totale, **calculée** par sommation des âges détaillés | INSEE, recensement de la population, tableau détaillé POP1 « Population par sexe et âge ». API Melodi, jeu `DS_RP_TD_POPULATION_AGESEX_PRINC`, âge détaillé année par année, `SEX=_T`.<br>https://api.insee.fr/melodi/data/DS_RP_TD_POPULATION_AGESEX_PRINC | RP 2023 |
| `medianAge` | **Âge médian, calculé** : l'INSEE ne le publie pas à l'échelle régionale. On cumule la pyramide des âges détaillée (POP1) jusqu'à 50 % de la population, puis on interpole linéairement à l'intérieur de l'année d'âge. La tranche « 100 ans ou plus » est traitée comme une seule année, ce qui est sans effet sur la médiane. | Même jeu que `ageStructure` | RP 2023 |
| `csp` | Part (en %) de chaque groupe socioprofessionnel dans la population de 15 ans ou plus : agriculteurs (1), artisans, commerçants et chefs d'entreprise (2), cadres et professions intellectuelles supérieures (3), professions intermédiaires (4), employés (5), ouvriers (6), retraités (7), autres inactifs (8, codé « 9 » dans Melodi) | INSEE, recensement de la population, tableau détaillé POP6 « Population de 15 ans ou plus selon l'âge et la PCS ». API Melodi, jeu `DS_RP_TD_POPULATION_PCSAGESEX_COMP`, `AGE=Y_GE15`, `SEX=_T`.<br>https://api.insee.fr/melodi/data/DS_RP_TD_POPULATION_PCSAGESEX_COMP | RP 2023 |
| `medianIncome` | Médiane du revenu disponible par unité de consommation (« niveau de vie médian »), en € par an | INSEE, Filosofi (Fichier localisé social et fiscal). API Melodi, jeu `DS_FILOSOFI_CC`, mesure `MED_SL`.<br>https://api.insee.fr/melodi/data/DS_FILOSOFI_CC | Filosofi 2023 |
| `povertyRate` | Taux de pauvreté monétaire au seuil de 60 % du niveau de vie médian, en % | Même jeu, mesure `PR_MD60` | Filosofi 2023 |
| `urbanShare` | Part de la population vivant dans une **commune urbaine** au sens de la grille communale de densité à 7 niveaux : niveaux 1 à 4 (grands centres urbains, centres urbains intermédiaires, ceintures urbaines, petites villes). Les niveaux 5 à 7 (bourgs ruraux, rural à habitat dispersé et très dispersé) sont ruraux. **Calculée** en agrégeant les communes par région. | INSEE, grille communale de densité 2024 (population municipale 2021).<br>https://www.insee.fr/fr/statistiques/fichier/6439600/grille_densite_7_niveaux_2024.xlsx<br>Page : https://www.insee.fr/fr/information/6439600<br>La correspondance commune → région vient du Code officiel géographique 2024 de l'INSEE : https://www.insee.fr/fr/statistiques/fichier/7766585/v_commune_2024.csv | Grille 2024 (COG 2024, pop. 2021) |

## Contours géographiques

`public/data/regions.geojson` : fichier `regions-version-simplifiee.geojson` du dépôt
[gregoiredavid/france-geojson](https://github.com/gregoiredavid/france-geojson)
(https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson),
filtré sur les 13 régions métropolitaines. La propriété `code` correspond au champ `code` du
JSON de statistiques. Données dérivées d'Admin Express (IGN), Licence Ouverte.

## Remarques

- **Indicateurs calculés** : l'âge médian, la densité, les parts par âge et par CSP, et la part
  urbaine sont calculés à partir des données officielles listées ci-dessus. Les autres valeurs
  sont reprises telles quelles.
- **Millésime de la part urbaine** : la grille de densité 2024 est la plus récente publiée. Elle
  repose sur la population municipale 2021, alors que les autres indicateurs du recensement
  sont de 2023.
- **Données collectées le** : 1er octobre 2026.
