# Fluxo de Desenvolvimento com IA — Índice

Doc-índice do fluxo de desenvolvimento que o jarvis instala como slash commands. Serve de **contexto
para o Claude**: dá o mapa do fluxo e aponta **onde** achar cada detalhe, sem precisar carregar tudo.

- **Detalhe executável de cada fase:** `slash/<nome>.md` (copiadas para `~/.claude/commands/` por `jarvis --setup`).
- **Estado de cada plano (dono da verdade):** `plans/plan-N/index.json`.
- **Config do ambiente (por monorepo):** `<MONOREPO>/.claude/estrutura.md` (criado pelo `/setup`).
- **Board visual do fluxo:** `jarvis --kanban` (uma coluna por fase, um card por `plan-N`).

---

## Fonte da verdade — `plans/plan-N/index.json`

**Tudo é atualizado no `index.json`.** É um JSON válido (sem comentários), lido por máquina (inclusive
pelo kanban). Cada fase faz **read-modify-write**: lê o objeto inteiro, altera só os seus campos e
regrava — **nunca** apaga dado de outra fase. O Jira é consequência do `index.json`, não o contrário.

- **Guard:** cada fase só roda se a anterior estiver com `phases.<fase>.done === true`.
- `/resolve-reviewer` não mexe em `phases` — só adiciona em `reviewRounds`.
- `/done` grava `status: "done"` + `closedAt`.

---

## Ordem das fases

Fluxo linear (cada fase checa a anterior no `index.json`) + 1 avulsa + 1 utilitário + 1 interno.

| # | Fase (skill) | O que faz | Lê | Produz | Jira |
|---|---|---|---|---|---|
| 1 | `/setup` | Verifica MCP do Jira e `gh`, identifica o monorepo, classifica pastas em API/front | — | `.claude/estrutura.md` | — |
| 2 | `/scope` | Sincroniza o worktree-base (main/qa) ao remote, mapeia front→API, tira todas as dúvidas, cria + revisa a spec (com cenários de teste) | `.claude/estrutura.md` | `spec.md`, `index.json` (criado) | — |
| 3 | `/blueprint` | Gera o plano técnico de implementação (+ testes a criar) e **planeja a decomposição em subtasks** (ver abaixo) | `spec.md`, repos | `plano-implementacao.md`, `index.json.subtasks` (planejadas) | — |
| 4 | `/card` | **Toda a interação com o Jira.** Cria o card pai, materializa subtasks, preenche descrições | `index.json`, `spec.md`, `plano-implementacao.md` | card + subtasks no Jira; ids no `index.json` | **cria tudo** |
| 5 | `/execute` | Cria o workspace (worktree + deps por repo), implementa código **e** testes, `/code-review` interno (se existir), abre PR (linguagem leiga), acompanha o CI | `index.json`, `plano-implementacao.md` | PR(s), workspace | move card → `code-review` |
| 6 | `/create-test` | Guia de teste leigo (pt-BR) **+ roteiro estruturado** (fonte da Fase 7) | `index.json`, `spec.md`, plano | `guia-de-teste.md` | comenta o guia no card |
| 7 | `/execute-test` | Sobe a app local (qa), executa o roteiro, captura evidências redigidas | `index.json`, `guia-de-teste.md` | `evidencias/` | comenta o resultado no card |
| — | `/done` | Encerra o plano | `index.json` | `status:done`/`closedAt` | (opcional) move o card ao status final |
| avulso | `/resolve-reviewer` | Resolve feedback do reviewer na PR, garante CI verde, devolve para review | PR, `index.json` | commit/push | responde na PR e re-solicita review |
| util | `/worktree` | Lista e remove com segurança os workspaces por plano | `.worktrees/plan-N` | — | — |
| interno | `/code-review` | Revisa uma PR com agentes em paralelo e comenta | PR | — | comenta na PR |

---

## O Jira é todo no `/card` (Fase 4)

O `/card` roda **depois** do `/blueprint`, então tem a spec e o plano em mãos. Ele concentra **toda**
a escrita no Jira (scope e blueprint **não** tocam no Jira — só geram artefatos + `index.json`):

1. **Cria o card pai** — título `[<LABEL>] <tipo>: <título>` (ex.: `[MAIN] fix: Otimização da esteira`).
2. **Descrição do pai = `plano-implementacao.md`** (o plano completo).
3. **Comentário no pai = `spec.md`** (a especificação do `/scope`).
4. **Subtasks** (ver regra abaixo) — cada uma com a descrição do que *aquela* subtask deve fazer.
5. **Grava no `index.json`**: `jira`/`jiraUrl`/`jiraSummary` do pai e os ids/urls de cada subtask.
6. Status (`Desenvolvimento`), assignee (usuário atual), comentário com o tempo do `/scope`.

### Regra de subtasks — "só quando faz sentido"

Quem **planeja** a decomposição é o `/blueprint` (conhece repos/áreas); quem **materializa** no Jira é o `/card`.

- **1 subtask por repositório** alterado quando a mudança é multi-repo.
- Se **um único repo** muda mas em **várias áreas/módulos** separáveis, divide em subtasks **por área**.
- Alteração **simples num único ponto** → **sem subtask**: fica tudo no card pai (`subtasks: []`).

O `/blueprint` escreve as subtasks planejadas em `index.json.subtasks` (com `jira: null`); o `/card`
cria cada uma no Jira e preenche de volta o `jira`/`jiraUrl`.

---

## `index.json` — forma canônica

```json
{
  "title": "<título>",
  "type": "<fix|feat>",
  "base": "<main|qa>",
  "repos": ["<repos envolvidos>"],
  "org": null,
  "orgKey": null,
  "jira": null,
  "jiraUrl": null,
  "jiraSummary": null,
  "branch": null,
  "pr": null,
  "stack": { "unit": "<stack unit>", "e2e": "<stack e2e>" },
  "scenarios": { "e2e": ["<cenário e2e>"], "unit": ["<cenário unit>"] },
  "subtasks": [
    { "scope": "<repo ou área>", "title": "<título da subtask>", "description": "<o que fazer>", "jira": null, "jiraUrl": null }
  ],
  "phases": {
    "scope":        { "done": false, "startedAt": null, "finishedAt": null },
    "blueprint":    { "done": false, "startedAt": null, "finishedAt": null },
    "card":         { "done": false, "startedAt": null, "finishedAt": null },
    "execute":      { "done": false, "startedAt": null, "finishedAt": null },
    "create-test":  { "done": false, "startedAt": null, "finishedAt": null },
    "execute-test": { "done": false, "startedAt": null, "finishedAt": null }
  },
  "reviewRounds": [],
  "artifacts": { "spec": "spec.md", "blueprint": null, "testGuide": null, "evidence": null },
  "workspace": { "root": null, "worktrees": [] },
  "status": null,
  "closedAt": null
}
```

- Chaves de `phases` são **fixas** — cada fase só altera `done`/`startedAt`/`finishedAt` da sua.
- `subtasks`: criado/planejado pelo `/blueprint`; `jira`/`jiraUrl` preenchidos pelo `/card`.
- `/execute-test` usa escrita atômica (tmp+rename) por causa das worktrees paralelas.

---

## Artefatos por plano (`plans/plan-N/`)

| Arquivo | Criado por | Conteúdo |
|---|---|---|
| `index.json` | `/scope` | estado estruturado (dono da verdade) |
| `spec.md` | `/scope` | especificação aprovada + revisada |
| `plano-implementacao.md` | `/blueprint` | plano técnico + testes + decomposição em subtasks |
| `guia-de-teste.md` | `/create-test` | guia leigo (pt-BR) + roteiro estruturado |
| `evidencias/` | `/execute-test` | prints antes/depois + `evidencias.md` redigido |

---

## Regras transversais

- **Isolamento por `git worktree`:** `/scope` lê de um **worktree-base** do alvo
  (`.worktrees/base/<qa|main>`, sempre alinhado ao remote, nunca toca a cópia primária);
  `/execute` trabalha num **workspace por plano** (`.worktrees/plan-N`, um worktree por repo) —
  permite vários planos em paralelo sem colisão.
- **No sync, a verdade é o remote.**
- **Multi-repo:** todos os repos usam o **mesmo card/branch/título** de commit e PR.
- **Segredos:** nunca ecoar `.env` no transcript; redigir antes de gravar/postar (ver `/execute-test`).
- **Travou (erro, ambiguidade, comando indisponível)?** Pare e pergunte.
