# workflow-ui

Mod opcional que muestra en la sesión lo que hacen `software-factory` y `contextly`. Solo lee:
no escribe en tu repo, no bloquea ninguna llamada y no le pasa nada a los agentes. Los otros dos
plugins funcionan igual con o sin él.

| Qué ves | Cuándo |
|---|---|
| **Banda sobre el prompt** | Una corrida espera a una persona: `GATE 1` (aprobar el spec), `DEPLOY` (deploy manual de `dev_sha`), `GATE 2` (push / PR). Botones **Abrir panel** y **Ocultar**. Al llegar a la gate también aparece un aviso y una notificación del sistema. |
| **Panel `/factory`**, pestaña Corridas | Las últimas 5 corridas de `.factory/runs/`: estado, iteración, progreso spec → dev → qa → review → PR, rama y sha. Para la más reciente, cada criterio con su estado y su primera evidencia, el veredicto de QA y el de review, y el PR. |
| **Panel `/factory agents`**, pestaña Agentes | Cada subagente de la sesión con su rol, estado, duración y sus últimas llamadas. Los bloqueos de los guards de la factory (`guard-paths.sh`, `guard-bash.sh`) aparecen en rojo en el momento, con el motivo. |
| **Línea de estado** | `ctx: fresh` o `ctx: STALE (dirs)` y el estado de la corrida más reciente, por ejemplo `factory: testing 2/3`. |
| **Aviso al terminar** | Cuando ves terminar una corrida en la sesión: "corré `/contextly:update` cuando se mergee". |

Los botones de la banda no aprueban nada: aprobar sigue siendo tu respuesta escrita al
orquestador.

## Instalación

Requiere una versión de Claude Code con mods (hooks de función). Dentro de Claude Code:

```
/plugin install workflow-ui@codigng-workflow
```

Desarrollo local, sin pasar por el marketplace:

```bash
claude --plugin-dir ./plugins/workflow-ui
```

## De dónde saca los datos

- Corridas: `.factory/runs/<run-id>/run.json`, `verdict.json` y `review.md`, leídos cada 3 segundos.
- Contexto: `contextly.py status --json` cada 30 segundos, si el repo tiene `.context/index.md`.
  Usa la copia de este repo si existe y si no la del plugin instalado.
- Subagentes: los eventos de la sesión (`agent.spawn`, `tool.call`, `turn.complete`), que el mod
  observa sin cambiarlos.

## Verificar

```bash
claude plugin validate plugins/workflow-ui
claude plugin test plugins/workflow-ui
```
