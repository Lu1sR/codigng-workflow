# codigng-workflow

Marketplace de plugins de Claude Code para mi flujo de desarrollo. Contiene dos plugins:

| Plugin | Qué hace |
|---|---|
| [`software-factory`](plugins/software-factory) | Pipeline spec → dev → QA independiente con evidencias → review → PR. El agente que desarrolla nunca es el que prueba. |
| [`contextly`](plugins/contextly) | Contexto durable por repo: un store `.context/` committeado, un digest al abrir la sesión con lo que está desactualizado, y cinco comandos para mantenerlo. |

## Instalación

Como marketplace (recomendado):

```
/plugin marketplace add Lu1sR/codigng-workflow
/plugin install software-factory@codigng-workflow
/plugin install contextly@codigng-workflow
```

Para desarrollo local del plugin:

```bash
claude --plugin-dir ./plugins/software-factory
```

Requisitos en la máquina: `git`, `python3` (los scripts de verificación) y opcionalmente `jq`.

## Uso rápido

Dentro del repo donde querés la feature:

```
/software-factory:run Agregar endpoint POST /items que valide nombre no vacío y devuelva 201
/software-factory:run docs/tareas/mi-tarea.md
/software-factory:status
/software-factory:clean <run-id> --delete-branches
```

## Cómo funciona

```
 párrafo ──► factory-spec ──► [GATE 1: aprobás la spec] ──► factory-dev ──► factory-qa ──┐
                (solo lectura)                            (worktree dev)   (worktree qa)  │
                                                              ▲                           │ fail
                                                              └──── bug-report ◄──────────┘ (máx 3 vueltas)
                                                                                          │ pass
                                                     factory-reviewer ──► report.md ──► [GATE 2: push / PR]
```

1. **Spec.** `factory-spec` lee el repo (sin modificarlo) y convierte tu párrafo en `spec.md`
   con criterios de aceptación `AC-n` en Given/When/Then, un contrato de interfaces (endpoints,
   CLI, textos y `data-testid` de UI) y `plan.md`. Si tiene dudas reales hace hasta 3 preguntas.
2. **Gate 1.** Ves la spec y la aprobás, la editás o abortás. Sin aprobación no se escribe código.
3. **Dev.** `factory-dev` trabaja en un worktree propio (`factory/<run-id>`), implementa,
   escribe unit tests, corre lint/typecheck/unit a través de `capture.sh` (queda log + exit code
   + sha como evidencia) y commitea. No puede tocar `tests/e2e/`.
4. **QA.** `factory-qa` es otro agente, con otro worktree (`factory/<run-id>-qa`) partiendo del
   commit del dev. Solo recibe la spec y la sección "Environment setup" del resumen del dev.
   Instala dependencias en su worktree, escribe tests e2e derivados de los `AC-n`, los corre dos
   veces (detecta flakiness), guarda screenshots/logs/JUnit y emite `verdict.json` con
   pass/fail por criterio y defectos con repro. Solo puede escribir bajo `tests/e2e/` y el
   directorio del run.
5. **Bucle.** Si QA falla, el orquestador arma `bug-report-N.md` desde el veredicto y vuelve al
   dev. Máximo 3 iteraciones; después la corrida queda `failed` con el reporte de lo que nunca pasó.
6. **Review.** `factory-reviewer` (solo lectura) revisa el diff contra la spec: alcance, criterios
   sin test real, tests debilitados, seguridad, y que la evidencia corresponda al head.
7. **Reporte y Gate 2.** `report.py` arma `report.md` con la trazabilidad criterio → test →
   evidencia y cómo reproducir. Vos decidís si se pushea y se abre el PR.

## Cómo se garantiza la separación de roles

| Capa | Mecanismo | Dónde |
|---|---|---|
| Herramientas | Cada agente tiene su lista de tools; el reviewer y el spec no tienen Edit. | `agents/*.md` |
| Hooks (blanda) | `PreToolUse` por agente: QA no puede escribir fuera de `tests/e2e/` ni leer `impl-summary.md`, `plan.md` o el worktree del dev; el dev no puede tocar `tests/e2e/`; nadie hace `git push` ni reescribe historia. | `hooks/guard-paths.sh`, `hooks/guard-bash.sh` |
| Verificación dura | El orquestador valida el diff **commiteado** de cada rol con `check-paths.sh`, el veredicto con `verdict-check.py`, y que el checkout principal no cambió. Si algo falla, la corrida se detiene: nadie lo "arregla a mano". | `scripts/` |
| Contexto | Cada agente arranca con contexto vacío. QA no ve el plan ni el resumen del dev, así prueba en caja negra contra la spec. | `skills/run/SKILL.md` |

## Qué queda en tu repo

Nada, salvo lo que va al PR (código, unit tests y `tests/e2e/`). Todo lo demás vive en
`.factory/` dentro del repo, excluido vía `.git/info/exclude` (no se toca tu `.gitignore`):

```
.factory/
├── runs/<run-id>/
│   ├── task.md, spec.md, plan.md, impl-summary.md, qa-brief-N.md, bug-report-N.md
│   ├── verdict.json, review.md, report.md, run.json
│   └── evidence/dev/*.log|json   evidence/qa/iter-N/*.log|json|png|xml
└── worktrees/<run-id>/dev.wt  qa.wt
```

Las evidencias no se commitean; el reporte va en el cuerpo del PR y apunta a ellas. Si querés
adjuntarlas al PR, subilas a mano o esperá a la v2 (ver roadmap).

## Convivencia con contextly

Los dos plugins se reparten el trabajo sin pisarse: contextly decide qué contexto ve una sesión
(`CLAUDE.md` apuntando a `.context/`); la factory decide quién hace qué y con qué permisos. Los
subagentes heredan `CLAUDE.md`, así que las convenciones que contextly expone llegan al spec, al
dev y al reviewer sin duplicarlas.

Contextly registra un solo hook, `SessionStart`, que los subagentes no reciben. No hay hook de
PostToolUse, de Stop ni de git, así que una corrida de la factory nunca toca el checkout
principal por culpa de contextly, y su store vive entero en git (nada en `.gitignore` ni en
`.git/`), por lo que cada worktree lo tiene completo. Dos cosas a tener en cuenta:

- Si `architecture.md` describe **cómo está implementada** una feature, QA lo va a leer vía
  `CLAUDE.md` y pierde parte de la caja negra. Mantené el store al nivel de arquitectura y
  convenciones.
- Después de mergear una rama `factory/<run-id>`, corré `/contextly:update`: el dev no edita el
  store (el reviewer lo marcaría como fuera de alcance), así que el sync es tuyo.

## Reglas lean (menos código)

El dev trabaja bajo `templates/lean-rules.md`, adaptado del proyecto
[ponytail](https://github.com/DietrichGebert/ponytail) (MIT) para este pipeline, sin depender de
él. Lo que se tomó y por qué:

- **Escalera de reutilización** antes de escribir código: codebase, stdlib, plataforma,
  dependencia instalada, y recién después el mínimo que funciona. Sin el peldaño YAGNI (el alcance
  lo fija la spec aprobada) ni el de "una línea" (empuja a lo ingenioso).
- **Reglas de dieta que el reviewer verifica en el diff**: sin dependencias fuera del plan
  (bloqueante), sin abstracciones ni configuración que la spec no exija, menos archivos, borrar
  antes que agregar.
- **Causa raíz en las iteraciones de corrección**: buscar todos los callers y arreglar la función
  compartida una vez, en lugar de parchear el camino que nombra el defecto.
- **Lista "nunca se recorta"** como contrapeso: validación en fronteras, errores que evitan pérdida
  de datos, seguridad, accesibilidad, lo pedido en la spec. El reviewer bloquea si algo de esto se cayó.
- **Marcadores de atajo** `shortcut: <techo>; upgrade: <trigger>` en toda simplificación deliberada.
  El reporte lista los introducidos por la corrida y marca los que no tienen trigger.
- **Lean findings** en la review con tags `delete`, `stdlib`, `native`, `yagni`, `shrink`,
  `unmarked` y cierre `net: -N líneas`. No bloquean: otra vuelta dev+QA cuesta más que unas líneas de sobra.
- El reporte incluye el tamaño del diff (+/- líneas) para ver la tendencia entre corridas.

Si además usás ponytail como plugin, limitá su inyección a `PONYTAIL_SUBAGENT_MATCHER=factory-dev`:
su regla de "una sola verificación sin frameworks" es lo contrario de lo que QA necesita.

## Configuración

- **Sin atribución de IA:** el dev y QA commitean y el orquestador abre el PR sin trailers
  `Co-Authored-By` ni "Generated with". Los prompts lo dicen, pero Claude Code los agrega por
  defecto, así que apagalos en el origen en `~/.claude/settings.json`:
  `{ "attribution": { "commit": false, "pr": false, "sessionUrl": false } }`.
- **Modelo por rol:** campo `model:` en `agents/*.md` (`inherit` por defecto). Poné el modelo
  más capaz en `factory-spec` y `factory-reviewer` si querés.
- **Iteraciones:** `max_iterations` en `run.json` (default 3). Se puede editar después del init.
- **Turnos por agente:** `maxTurns` en cada agente.
- **Stack:** no hay nada hardcodeado. El agente spec detecta el harness (Playwright, Cypress,
  pytest, etc.); si no existe, el dev lo instala en la raíz del repo y QA escribe los tests en
  `tests/e2e/`.

## Limitaciones de la v1

- La capa de hooks es heurística; la garantía real es la verificación de diffs commiteados.
- El orquestador corre en tu sesión principal (necesita las gates humanas), así que una corrida
  ocupa la sesión mientras dura.
- Los worktrees anidados en `.factory/worktrees/` comparten `node_modules`/venv con nada: cada
  rol instala lo suyo. Es lo que da el aislamiento, y también lo que lo hace lento la primera vez.
- No hay paralelismo: un run, una feature.

## Roadmap

- v1.1: `--attach-evidence` para subir screenshots/JUnit al PR; resumen de flakiness.
- v1.2: workflow determinista (Workflow tool) cuando `agent()` soporte subagentes con nombre, con QA paralelo por criterio.
- v1.3: modo "solo QA" para probar un PR existente contra una spec.
