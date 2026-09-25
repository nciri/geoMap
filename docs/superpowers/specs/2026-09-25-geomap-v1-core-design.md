# geoMap — Sous-projet 1 : cœur de planification de mission (V1)

- **Date :** 2026-09-25
- **Statut :** design validé, en attente de relecture de la spec
- **Plateforme d'hébergement :** ALIAS

## 1. Contexte et objectif

geoMap est une application cartographique destinée aux armées. La V1 couvre la **planification de mission** : un planificateur, au poste de commandement (PC), prépare une mission sur une carte web (zones, itinéraires, objets, symbologie APP-6D), puis la diffuse vers des terminaux Android qui la consultent **hors ligne**.

Contraintes structurantes :

- fonctionnement hors ligne et sur réseau dégradé ;
- application mobile légère (taille et mémoire limitées) ;
- serveur isolé d'Internet (air-gapped), aucune dépendance à un service ou CDN externe ;
- niveau de sécurité élevé (PKI, mTLS, chiffrement des paquets).

### Critère de succès de la V1

Un planificateur crée une mission comportant une zone, un itinéraire et des symboles APP-6D, l'affecte à des terminaux enrôlés ; un terminal la reçoit par le Wi-Fi du PC **ou** par carte SD, et l'affiche fidèlement hors ligne en respectant les budgets de la section 8.

### Découpage en sous-projets

| # | Sous-projet | Statut |
|---|---|---|
| 1 | Cœur de planification (ce document) | en cours |
| 2 | Assistant IA du planificateur (ordre en langage naturel → proposition de mission, suggestion APP-6D, contrôle de cohérence, synthèse) | à concevoir |
| 3 | IA terrain (assistant quand connecté au PC, fonctions hors ligne légères) | à concevoir |

Le sous-projet 1 intègre des points d'ancrage pour l'IA (section 9) mais aucun modèle.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Flux de données | Sens unique PC → terrain. Le mobile est en lecture seule. |
| Plateformes | Web (PC) + Android natif (Kotlin), Android 10 (API 29) minimum. |
| Livraison du paquet | Réseau (reprise sur coupure) **et** fichier physique (SD/USB), même format. |
| Fond de carte | Tuiles vectorielles OSM par zone, format extensible à d'autres couches. |
| Objets | Génériques (point, ligne, polygone, cercle) + APP-6D complète, graphismes tactiques inclus. |
| Rendu APP-6D | Serveur uniquement (mil-sym-java). Le paquet contient la géométrie déjà calculée. |
| Format du paquet | Deux parties : fond de carte public signé + couche mission chiffrée et signée. |
| Déploiement | Un serveur par PC, isolé, joignable par Wi-Fi local ou réseau militaire. |
| Sécurité | PKI ALIAS, mTLS pour les terminaux, Keycloak ALIAS pour les utilisateurs web. |
| Serveur | Kotlin + Spring Boot, un seul déployable modulaire. |
| Web | TypeScript + React + MapLibre GL JS + Terra Draw. |
| Publication | Le planificateur publie seul (tracé dans l'audit). |

## 3. Architecture

```
 Poste de commandement (ALIAS / Kubernetes)                          Terrain
┌───────────────────────────────────────────────────────┐
│  Web (TypeScript + React + MapLibre GL JS)              │
│     │  HTTPS + OIDC (Keycloak ALIAS)                   │
│  Serveur geomap (Kotlin + Spring Boot)                  │
│   ├─ API missions (CRUD objets, affectation)           │   Wi-Fi PC /
│   ├─ Rendu APP-6D (mil-sym-java)                       │   réseau militaire
│   ├─ Validateur de mission                             │── mTLS ──►  Android
│   ├─ Constructeur de paquets (chiffre + signe)          │            (Kotlin, MapLibre
│   ├─ Distribution (téléchargement avec reprise)         │             Native, SQLCipher)
│   └─ Enrôlement des terminaux (via PKI ALIAS)          │
│  Job fonds de carte (planetiler : OSM .pbf → PMTiles)   │   carte SD / USB ──►
│  PostgreSQL : missions, objets, terminaux, audit        │
│  MinIO      : fonds de carte, paquets générés           │
│  Prometheus ◄─ métriques                                │
└───────────────────────────────────────────────────────┘
```

### Services ALIAS utilisés

Keycloak, PostgreSQL, MinIO, PKI, Kubernetes/Helm, Prometheus. Le projet n'installe aucun de ces services lui-même. PostGIS n'est pas requis en V1.

### Organisation du dépôt (monorepo)

| Dossier | Contenu |
|---|---|
| `shared/` | Bibliothèque Kotlin/JVM : format du paquet (manifeste, modèles), chiffrement/déchiffrement, signature/vérification. Utilisée par le serveur **et** l'app Android. |
| `server/` | Application Spring Boot. |
| `web/` | Application React. |
| `android/` | Application Android. |
| `deploy/helm/` | Chart Helm (serveur, web statique, job fonds de carte). |

## 4. Modèle de données (PostgreSQL)

| Entité | Champs principaux |
|---|---|
| `mission` | id, nom, statut (`DRAFT`, `PUBLISHED`, `WITHDRAWN`), basemap_id, valid_until, créée/modifiée par, dates |
| `feature` | id, mission_id, kind (`GENERIC`, `APP6`), geometry (GeoJSON, `jsonb`), bbox, name, description, style (`jsonb`, génériques), sidc (APP-6), modifiers (`jsonb`, champs texte APP-6), origin (`HUMAN`, `AI_SUGGESTED`), suggestion_status (`PENDING`, `ACCEPTED`, `REJECTED`, nul si humain) |
| `mission_version` | id, mission_id, numéro, snapshot des objets (`jsonb`), clé objet MinIO du paquet, sha256, publiée par, date |
| `basemap` | id, nom, bbox, clé objet MinIO du PMTiles, sha256, signature, date |
| `device` | id, nom, empreinte du certificat mTLS, clé publique de chiffrement, statut (`ENROLLED`, `REVOKED`), dernier contact |
| `enrollment_code` | code (haché), device_id, expire_at, utilisé |
| `assignment` | mission_id, device_id |
| `audit_event` | horodatage, acteur (utilisateur, ou agent pour le compte d'un utilisateur), action, cible, détails |

Les géométries sont en WGS 84 (EPSG:4326). Les dates sont stockées en UTC (ISO 8601).

## 5. Cycle de vie d'une mission

1. **Brouillon** : le planificateur édite. Le terrain ne voit rien.
2. **Publication** : le validateur doit être sans erreur. Le serveur fige la version N (snapshot), calcule le rendu APP-6D, construit le paquet chiffré pour les terminaux affectés, le dépose dans MinIO et trace l'événement.
3. **Mise à jour** : toute modification repasse en brouillon ; la publication suivante produit la version N+1. Le terminal conserve toujours la dernière version valide reçue.
4. **Retrait** : au prochain contact, le terminal reçoit l'ordre de supprimer la mission.
5. **Expiration** : `valid_until` est inscrit dans le paquet. Passée cette date, le terminal masque la mission même sans contact réseau.
6. **Changement d'affectation** : ajouter ou retirer un terminal reconstruit le paquet de la version courante avec la nouvelle liste de destinataires, sans changer le numéro de version. Un terminal retiré de l'affectation reçoit l'ordre de suppression au prochain contact. L'export pour carte SD produit ce même paquet.

Rôles Keycloak : `planificateur` (missions) et `administrateur` (terminaux, fonds de carte). Les terminaux ne sont pas des utilisateurs Keycloak ; ils s'authentifient par certificat mTLS.

## 6. Format du paquet

### 6.1 Fond de carte

- Fichier `<basemap-id>.pmtiles`, généré par planetiler à partir d'un extrait OSM importé manuellement.
- Accompagné de `<basemap-id>.sig` : signature ECDSA P-256 du serveur sur le SHA-256 du fichier.
- Donnée publique : signé, non chiffré. Mis en cache sur le terminal et partagé entre missions.

### 6.2 Couche mission (`.gmp`)

Conteneur binaire :

```
magic "GMP1" | longueur manifeste (uint32) | manifeste (JSON UTF-8) | charge chiffrée | signature
```

**Manifeste (en clair, signé)** :

```json
{
  "format": 1,
  "missionId": "0f6c…",
  "version": 3,
  "createdAt": "2026-09-25T08:00:00Z",
  "validUntil": "2026-10-02T00:00:00Z",
  "basemap": { "id": "zone-nord", "sha256": "…" },
  "payload": { "alg": "A256GCM", "iv": "…", "sha256": "…" },
  "recipients": [
    { "deviceCertSha256": "…", "alg": "RSA-OAEP-SHA256-MGF1SHA1", "wrappedKey": "…" }
  ]
}
```

**Charge (chiffrée en AES-256-GCM avec une clé aléatoire par paquet)** : une archive zip contenant

- `features/z0-10.geojson`, `features/z11-14.geojson`, `features/z15-22.geojson` : géométrie déjà calculée par tranche de zoom (les graphismes tactiques dépendent de l'échelle) ;
- `icons/<hash>.png` : images des symboles APP-6D ponctuels ;
- `summary.md` : synthèse de mission (saisie à la main en V1, générée par l'IA au sous-projet 2).

**Signature** : ECDSA P-256 du serveur, sur `manifeste || charge chiffrée`.

**Choix de RSA-OAEP pour l'emballage de clé :** l'accord de clé ECDH dans l'Android Keystore n'est disponible qu'à partir de l'API 31. Avec Android 10 minimum, le terminal utilise une paire RSA-3072 dédiée au déchiffrement (OAEP, empreinte SHA-256, MGF1-SHA1 : seul MGF1 accepté par l'Android Keystore avant l'API 34), distincte de la paire servant au certificat mTLS.

### 6.3 Règles de vérification sur le terminal

Un paquet est rejeté si :

- la signature est invalide ;
- la version est inférieure ou égale à la version installée ;
- aucun `recipients` ne correspond au terminal ;
- le fond de carte référencé est absent ou a une empreinte différente (la mission est alors mise en attente, avec un message explicite) ;
- `validUntil` est dépassé.

L'import est atomique : en cas d'échec, la version précédente reste en place.

## 7. Sécurité

### 7.1 Enrôlement d'un terminal (une fois, sur le Wi-Fi du PC)

1. L'administrateur crée le terminal sur le web ; le serveur génère un code d'enrôlement à usage unique, affiché en QR code, valable 10 minutes.
2. L'app scanne le QR code et génère dans l'Android Keystore (matériel si disponible) deux paires de clés : une pour le mTLS, une pour le déchiffrement.
3. L'app envoie la CSR mTLS et la clé publique de déchiffrement avec le code. Le serveur fait signer la CSR par la PKI ALIAS et renvoie le certificat, l'autorité racine et la clé publique de signature des paquets.
4. Toutes les communications suivantes utilisent le mTLS. Révocation : liste de révocation de la PKI ALIAS + statut `REVOKED` côté serveur.

### 7.2 Terminal

- Base locale SQLCipher, clé protégée par l'Android Keystore.
- **Effacement d'urgence** accessible en permanence : supprime la base, les paquets et les clés du Keystore. Les fonds de carte publics sont conservés.
- Code PIN au lancement : optionnel, activable par l'administrateur.

### 7.3 Web et serveur

- Connexion par OIDC (flux Authorization Code + PKCE) sur le Keycloak ALIAS ; le serveur valide les jetons (Spring Security OAuth2 Resource Server) et les rôles.
- Les journaux ne contiennent jamais de clés ni le contenu des missions.
- Tous les secrets passent par des Secrets Kubernetes ; rien n'est codé en dur.

## 8. Applications

### 8.1 Web (éditeur du planificateur)

- Carte MapLibre GL JS sur le fond PMTiles servi par le serveur ; coordonnées en MGRS et lat/lon.
- Dessin des objets génériques avec Terra Draw (création, déplacement, édition des sommets).
- Symboles APP-6D : sélecteur par catégorie avec recherche, formulaire des champs texte, aperçu calculé par le serveur et rafraîchi à la modification.
- Panneaux : liste des objets, validateur (erreurs bloquantes, avertissements non bloquants), historique des versions, suggestions en attente (prêt pour le sous-projet 2).
- Actions : publier, affecter à des terminaux, exporter pour carte SD, retirer.
- Administration : terminaux (enrôlement par QR code, révocation, dernier contact), fonds de carte (import d'un extrait OSM, génération d'une zone).
- Toutes les ressources statiques sont auto-hébergées (polices, glyphes, sprites).

### 8.2 Android (lecteur hors ligne)

- Écrans : enrôlement, liste des missions (version, validité, état de synchro), carte, détail d'un objet, réglages et effacement d'urgence.
- Carte MapLibre Native : fond PMTiles local + couche mission (GeoJSON et icônes).
- Position GPS locale (jamais transmise en V1), affichage MGRS, distance et gisement vers un objet.
- Import par fichier via le sélecteur Android, avec les mêmes vérifications que le réseau.
- Synchronisation manuelle et au démarrage si le serveur répond. Pas de service permanent en arrière-plan.

### 8.3 Budgets (mesurés sur l'appareil de référence)

| Mesure | Cible |
|---|---|
| Taille de l'APK arm64 | < 25 Mo |
| Mémoire, mission de 500 objets affichée | < 250 Mo |
| Ouverture de la carte à froid | < 2 s |

## 9. Points d'ancrage pour l'IA (préparation du sous-projet 2)

- **Une seule API pour humains et agents** : chaque action (créer un objet, calculer un symbole, valider, publier) est un point d'API décrit en OpenAPI, appelable comme un outil par un agent.
- **Suggestions** : un objet créé par un agent porte `origin = AI_SUGGESTED` et `suggestion_status = PENDING`. Il est affiché distinctement et n'entre dans une publication qu'une fois accepté par un humain.
- **L'IA ne publie jamais.** La publication exige un utilisateur humain authentifié.
- **Validateur à règles** exposé en API : utilisable par l'humain comme par l'agent pour vérifier ses propositions.
- **Audit** : l'acteur indique si l'action vient d'un humain ou d'un agent agissant pour le compte d'un humain.
- **Synthèse** : `summary.md` existe dans le paquet dès la V1.

## 10. Réseau dégradé et erreurs

- Téléchargement par morceaux de 256 Ko (requêtes HTTP `Range`), avec reprise au dernier morceau reçu et vérification des empreintes.
- Point de synchronisation minimal : le terminal envoie ses versions, le serveur répond uniquement avec ce qui change (réponse compressée, quelques centaines d'octets si rien ne change).
- Délais courts, nouvelles tentatives avec attente exponentielle et aléa. L'interface ne bloque jamais sur le réseau.
- Fonds de carte téléchargés uniquement sur le Wi-Fi du PC par défaut.
- Messages terminal : « paquet invalide ou altéré », « paquet destiné à un autre terminal », « mission expirée », « fond de carte manquant, synchronisez sur le Wi-Fi du PC ».

## 11. Observabilité

Métriques Prometheus (Spring Boot Actuator + Micrometer) : publications, durée et taille de construction des paquets, téléchargements (réussis, repris, échoués), terminaux actifs.

## 12. Tests

| Niveau | Contenu |
|---|---|
| `shared/` | Aller-retour chiffrement/déchiffrement, signature altérée rejetée, version antérieure rejetée, mauvais destinataire rejeté, paquet expiré rejeté. Couverture maximale. |
| Serveur | Intégration avec Testcontainers (PostgreSQL, MinIO, Keycloak de test) ; rendu mil-sym sur un jeu de symboles de référence (tactiques compris). |
| Web | Tests de composants ; parcours Playwright : créer une mission, dessiner, ajouter un symbole APP-6D, publier. |
| Android | Tests unitaires (import, expiration) ; tests instrumentés (effacement d'urgence) ; réseau dégradé via toxiproxy (latence, pertes, coupures) ; mesure des budgets en CI. |
| Bout en bout | Enrôler → publier → synchroniser → couper le réseau → afficher → mettre à jour par carte SD. |

## 13. Hors périmètre V1

- Remontée de données du terrain vers le PC (positions, annotations).
- Synchronisation entre plusieurs PC.
- Couches satellite, IGN, DTED (le format le permet, l'import n'est pas fait).
- Validation de publication à deux personnes.
- Toute fonctionnalité d'IA (sous-projets 2 et 3).
- iOS.

## 14. Points ouverts

| Point | Action |
|---|---|
| Appareil Android de référence | À définir pour mesurer les budgets. |
| Lecture PMTiles hors ligne par MapLibre Native Android | À vérifier au premier prototype ; repli sur MBTiles sans impact sur le reste. |
| Licences de mil-sym-java et de ses dépendances | À vérifier avant intégration (les SVG ESRI sont en Apache-2.0). |
| Stockage de la clé de signature du serveur | Secret Kubernetes en V1 ; HSM ou service de la PKI ALIAS à étudier. |
| Interface de la PKI ALIAS (API de signature de CSR, publication de la CRL) | À obtenir auprès de l'équipe ALIAS. |
| Disponibilité de PostGIS sur ALIAS | Non requis en V1 ; utile pour les fonctions spatiales futures. |
