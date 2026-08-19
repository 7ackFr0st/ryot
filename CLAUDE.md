# PROJECT CONTEXT
project: ryot
created: 2026-08-03
root:     D:\Projets\ryot
obsidian: \\TRUENAS\Obsidian\Second_Cerveau\Projets\ryot

<!--
  RÃˆGLES DE CE FICHIER (commentaires HTML = strippÃ©s du contexte Claude, 0 token) :
  - Contexte PROJET uniquement. ZÃ©ro duplication des rÃ¨gles globales (~/.claude/CLAUDE.md).
  - Budget : <80 lignes. Rempli au bootstrap par Claude (fingerprint Â§2), maintenu ensuite.
  - Ajouter une ligne quand : Claude refait 2x la mÃªme erreur, ou tu retapes la mÃªme
    correction qu'Ã  la session prÃ©cÃ©dente.
  - Prefs perso non commitÃ©es (URLs sandbox, data de test) -> ./CLAUDE.local.md
    (gitignored, chargÃ© automatiquement aprÃ¨s ce fichier).
-->

## STACK
<!-- Rempli au bootstrap : runtime + version exacte, framework, pkg manager + lockfile. -->
- runtime:
- framework:
- pkg manager:
- DB / services:

## COMMANDS
<!--
  Exacts, copy-paste. Section la plus rentable du fichier.
  test (single) : ex. pytest tests/test_x.py::test_y / 
px vitest run src/x.test.ts
-->
- dev:
- build:
- test (all):
- test (single):
- lint:
- typecheck:

## ARCHITECTURE
<!--
  <=6 lignes : entry points, dossiers clÃ©s, flux de donnÃ©es en 1 phrase.
  Le dÃ©tail vit dans graphify-out/GRAPH_REPORT.md â€” pas ici.
-->
- entry:
- key dirs:
- data flow:

## CONVENTIONS (project-specific)
<!--
  UNIQUEMENT les Ã©carts vs rÃ¨gles globales et vs dÃ©fauts Ã©vidents du stack.
  Ex : "API handlers -> src/api/handlers/", "erreurs -> Result<T,E>, jamais throw".
-->

## GOTCHAS
<!--
  PiÃ¨ges connus, tests flaky, zones do-not-touch, Ã©tapes de build non Ã©videntes.
  Ex : "migration 004 irrÃ©versible", "port 3000 pris par service X".
-->

## ENV
<!-- NOMS de variables + oÃ¹ les obtenir. JAMAIS de valeurs (rÃ¨gle secrets globale Â§11). -->
- required:
- source:

<!--
  Optionnel :
  - Imports : @docs/architecture.md (chargÃ©s au launch -> coÃ»tent du contexte, parcimonie).
  - RÃ¨gles ciblÃ©es : .claude/rules/*.md avec frontmatter paths: ["src/api/**/*.ts"]
    -> chargÃ©es seulement quand Claude touche des fichiers correspondants (0 coÃ»t sinon).
-->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
