---
name: card
description: Cria a tarefa no Jira a partir do plano de implementação — escolhe a organização/board, cria o card com título padronizado e descrição do plano, define status, atribui ao usuário, comenta o tempo do scope e vincula o id ao plan
---

# /card — Criação do Card no Jira

## Uso

```
/card            # usa o plan ativo (mais recente)
/card plan-3     # opcional: especifica o plan
```

É a **FASE 4** do fluxo (depois de `/blueprint`). Cria o card no Jira via **MCP**, preenchendo com o máximo de informações possível, e vincula o id do card ao plan.

---

## REGRA GLOBAL

- Esta fase **não implementa código**.
- **Nunca crie o card** sem antes mostrar título + descrição e ter os dados corretos (organização, tipo, branch).
- **Guard:** só roda se o `/blueprint` estiver **concluído** no `index.md`.
- Requer o **MCP do Jira** conectado.
- Se travar — MCP indisponível, sem status compatível, ambiguidade — **pare e pergunte**.
- As chamadas ao Jira usam o **MCP do Jira** (ex.: `getVisibleJiraProjects`, `getJiraProjectIssueTypesMetadata`, `createJiraIssue`, `getTransitionsForJiraIssue`, `transitionJiraIssue`, `editJiraIssue`, `addCommentToJiraIssue`, `atlassianUserInfo`). Use o servidor de Jira conectado no ambiente.

---

## Passo 1 — Plan ativo e leitura do `index.md`

Descubra o `MONOREPO` pelo `.claude/estrutura.md` (campo **Caminho**).

Determine o `plan-N` (argumento, ou o mais recente):

```bash
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
cat "$MONOREPO/plans/plan-$N/index.md"
cat "$MONOREPO/plans/plan-$N/plano-implementacao.md"
```

Extraia do `index.md`: **título**, **tipo** (fix/feat), **branch base** (main/qa) e os horários de **início/fim do /scope** (tabela Progresso).

Registre o início desta fase:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_CARD`.

---

## Passo 2 — Guard: `/blueprint` concluído?

Na tabela **Progresso** do `index.md`, verifique a linha `/blueprint`.

- Se **não** estiver `✅ concluído`:
  ```
  ⚠️ O /blueprint deste plano não está concluído.
  Rode /blueprint antes de usar /card.
  ```
  Interrompa aqui.

- Se concluído, marque `/card` como `🔄 em andamento` (Início = `INICIO_CARD`) e siga.

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

## Passo 5 — Salvar a organização no `index.md`

No `index.md` do plan, preencha o campo **Organização (Jira)** com `ORG` (e o `PROJECT_KEY` na observação, se quiser).

---

## Passo 6 — Montar e criar o card

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

Ao confirmar, crie via `createJiraIssue` (tipo de issue apropriado do projeto — consulte `getJiraProjectIssueTypesMetadata` se necessário). Guarde o **id do card** (ex.: `VENA-223`) e a URL.

---

## Passo 7 — Definir o status (Desenvolvimento)

Consulte as transições/status disponíveis do card (`getTransitionsForJiraIssue`).

- Se existir **"Desenvolvimento"** (ou equivalente óbvio: "In Development", "Em desenvolvimento"), mova para ele (`transitionJiraIssue`).
- Se **não existir**, pergunte ao usuário:
  ```
  O board não tem o status "Desenvolvimento". Qual status devo usar?
    (liste os status disponíveis)
  ```
  Mova para o status informado.

---

## Passo 8 — Atribuir ao usuário e enriquecer o card

- **Atribua** o card ao usuário atual (`editJiraIssue` com o `accountId` do Passo 3).
- Preencha o card com o **máximo de informações** possível neste momento (labels/componentes relevantes, tipo, referência ao plan-N).

---

## Passo 9 — Comentar o tempo do scope

Calcule a duração do `/scope` (início → fim, da tabela Progresso do `index.md`) e adicione como **comentário no card** (`addCommentToJiraIssue`):

```
Tempo de escopo (/scope): 2026-09-10 09:12 → 2026-09-10 10:05 (~53 min)
```

---

## Passo 10 — Vincular o card ao `index.md` e concluir

Registre o fim desta fase:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_CARD`.

No `index.md` do plan:
- preencha **Card** com o id + URL (ex.: `VENA-223 — <url>`);
- preencha **Branch de trabalho** com `<tipo>/<base>/<id-do-card>` (ex.: `fix/main/VENA-223`);
- marque a fase `/card` como `✅ concluído` (Início = `INICIO_CARD`, Fim = `FIM_CARD`).

---

## Passo 11 — Resumo Final

```
✅ /card concluído

  Plano:    plan-N — <título>
  Card:     VENA-223  ·  <url>
  Board:    <PROJECT_KEY> (<ORG>)
  Status:   Desenvolvimento
  Assignee: você
  Branch de trabalho: fix/main/VENA-223

Próximo passo: rode /execute para implementar e abrir a PR.
```
