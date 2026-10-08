---
name: card
description: Concentra toda a interação com o Jira — escolhe a organização/board, cria o card pai (título padronizado, descrição = plano de implementação), posta a spec como comentário, materializa as subtasks planejadas no blueprint, define status, atribui ao usuário, comenta o tempo do scope e vincula tudo ao index.json
---

# /card — Criação do Card no Jira

## Uso

```
/card            # usa o plan ativo (mais recente)
/card plan-3     # opcional: especifica o plan
```

É a **FASE 4** do fluxo (depois de `/blueprint`). **Concentra toda a interação com o Jira** via **MCP**: cria o card pai (descrição = plano de implementação), posta a spec como comentário, **materializa as subtasks** planejadas no `/blueprint` e vincula tudo ao `index.json`. O `/scope` e o `/blueprint` **não** tocam no Jira — só o `/card`.

---

## REGRA GLOBAL

- Esta fase **não implementa código**.
- **Achar antes de criar:** se o plano já tem um card no Jira (`jira` no `index.json`, ou o usuário informa um id), **vincule o existente** — não crie outro.
- **Nunca crie o card** sem antes mostrar título + descrição e ter os dados corretos (organização, tipo, branch).
- Assim que achar/criar o card, **salve na hora** `jira`, `jiraUrl` e `jiraSummary` no `index.json` (read-modify-write) — antes de qualquer enriquecimento.
- **Descrição do card pai = `plano-implementacao.md`; comentário no pai = `spec.md`.**
- **Subtasks:** o `/blueprint` já planejou em `index.json.subtasks`; aqui você **cria** cada uma como sub-task do card pai, define a descrição dela e grava `jira`/`jiraUrl` de volta no `index.json`. Se `subtasks` estiver **vazio**, não cria nenhuma (fica tudo no pai).
- **Guard:** só roda se o `/blueprint` estiver **concluído** no `index.json` (`phases["blueprint"].done`).
- Toda escrita no `index.json` é **read-modify-write**: leia o objeto inteiro, altere só o campo desta fase e regrave (Write, JSON válido). **Nunca** apague dado de outra fase.
- Requer o **MCP do Jira** conectado.
- Se travar — MCP indisponível, sem status compatível, ambiguidade — **pare e pergunte**.
- As chamadas ao Jira usam o **MCP do Jira** (ex.: `getVisibleJiraProjects`, `getJiraProjectIssueTypesMetadata`, `createJiraIssue`, `getTransitionsForJiraIssue`, `transitionJiraIssue`, `editJiraIssue`, `addCommentToJiraIssue`, `atlassianUserInfo`). Use o servidor de Jira conectado no ambiente.

---

## Passo 1 — Plan ativo e leitura do `index.json`

Descubra o `MONOREPO` pelo `.claude/estrutura.md` (campo **Caminho**).

Determine o `plan-N`: se o kanban passou `JARVIS_PLAN`, use-o; senão o argumento; senão o mais recente:

```bash
echo "${JARVIS_PLAN:-}"
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
cat "$MONOREPO/plans/plan-$N/index.json"
cat "$MONOREPO/plans/plan-$N/plano-implementacao.md"
cat "$MONOREPO/plans/plan-$N/spec.md"
```

Extraia do `index.json`: **título** (`title`), **tipo** (`type`), **branch base** (`base`), as **subtasks planejadas** (`subtasks`) e os horários de início/fim do `/scope` (`phases["scope"].startedAt` / `.finishedAt`). Guarde o conteúdo de `plano-implementacao.md` (vira a **descrição** do card pai) e de `spec.md` (vira **comentário** no card pai).

Registre o início desta fase:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_CARD`.

---

## Passo 2 — Guard: `/blueprint` concluído?

No `index.json`, verifique `phases["blueprint"].done`.

- Se **não** for `true`:
  ```
  ⚠️ O /blueprint deste plano não está concluído.
  Rode /blueprint antes de usar /card.
  ```
  Interrompa aqui.

- Se for `true`, faça **read-modify-write** no `index.json` marcando `phases["card"].startedAt = "<INICIO_CARD>"` (preservando o resto) e siga.

---

## Passo 3 — Guard: MCP do Jira conectado?

Valide que o MCP do Jira responde (ex.: chame `atlassianUserInfo` / `getAccessibleAtlassianResources`).

- Se **não** conectar:
  ```
  ⚠️ MCP do Jira não está conectado.
  Rode /setup (Passo 1) para conectar o Jira e tente novamente.
  ```
  Interrompa aqui.

- Guarde o `accountId` do usuário atual (será o assignee).

---

## Passo 4 — Listar organizações / boards e escolher

Liste os projetos/boards visíveis no Jira (ex.: `getAccessibleAtlassianResources` para os sites e `getVisibleJiraProjects` para os projetos).

Apresente as opções ao usuário como **seleção** (checkbox — use o "ask me"):

```
Em qual organização/board este planejamento vai entrar?
  [ ] VENA   (Vena Core)
  [ ] LOG    (Logística)
  [ ] ...
```

Aguarde a escolha. Guarde `ORG` (nome) e a chave do projeto/board (`PROJECT_KEY`, ex.: `VENA`).

---

## Passo 5 — Salvar a organização no `index.json`

No `index.json` do plan, faça **read-modify-write** preenchendo `org = "<ORG>"` (guarde também `orgKey = "<PROJECT_KEY>"`, preservando o resto).

---

## Passo 6 — Achar o card existente OU criar

Primeiro decida se o card **já existe**:
- Se o `index.json` já traz `jira` (ex.: numeração pré-atribuída, `VENA-1144`), **ou** o usuário informar um id → é um **card existente**.
- Senão → será **criado** um novo.

### Caso A — Card já existe (achar e vincular)

Busque o card no Jira (`getJiraIssue` com o id) e confirme:

```
Encontrei o card <CARD_ID>: "<summary retornado pelo Jira>". É esse mesmo? (sim / informe outro id)
```

Guarde `CARD_ID`, a URL e o **summary EXATO** retornado pelo Jira (`jiraSummary`). **Não crie outro card.**

### Caso B — Criar o card

Monte:

- **Título** (padrão): `[<LABEL>] <tipo>: <título>`
  - `LABEL` = `MAIN` ou `QA` (branch base em maiúsculo) · `tipo` = `fix`|`feat`
  - ex.: `[MAIN] fix: Otimização da esteira logística`
- **Descrição**: o conteúdo de `plano-implementacao.md` (todo o planejamento de implementação).

Mostre título + descrição e **confirme** antes de criar:

```
Vou criar no board <PROJECT_KEY>:

  Título:  [MAIN] fix: Otimização da esteira logística
  Descrição: (todo o plano de implementação)

Confirma a criação? (sim / ajustar)
```

Ao confirmar, crie via `createJiraIssue` (tipo de issue apropriado do projeto — consulte `getJiraProjectIssueTypesMetadata` se necessário). Guarde `CARD_ID`, a URL e o **summary** do card (`jiraSummary`).

### Salvar na hora (ambos os casos)

Assim que tiver o card (achado ou criado), faça **read-modify-write** no `index.json` já salvando (o resto do enriquecimento segue nos próximos passos):
- `jira = "<CARD_ID>"` · `jiraUrl = "<url>"` · `jiraSummary = "<summary do Jira>"`

---

## Passo 7 — Postar a spec como comentário no card pai

Poste o conteúdo de `spec.md` como **comentário** no card pai (`addCommentToJiraIssue` no `CARD_ID`). É a especificação do `/scope` anexada ao card.

Confirme que o comentário foi criado. (A descrição do card já é o `plano-implementacao.md`, definida no Passo 6.)

---

## Passo 8 — Materializar as subtasks no Jira (se houver)

Leia `subtasks` do `index.json` (planejadas pelo `/blueprint`).

- Se **vazio** (`subtasks: []`): **não crie nenhuma** — a alteração é simples e fica tudo no card pai. Pule para o Passo 9.
- Se houver itens, descubra o tipo de issue de **sub-task** do projeto (`getJiraProjectIssueTypesMetadata` — procure o tipo que exige `parent`, ex.: "Sub-task"/"Subtarefa"). Se o projeto **não tiver** sub-task, **pare e pergunte** como proceder (criar como tasks vinculadas ao pai ou deixar tudo no pai).

Para **cada** item de `subtasks`:
- **Idempotência:** se já tiver `jira` preenchido (re-rodando o `/card`), **pule** — não recrie.
- Crie a sub-task (`createJiraIssue` com `parent = CARD_ID` e o tipo de sub-task), com:
  - **Título:** `<title>` do item (opcionalmente prefixado com o `scope`, ex.: `[api-vena-core] <title>`).
  - **Descrição:** `<description>` do item (o que *aquela* subtask deve fazer).
- Atribua a sub-task ao usuário atual (`accountId` do Passo 3).
- **Salve na hora** no `index.json` (read-modify-write): no item correspondente de `subtasks`, grave `jira` e `jiraUrl` da sub-task criada — **sem** apagar o resto.

> O card **pai** carrega o plano completo (descrição) + a spec (comentário); cada **filho** carrega só o que ele deve fazer.

---

## Passo 9 — Definir o status (Desenvolvimento)

Consulte as transições/status disponíveis do card (`getTransitionsForJiraIssue`).

- Se existir **"Desenvolvimento"** (ou equivalente óbvio: "In Development", "Em desenvolvimento"), mova para ele (`transitionJiraIssue`).
- Se **não existir**, pergunte ao usuário:
  ```
  O board não tem o status "Desenvolvimento". Qual status devo usar?
    (liste os status disponíveis)
  ```
  Mova para o status informado.

---

## Passo 10 — Atribuir ao usuário e enriquecer o card

- **Atribua** o card ao usuário atual (`editJiraIssue` com o `accountId` do Passo 3).
- Preencha o card com o **máximo de informações** possível neste momento (labels/componentes relevantes, tipo, referência ao plan-N).

---

## Passo 11 — Comentar o tempo do scope

Calcule a duração do `/scope` (início → fim de `phases["scope"]` no `index.json`) e adicione como **comentário no card** (`addCommentToJiraIssue`):

```
Tempo de escopo (/scope): 2026-09-10 09:12 → 2026-09-10 10:05 (~53 min)
```

---

## Passo 12 — Vincular o card ao `index.json` e concluir

Registre o fim desta fase:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_CARD`.

No `index.json` do plan, faça **read-modify-write** (preservando o resto — `jira`/`jiraUrl`/`jiraSummary` foram salvos no Passo 6 e os `jira`/`jiraUrl` de cada subtask no Passo 8):
- `branch = "<tipo>/<base>/<CARD_ID>"` (ex.: `fix/main/VENA-223`)
- `phases["card"].done = true` · `phases["card"].startedAt = "<INICIO_CARD>"` · `phases["card"].finishedAt = "<FIM_CARD>"`

> Lembrete: **o kanban exibe o `jiraSummary`** quando há card. Ele tem que ser o nome real do card no Jira (Passo 6).

---

## Passo 13 — Resumo Final

```
✅ /card concluído

  Plano:    plan-N — <título>
  Card:     VENA-223  ·  <url>   (descrição = plano · spec como comentário)
  Subtasks: <n> criadas (ou nenhuma)
  Board:    <PROJECT_KEY> (<ORG>)
  Status:   Desenvolvimento
  Assignee: você
  Branch de trabalho: fix/main/VENA-223

Próximo passo: rode /execute para implementar e abrir a PR.
```
