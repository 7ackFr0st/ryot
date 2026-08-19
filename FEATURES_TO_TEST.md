# Features added — 2026-08-18

Test checklist after deploy. Frontend-only changes, no backend/migration/codegen needed.

## 1. "Add to watchlist" button

**File:** `apps/frontend/app/routes/_dashboard.media.item.$id._index.tsx`

Button in the **Actions** tab of a movie/show detail page. Shows only if the item
isn't already in the user's "Watchlist" collection (default collection, always
exists). One click adds it, no modal.

**Test:**
- [ ] Open a movie not in Watchlist → button visible → click → toast/refresh, item now in Watchlist collection
- [ ] Open a show not in Watchlist → same
- [ ] Reopen item already in Watchlist → button gone
- [ ] Check collection page "Watchlist" → item appears
- [ ] Existing "Add to collection" button still works (untouched)

## 2. "Rewatched" button per season

**File:** `apps/frontend/app/components/routes/media-item/displays/show-season.tsx`

New button next to "Watch again" on each season card in the **Seasons** tab —
only shown for seasons already seen at least once (`timesSeen > 0`). Marks
every episode in that season as newly completed (adds a history entry per
episode via `DeployBulkMetadataProgressUpdateDocument`), independent of prior
seen status — a real rewatch, not just "fill unseen gaps".

**Test:**
- [ ] Show with a fully-watched season → "Rewatched" button appears
- [ ] Click it → loading state → all episodes get a new history entry (check History tab / episode timesSeen)
- [ ] Season's `timesSeen` counter increments
- [ ] Season never watched → no "Rewatched" button (only "Mark as seen")
- [ ] Season partially watched → still shows "Watch again" only (not "Rewatched") since `isSeen` is per any-seen, verify behaves as expected — button appears once any episode seen (matches existing "Watch again" logic)
- [ ] Large season (20+ episodes) → mutation doesn't time out / UI doesn't freeze

## 3. Total watch time — Movies vs Shows in Analytics

**File:** `apps/frontend/app/routes/_dashboard.analytics.tsx`

Two new stat tiles in the Analytics activity section: "Movies watch time" and
"Shows watch time", summed from `totalMovieDuration` / `totalShowDuration`
(already returned by the `userAnalytics` query, just not aggregated
client-side before). Respects the selected date range (same as existing
"Duration" stat).

**Test:**
- [ ] Analytics page loads without error
- [ ] "Movies watch time" and "Shows watch time" tiles show up alongside existing "Total"/"Duration" tiles
- [ ] Values look sane vs known watch history (compare against manual sum for a known small date range)
- [ ] Switching date range (7d/30d/All time/custom) updates both values
- [ ] Zero-activity period → shows "0m" or similar, not crash
- [ ] "Save image" export still captures the new tiles correctly

## Not touched

- No Rust/backend changes
- No GraphQL schema/codegen changes (all fields already existed)
- No DB migration




---------------------------------------------------

# Plan optimisation perf — Ryot

## Contexte

Site percu lent. Analyse codebase (agent Explore + lecture directe) a identifie 5 causes concretes,
evidence file:line a l'appui. Chaque point ci-dessous: quoi modifier, fichiers touches, impact,
risques, tests avant/apres, gain attendu. Ordre = effort croissant / risque croissant, pas forcement
priorite d'implementation (voir section finale pour ordre recommande).

Aucun changement fait pour l'instant — plan seul, en attente validation.

---

## Point 0 — Infra tests de non-regression + benchmarks (PREREQUIS, a faire avant tout le reste)

Sans mesure avant/apres reproductible, "plus rapide" reste une impression. Ce point met en place
l'outillage une fois, avant de toucher au moindre code des points 1-5. Objectif double: verifier
que rien ne casse (non-regression) et prouver le gain chiffre (benchmark).

**Existant a reutiliser (ne pas reinventer):**
- `tests/` — suite vitest + `testcontainers` deja en place (`tests/src/setup/global-setup.ts`,
  `tests/src/setup/test-orchestrator.ts`) qui demarre Postgres + backend + Caddy dans des containers
  et tape directement l'API GraphQL (`tests/src/tests/health.test.ts`, `cache.test.ts`,
  `collection-filters.test.ts`, `user.test.ts`). C'est deja une base de non-regression API-level
  fonctionnelle — a lancer telle quelle (`yarn workspace @ryot/tests test` ou equivalent, voir
  `tests/package.json:8`) avant et apres CHAQUE point du plan.
- Gap identifie: cette suite ne teste que l'API (GraphQL/HTTP), pas le rendu navigateur. Les points
  1 (staleTime) et 3 (images) sont des comportements visibles cote UI (requetes emises au fil de la
  navigation, affichage des images) — l'API seule ne les valide pas completement.

**A ajouter:**

1. **Tests de non-regression navigateur (Playwright)** — pas encore present dans le repo (verifie:
   aucune config Playwright, seulement present comme dependance transitive dans `yarn.lock`).
   - Ajouter un workspace `tests-e2e/` (ou dans `tests/` existant) avec Playwright, config minimale
     pointant sur l'instance lancee par le meme `test-orchestrator.ts` (reutiliser le
     `caddyBaseUrl` deja expose) — pas de nouvelle infra de demarrage a ecrire.
   - Couvrir UNIQUEMENT le parcours critique deja liste dans les checklists de chaque point (pas
     une suite exhaustive): login → recherche media → ouvrir item → marquer comme vu → ajouter a
     collection/watchlist → onglet Seasons (rewatch) → onglet analytics → import/export en cours.
     ~6-8 specs courtes, objectif = detecter une casse visible (page blanche, image 404, bouton mort),
     pas une couverture complete.
   - Utiliser le skill/agent E2E deja disponible dans l'environnement (agent `e2e-runner`, skill
     `everything-claude-code:e2e`) pour generer ces specs plutot que les ecrire a la main.

2. **Benchmarks backend (k6)** — outil externe (binaire, pas un package npm), a installer separement
   (`choco install k6` sous Windows ou binaire direct). Scripts k6 ciblant les operations GraphQL
   concernees par les points 2-5:
   - `metadataDetails` / `userMetadataDetails` (points 2, 4) — cache hit repete.
   - `getPresignedS3Url` sur une liste de cles (point 3) — avant/apres passage en batch.
   - Requete de recherche media (charge generale, point 5 pool DB) — simuler 10-20 "utilisateurs
     virtuels" concurrents comme demande.
   - Chaque script exporte un resume JSON (p50/p95/p99, req/s, taux d'erreur) — sauvegarder le
     resume "avant" avant de commencer un point, comparer au resume "apres" une fois le point fini.
   - Cibler soit l'environnement `testcontainers` (reproductible, isole) soit l'instance
     docker-compose reelle de l'utilisateur (plus proche de la realite mais moins isole) — a
     decider en implementation selon ce qui est le plus pratique a lancer repetitivement.

3. **Benchmarks frontend (simple, sans outil)** — pour le point 1 specifiquement, la methode
   manuelle suffit comme propose: onglet Network du navigateur, compter les requetes GraphQL sur un
   parcours de 3-4 pages, avant/apres. Optionnellement, un rapport Lighthouse (Chrome DevTools,
   integre, pas d'install) sur 2-3 pages cles (accueil, item media, recherche) pour un score
   objectif de performance de chargement, avant/apres.

**Sequence a suivre pour CHAQUE point (1 a 5):**
1. Lancer suite vitest (non-regression) → doit etre 100% vert avant de commencer.
2. Lancer script(s) k6 pertinent(s) pour ce point → sauvegarder resultat "avant".
3. Implementer le point.
4. Relancer suite vitest → doit rester 100% vert (sinon: regression, corriger avant de continuer).
5. Relancer suite Playwright sur le parcours concerne → doit rester vert.
6. Relancer script(s) k6 → comparer resultat "apres" vs "avant", noter le delta chiffre.
7. Pour le point 1: capture manuelle Network tab avant/apres (nombre de requetes).

**Effort:** Moyen (mise en place initiale — surtout Playwright + scripts k6 — mais reutilise a 100%
pour les 5 points suivants, donc rentabilise des le 2e point testé).

---

## Point 1 — React Query refetch tout le temps (staleTime absent)

**Constat:** `apps/frontend/app/lib/shared/react-query.ts:39-41` — `QueryClient` global n'a que
`placeholderData`, pas de `staleTime`/`gcTime`. Defaut TanStack Query = `staleTime: 0` → chaque
mount de composant, chaque retour d'onglet (`refetchOnWindowFocus` par defaut `true`), chaque
navigation refetch TOUT (metadata details, collections, analytics, listes...) meme si rien n'a
change cote serveur.

**A modifier:**
- `apps/frontend/app/lib/shared/react-query.ts:39-41` — ajouter `staleTime` et `gcTime` par defaut
  dans `defaultOptions.queries` (ex: `staleTime: 60_000` = 1min, `gcTime: 5 * 60_000`).
- Revoir cas par cas les queries qui ont besoin de data "temps reel" (ex: notifications, statut
  d'import en cours) — leur passer un `staleTime: 0` explicite en override local si necessaire
  (`useQuery({ ...opts, staleTime: 0 })`).

**Impact:**
- Reduit drastiquement le nombre de requetes GraphQL emises au fil de la navigation (le gros
  du "site lent" ressenti vient probablement de la, chaque clic reest un aller-retour reseau+DB
  meme pour des donnees deja vues il y a 2 secondes).
- Risque: data un peu "perimee" affichee jusqu'a `staleTime` expire (acceptable pour la plupart
  des ecrans media/collections, PAS pour ecrans avec mutation frequente cote serveur externe,
  ex: import en cours, notifications).

**Verifier apres:**
- Ouvrir DevTools Network, naviguer entre 3-4 pages (accueil → item media → retour), compter
  requetes GraphQL avant/apres.
- Marquer un episode comme vu → verifier que l'UI se met a jour immediatement quand meme
  (les mutations invalident deja les query keys via `refreshEntityDetails`/`invalidateQueries`,
  donc doit rester reactif malgre le staleTime).
- Changer d'onglet navigateur puis revenir → verifier pas de flash de reload inutile.
- Import en cours (settings > imports) → verifier que le statut se met bien a jour (queries
  concernees doivent garder staleTime bas/0).

**Tests avant/apres (checklist commune):**
- [ ] Login fonctionne
- [ ] Marquer episode/film comme vu → reflete immediatement dans Actions/History/Seasons
- [ ] Ajouter a collection → reflete immediatement (watchlist etc., feature recente)
- [ ] Recherche media fonctionne et affiche resultats a jour
- [ ] Page analytics affiche donnees a jour apres changement de plage de dates
- [ ] Import/export en cours: statut progresse correctement sans devoir F5

**Gain attendu:** Le plus gros gain perceptible pour le plus petit effort. Change 1 fichier,
quelques lignes. Reduction requetes GraphQL redondantes potentiellement de 50-80% en navigation
normale (chiffre a confirmer par mesure avant/apres, pas garanti).

**Effort:** Faible (1 fichier, config seule + audit rapide des queries "temps reel").

---

## Point 2 — Cache applicatif backend = table Postgres (pas de couche memoire)

**Constat:** `crates/services/cache/src/lib.rs` — `get_values` (186-223) et `set_keys_with_custom_expiry`
(98-155) font systematiquement un aller-retour Postgres, meme pour un cache hit. Table
`application_cache` deja bien indexee (`m20241004_create_application_cache.rs:71-98` — index sur
`sanitized_key`, `expires_at`, et hash index sur `key`), donc ce n'est PAS un scan lent, mais reste
un roundtrip reseau+DB (~qqms) pour des donnees deja calculees, sur des cles frequentes
(`UserMetadataDetails`, `MetadataDetails`, `UserAnalytics`, TTL 1h-8h, `lib.rs:20-83`).

**A modifier:**
- Ajouter une couche in-process devant `get_values`/`set_keys` dans `crates/services/cache/src/lib.rs` —
  crate `moka` (async, thread-safe, TTL natif, pas de nouvelle infra a deployer — contrairement a
  Redis, coherent avec le mode self-hosted single-binary de Ryot).
- `get_values`: check moka cache d'abord (par cle serialisee), fallback Postgres si miss, puis
  populate moka.
- `set_keys_with_custom_expiry` / `expire_key`: invalider/mettre a jour moka en parallele de l'ecriture
  Postgres (pour rester coherent si plusieurs instances/process backend ne tournent PAS en parallele —
  Ryot est mono-process, donc pas de probleme de cache distribue a gerer ici).
- Garder la table Postgres comme fallback/persistance (utile au redemarrage, et pour
  `expire_key`/`ExpireCacheKeyInput::ByUser` qui fait des invalidations par pattern — a garder en DB
  ou refaire en memoire selon le volume de cles par user).

**Impact:**
- Elimine le roundtrip DB pour les cles chaudes lues plusieurs fois entre deux TTL.
- Risque principal: divergence cache memoire vs DB si `expire_key` (invalidation manuelle, ex:
  apres update de collection) n'est pas bien repercutee en memoire → data perimee affichee.
  C'est le point le plus delicat du plan, a tester serieusement.
- Ajout dependance `moka` au `Cargo.toml` du crate cache.

**Verifier apres:**
- Modifier une collection / mettre a jour metadata → verifier que le cache est bien invalide
  (pas d'affichage de vieille donnee apres modif).
- Redemarrage backend → verifier cache memoire vide au reboot, pas de crash au premier miss.
- Verifier memoire RAM du process backend ne grimpe pas de facon incontrolee (moka a une limite
  de taille configurable — fixer une taille max raisonnable, ex 10k entrees ou X Mo).

**Tests avant/apres:**
- [ ] Editer un item (metadata, collection, review) → la modif apparait immediatement partout
      ou elle est affichee (pas de cache stale)
- [ ] `UserAnalytics` reflete bien les nouvelles activites apres action utilisateur
- [ ] Redemarrer le serveur → app fonctionne normalement au reboot (pas de crash lie au cache vide)
- [ ] Charger la meme page media 2x de suite → 2e chargement visiblement plus rapide (mesurer
      temps de reponse GraphQL, ex via `x-response-time` ou logs)

**Gain attendu:** Modere a bon selon frequence de lecture des memes cles. Plus dur a mesurer
que le point 1. Gain surtout sur les pages consultees frequemment par plusieurs users
(CoreDetails, MetadataDetails d'items populaires).

**Effort:** Moyen (nouvelle dependance, logique d'invalidation a bien tester, risque de bug de
coherence cache si mal fait — a traiter avec attention, tests manuels obligatoires avant de
merger).

---

## Point 3 — Images: 1 requete GraphQL par image (N+1 cote frontend)

**Constat:** `apps/frontend/app/lib/shared/hooks/index.ts:681-697` (`useS3PresignedUrls`) —
`Promise.all(keys.map(key => clientGqlService.request(GetPresignedS3UrlDocument, { key })))`.
Une grille de 20 posters = 20 requetes GraphQL distinctes + 20 appels `presign` S3 backend.
En plus, `crates/services/file-storage/src/lib.rs:49-62` (`get_presigned_url`) a une expiry de
**2 minutes seulement** (`PresigningConfig::expires_in(Duration::minutes(2))`) → URLs re-demandees
tres souvent, meme avec un bon staleTime cote frontend (impossible de cacher plus longtemps
qu'une URL qui expire).

**A modifier:**
- Backend: ajouter un resolver GraphQL batch, ex `getPresignedS3Urls(keys: [String!]!): [String!]!`
  dans le resolver existant (chercher ou vit `GetPresignedS3UrlDocument` cote backend, probablement
  `crates/resolvers/miscellaneous` ou equivalent — a localiser precisement en implementation).
  Le call S3 lui-meme (`get_presigned_url`) n'a pas besoin d'etre parallelise en Rust via
  `futures::future::join_all` sur les keys, ce qui est deja rapide (pas d'appel reseau S3 reel pour
  un presign — c'est du calcul crypto local, aucun aller-retour S3 requis). Donc le vrai gain est de
  passer de N requetes GraphQL/HTTP a 1 seule.
- `crates/services/file-storage/src/lib.rs:55-57` — augmenter l'expiry de 2min a une valeur plus
  raisonnable (ex: 30-60min, S3 presign supporte jusqu'a 7 jours). 2 minutes semble une securite
  excessive pour de simples posters/thumbnails publics-ish (pas de data sensible), a confirmer avec
  l'utilisateur si volontaire pour raison de securite.
- Frontend: `useS3PresignedUrls` (hooks/index.ts:681-697) — remplacer le `Promise.all` par un seul
  call au nouveau resolver batch.

**Impact:**
- Reduit N requetes GraphQL a 1 pour toute grille d'images.
- Expiry plus longue = moins de refetch meme avec un staleTime raisonnable cote React Query
  (point 1) — les deux points se renforcent.
- Risque: si l'expiry est allongee, une URL presignee "fuitee" (partagee, log, etc.) reste valide
  plus longtemps — a evaluer si c'est un souci reel selon la politique de securite voulue
  (bucket prive vs public, contenu = juste des posters de films/series, impact limite).

**Verifier apres:**
- Grille de resultats de recherche / liste media avec beaucoup de posters → verifier 1 seule
  requete `getPresignedS3Urls` dans Network au lieu de N.
  Attention si backend ne supporte pas un batch endpoint, un `dataloader`/regroupement
  cote resolver Rust est une alternative (regrouper les requetes concurrentes en un seul batch —
  plus complexe, seulement si le endpoint batch GraphQL n'est pas faisable rapidement).
- Verifier que les images s'affichent toujours correctement (pas de regression cassee/404) apres
  changement d'expiry.

**Tests avant/apres:**
- [ ] Page d'accueil / liste avec grille de posters → toutes les images se chargent
- [ ] Page item media individuel → poster + images creators/personnes se chargent
- [ ] Attendre >2min sur une page ouverte (l'ancienne limite) → images ne cassent pas
      (verifie que le nouveau TTL plus long fonctionne, ou que le refresh cote client marche)
- [ ] Recherche avec beaucoup de resultats (50+) → temps de chargement grille avant/apres

**Gain attendu:** Bon sur les pages avec beaucoup d'images (recherche, listes, grilles) —
potentiellement le 2e plus gros gain visible apres le point 1, car directement lie au "temps de
chargement visuel" percu par l'utilisateur.

**Effort:** Moyen (necessite un changement GraphQL schema backend = nouveau resolver +
regeneration types frontend via codegen, cf `libs/generated`).

---

## Point 4 — N+1 queries confirmes cote backend (jobs)

**Constat:**
- `crates/services/miscellaneous/background/src/notifications.rs:32-58`
  (`send_notifications_for_outdated_seen_entries`) — fetch tous les `Seen` outdated (ligne 32-36),
  puis boucle `for seen_item in seen_items` avec `seen_item.find_related(Metadata).one(&ss.db)`
  **dans la boucle** (ligne 38) = 1 requete Metadata par item.
- Table `seen` n'a qu'un index `(user_id, metadata_id)` (`m20230510_create_seen.rs:120-125`) —
  aucun index sur `(state, last_updated_on)`, colonnes utilisees par le filtre de ce job
  (`notifications.rs:33-34`) → scan potentiel sur une table qui grossit avec le temps (chaque
  visionnage cree une ligne `seen`).
- `crates/services/miscellaneous/metadata-operations/src/lib.rs:93-112` (`merge_metadata`) — `.count()`
  dans une boucle `for item in CollectionToEntity::find()...` (ligne ~101-106).

**A modifier:**
- `notifications.rs:37-58` — remplacer la boucle par un fetch batch des `Metadata` correspondants
  (collecter les `metadata_id` des `seen_items`, un seul `Metadata::find().filter(id.is_in(ids))`,
  puis join en memoire via `HashMap`).
- Ajouter une migration pour un index composite sur `seen(state, last_updated_on)` (nouveau fichier
  dans `crates/migrations/sql/src/`, suivre le pattern des migrations existantes comme
  `m20230510_create_seen.rs`).
- `metadata-operations/src/lib.rs:93-112` — meme logique, batcher le `.count()` en une requete
  groupee (`GROUP BY`) plutot qu'un `.count()` par item de boucle.

**Impact:**
- Ce job (`send_notifications_for_outdated_seen_entries`) tourne en cron (infrequent/frequent
  scheduler, `apps/backend/src/main.rs:168-198`), donc n'impacte pas directement une requete HTTP
  utilisateur en temps reel — MAIS consomme des connexions du pool DB partage avec le serveur web
  (voir point 5), donc peut ralentir indirectement les requetes utilisateur pendant son execution
  si l'instance a beaucoup d'utilisateurs/items `seen` en cours.
- `merge_metadata` par contre EST déclenché par une action utilisateur directe (fusion manuelle de
  media dans l'UI) — la latence de cette action specifique s'ameliore directement.

**Verifier apres:**
- Verifier que les notifications "outdated seen entries" sont toujours envoyees correctement
  (meme contenu, meme destinataires) apres le refactor batch.
- Verifier `merge_metadata` fusionne toujours correctement les collections (pas de regression sur
  le count utilise pour la logique de merge — bien comprendre a quoi sert ce `.count()` avant de le
  changer, lire le contexte complet de la fonction en implementation).
- Apres migration ajout d'index: verifier que la migration passe sur une DB avec des donnees
  existantes (pas juste une DB vide de test).

**Tests avant/apres:**
- [ ] Creer un item `seen` en `InProgress` depuis >7 jours (ou modifier manuellement `last_updated_on`
      en DB de test) → verifier notification "outdated" bien envoyee apres le fix
- [ ] Fusionner 2 items media (merge) qui ont des collections qui se chevauchent → verifier
      resultat identique avant/apres refactor
- [ ] `EXPLAIN ANALYZE` sur la requete du job notifications avant/apres ajout d'index (confirmer
      passage de Seq Scan a Index Scan si la table `seen` est assez grosse pour que ca compte)

**Gain attendu:** Faible impact direct sur "le site est lent" ressenti par l'utilisateur en
navigation normale (c'est un job de fond), mais reduit la charge DB globale et evite une
degradation future a mesure que la table `seen` grossit. `merge_metadata` plus rapide a l'usage.

**Effort:** Moyen (migration DB + refactor logique, necessite bien comprendre le `.count()` de
merge_metadata avant de le changer pour ne pas casser la logique de fusion).

---

## Point 5 — Jobs de fond + serveur web dans le meme process/pool DB

**Constat:**
- `apps/backend/src/main.rs:168-249` — `Monitor` (apalis, jobs cron + queue) et `axum::serve`
  (serveur HTTP) tournent `join!`'d dans le meme process Tokio, partageant le meme pool de
  connexions DB (`db` unique passe a `create_app_dependencies`, ligne 104-132).
- `perform_hp_application_job` (ligne 214-221) n'a **aucun** `.rate_limit(...)`, contrairement a
  `mp_application_job` (`rate_limit(10, 5s)`, ligne 227) et `lp_application_job`
  (`rate_limit(40, 5s)`, ligne 236). "hp" = high priority, presumablement volontaire (jobs urgents
  a executer sans throttle) — a confirmer quel type de job y est route avant de considerer ca comme
  un bug (voir `apps/backend/src/job.rs` et `crates/models/background/src/lib.rs` en implementation).
- Aucune config explicite de taille de pool DB trouvee (`max_connections`/`ConnectOptions`
  absents du repo) → sea-orm/sqlx utilisent leurs valeurs par defaut (typiquement 10 connexions
  max cote sqlx), partagees entre TOUTES les requetes HTTP concurrentes ET tous les workers de
  jobs. Sur une instance avec plusieurs utilisateurs actifs + jobs de sync en cours, ce pool peut
  saturer et faire attendre les requetes HTTP.

**A modifier:**
- `crates/services/supporting/src/lib.rs` (ou la ou `Database::connect` est appele dans
  `apps/backend/src/main.rs:104-106`) — remplacer `Database::connect(url)` par
  `Database::connect(ConnectOptions::new(url).max_connections(N).min_connections(M)...)`
  avec une valeur explicite configurable (ex via `AppConfig`, section `database`), au lieu de la
  valeur par defaut implicite. Valeur de depart raisonnable: 20-30 pour une instance self-hosted
  moyenne, a exposer en config pour que l'utilisateur l'ajuste selon ses ressources.
- Investiguer (avant de toucher au code) quels types de jobs sont routes vers `hp_application_job`
  (`apps/backend/src/job.rs`) — si ce sont des jobs potentiellement lourds/nombreux (pas juste
  "1 notification urgente ponctuelle"), ajouter un `.rate_limit(...)` coherent avec le reste.

**Impact:**
- Pool DB plus grand = moins de contention entre requetes HTTP utilisateur et jobs de fond,
  surtout perceptible si l'utilisateur a des imports/sync en cours en meme temps qu'il navigue.
- Risque: augmenter `max_connections` sans que Postgres soit configure pour (`max_connections`
  cote serveur Postgres) peut causer des erreurs de connexion refusee si Postgres est proche de sa
  propre limite — verifier `max_connections` de l'instance Postgres avant d'augmenter cote appli.

**Verifier apres:**
- Lancer un import volumineux (ex: import Trakt/IMDB avec bcp d'items) tout en naviguant dans le
  site en parallele → verifier que la navigation reste fluide (pas de timeout/latence anormale).
- Verifier logs backend au demarrage: pas d'erreur "too many connections" cote Postgres apres
  augmentation du pool.
- Comparer temps de reponse GraphQL moyen (logs ou `x-response-time`) avant/apres sous charge
  (import en cours + navigation simultanee).

**Tests avant/apres:**
- [ ] App demarre sans erreur avec la nouvelle config pool
- [ ] Import de donnees volumineux + navigation simultanee → pas de blocage/timeout
- [ ] Jobs cron (notifications, sync) s'executent toujours correctement (verifier logs)
- [ ] Sous charge normale (pas d'import en cours), pas de regression de latence

**Gain attendu:** Variable selon le nombre d'utilisateurs/frequence des jobs — potentiellement
important si l'instance actuelle sature deja son pool par defaut (10 connexions), sinon gain
marginal. A mesurer AVANT de faire le changement si possible (voir si le pool actuel sature deja,
via des logs sea-orm en debug ou des metriques Postgres `pg_stat_activity`).

**Effort:** Faible a moyen (config seule pour le pool ; investigation necessaire pour le rate
limit hp_application_job avant de conclure que c'est un vrai probleme).

---

## Decision confirmee

Implementation **etape par etape** — 1 point a la fois, verif/mesure avant de passer au suivant.
Ne pas enchainer les 5 points dans la meme session sans validation intermediaire.

## Ordre d'implementation recommande

0. **Point 0** (infra tests + benchmarks) — a faire en premier, une seule fois, avant tout le reste.
   Sans ca, aucun des points suivants n'a de preuve avant/apres.
1. **Point 1** (staleTime React Query) — gain le plus visible, risque le plus faible, 1 fichier.
2. **Point 3** (batch images + expiry) — gros gain visuel, necessite juste 1 nouveau resolver.
3. **Point 5** (pool DB) — config seule, faible risque, a faire tot car ameliore la marge de
   manoeuvre pour tout le reste.
4. **Point 4** (N+1 backend + index) — gain plus indirect, mais faible risque si bien teste.
5. **Point 2** (cache in-memory moka) — le plus complexe et le plus risque (coherence cache),
   a faire en dernier une fois les autres gains mesures — pourrait meme s'averer moins necessaire
   si les points 1+3+5 suffisent a resoudre le ressenti de lenteur.

Recommandation: implementer point par point, mesurer avant/apres a chaque etape (Network tab
temps de requete, ou logs backend), plutot que tout faire d'un coup — plus facile d'isoler ce qui
a vraiment aide et de revenir en arriere si un point cause une regression.

## Verification globale (a faire apres chaque point, pas juste a la fin)

- Suivre la sequence en 7 etapes du Point 0 (vitest + k6 avant, implementation, vitest + Playwright
  + k6 apres, comparaison chiffree).
- `yarn typecheck` + `yarn lint` (frontend) sur les fichiers touches.
- `cargo check` / `cargo clippy` (backend) sur les crates touches.
- Pour les changements backend avec migration: tester la migration sur une copie de la DB
  reelle (pas juste une DB vide), et verifier qu'elle est reversible si `down()` est implemente.
