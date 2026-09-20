# contextly

Mantiene el contexto durable de un repositorio (qué es, cómo está cableado,
por qué) exacto en el tiempo, en vez de dejarlo pudrirse en un README que nadie
actualiza. Es un store committeado en `.context/`, un hook de SessionStart que
dice qué está desactualizado, y cinco comandos que lo mantienen. Python stdlib
y git, nada que instalar.

## La regla

> **Commiteá lo que no se puede regenerar. No guardes lo que sí.**

Una lista de dependencias, una tabla de rutas, un árbol de directorios: Claude
los lee del repo en segundos, así que no van al store. Por qué la cola está
entre esos dos servicios, qué restricción obliga al retry, qué se equivoca un
recién llegado en su primer PR: eso no se deriva de nada, y es lo que el store
guarda.

```
.context/
├── index.md           entrada: qué es el repo, stack, mapa de directorios, entry points
├── architecture.md    componentes, flujos, dependencias externas, restricciones
├── conventions.md     patrones, comandos de test/lint/build, errores típicos
├── decisions.md       ADRs, append-only
├── config.json        {"watch": [...], "ignore": [...]}
└── state.json         {"last_sync": "<sha>"}
```

Todo committeado. Nada en `.gitignore`, nada en `.git/hooks`. Un clone o un
worktree tiene el store completo.

## Instalación

```
/plugin marketplace add Lu1sR/codigng-workflow
/plugin install contextly@codigng-workflow
```

Después, una vez por repo: `/contextly:init`.

## Comandos

| Comando | Hace |
|---|---|
| `/contextly:init` | Releva el repo y escribe el store |
| `/contextly:update` | Corrige los documentos por lo que cambió desde la última sincronización |
| `/contextly:decide` | Agrega un ADR |
| `/contextly:check` | Auditoría de solo lectura: rutas rotas más un pase de juicio |
| `/contextly:commit` | Commits limpios, y sincroniza el store en el mismo momento |

`/contextly:check` no tiene `Write` ni `Edit` en su frontmatter: la restricción
está impuesta, no pedida.

## El hook

Un solo hook, `SessionStart`. Inyecta un digest de unas pocas líneas: dónde
vive el contexto, si está fresco o STALE, qué directorios cambiaron desde el
último sync y qué rutas nombradas en el store ya no existen. Nunca el contenido
de los documentos: esos se leen a demanda.

```
Contextly: this repository's durable context lives in `.context/` (...).
Status: STALE, 6 watched file(s) changed since the last sync.
Changed since sync: src/api/ (4), migrations/ (2). Treat the sections covering
those areas as needing verification; the rest is current.
Run /contextly:update once the current task is done.
```

No hay hook de PostToolUse ni de Stop, ni git hook: los subagentes (por
ejemplo los de `software-factory`) no heredan nada de contextly, y ninguna
sesión se bloquea por bookkeeping. La deuda se ve en el siguiente arranque y se
paga con `/contextly:update` o `/contextly:commit`.

## Sin sesión

```bash
python3 <plugin>/scripts/contextly.py status   # freshness y archivos cambiados
python3 <plugin>/scripts/contextly.py check    # toda ruta nombrada debe existir
```

Ambos aceptan `--json` y salen con código distinto de cero ante un problema,
así que componen en CI.

## Con software-factory

- `factory-spec`, `factory-dev` y `factory-reviewer` leen `.context/` a través
  de `CLAUDE.md`, sin duplicar convenciones.
- Los subagentes no reciben SessionStart y contextly no registra otros hooks,
  así que una corrida de la factory no toca el checkout principal por
  contextly.
- Después de mergear una rama `factory/<run-id>`, corré `/contextly:update`.
- Mantené `architecture.md` al nivel de arquitectura y convenciones, no de
  cómo está implementada cada feature: QA lo lee vía `CLAUDE.md` y perdería
  parte de la caja negra.
