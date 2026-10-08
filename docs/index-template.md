# Template do estado do plano

> O estado de cada plano é o **`plans/plan-N/index.json`** — JSON válido, lido por máquina e
> **dono da verdade** do fluxo. Este arquivo deixou de ser o painel (era markdown, desatualizado).

A forma canônica do `index.json` (campos, `phases`, `subtasks`, `reviewRounds`, `artifacts`…) está
documentada em [`docs/fluxo-desenvolvimento-ia.md`](fluxo-desenvolvimento-ia.md) → seção
**"`index.json` — forma canônica"**.

Quem cria/atualiza: `/scope` cria o arquivo; cada fase seguinte faz **read-modify-write** só dos seus
campos; `/done` grava `status`/`closedAt`.
