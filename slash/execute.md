---
name: execute
description: Implementa a alteração escopada — cria a branch em cada repo, implementa código e testes conforme o plano, roda /code-review interno, commita, abre a PR, acompanha o CI até passar e move o card para code-review
---

# /execute — Execução

## Uso

```
/execute            # usa o plan ativo (mais recente)
/execute plan-3     # opcional: especifica o plan
```

É a **FASE 5** do fluxo (depois de `/card`). Implementa o que foi planejado (**código + testes**), passa pelo `/code-review` interno, abre a PR e só termina com o **CI verde** e o card em **code-review**.

---

## REGRA GLOBAL

- **Multi-repo:** todos os repositórios envolvidos usam o **mesmo card**, a **mesma branch** e o **mesmo título de commit e PR**.
- Implemente **exatamente o plano** (`plano-implementacao.md`) — código **e** os testes e2e/unit do escopo (só do novo).
- **Não abra a PR** antes do `/code-review` interno passar (must-change resolvidos).
- **Não conclua** antes do **CI verde**.
- `push` e abertura de PR são ações externas: **peça confirmação uma vez** antes de executá-las.
- Requer **`gh`** autenticado e **MCP do Jira** conectado.
- **Guard:** só roda se o `/card` estiver **concluído** no `index.md`.
- Se travar — CI quebrado sem causa clara, conflito, ambiguidade — **pare e pergunte**.

---

## Passo 1 — Plan ativo e leitura do plano

`MONOREPO` vem do `.claude/estrutura.md`. Determine `plan-N` (argumento ou o mais recente):

```bash
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
cat "$MONOREPO/plans/plan-$N/index.md"
cat "$MONOREPO/plans/plan-$N/plano-implementacao.md"
```

Extraia do `index.md`: **título**, **tipo** (fix/feat), **branch base** (main/qa), **branch de trabalho** (`BRANCH`, ex.: `fix/main/VENA-223`) e **id do card** (`CARD_ID`). Do plano, extraia os **repositórios envolvidos**.

Defina:
- `LABEL` = `MAIN`|`QA`
- `TITULO_COMMIT_PR` = `[<LABEL>] <tipo>(<CARD_ID>): <título>`
  - ex.: `[MAIN] fix(VENA-223): Otimização da esteira logística`

Registre o início:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_EXEC`.

---

## Passo 2 — Guard: `/card` concluído?

Na tabela **Progresso** do `index.md`, verifique `/card`.

- Se **não** estiver `✅ concluído`:
  ```
  ⚠️ O /card deste plano não está concluído.
  Rode /card antes de usar /execute.
  ```
  Interrompa aqui.

- Confirme `gh auth status` OK. Se não, oriente `gh auth login`.
- Se concluído, marque `/execute` como `🔄 em andamento` (Início = `INICIO_EXEC`) e siga.

---

## Passo 3 — Criar a branch em cada repositório (sub-agent)

Lance um **sub-agent** (Task tool) para, em **cada repositório envolvido**, a partir da branch base, criar a **mesma** branch de trabalho:

```bash
cd "<repo>"
git fetch origin --quiet
git checkout -b "<BRANCH>" "origin/<BRANCH_BASE>"
```

Se a branch já existir em algum repo, informe e pergunte (reusar / outro nome). Confirme que **todos** os repos estão na branch `<BRANCH>` antes de seguir.

---

## Passo 4 — Implementar (código + testes)

Seguindo `plano-implementacao.md`, implemente em cada repositório:
- as alterações de **código** dos passos de implementação;
- os **testes e2e/unit** do escopo (só do novo), com o stack definido no plan.

Não desvie do plano. Se surgir algo não previsto que exija decisão, **pare e pergunte**.

---

## Passo 5 — Commit (mesmo título em todos os repos)

Em cada repo com alterações, verifique arquivos sensíveis (`.env`, `*.key`, `*secret*`, etc.) e **bloqueie** se encontrar. Depois:

```bash
cd "<repo>"
git add .
git commit -m "<TITULO_COMMIT_PR>"
```

O **mesmo** `TITULO_COMMIT_PR` em todos os repositórios.

---

## Passo 6 — /code-review interno + ajustes (loop)

Lance um **sub-agent** (Task tool) para rodar o **/code-review** sobre o que foi feito (o diff de todos os repos). Ele retorna os achados classificados (**must-change**, **suggestions**, etc.).

- Ajuste **apenas** os **must-change** e as **suggestions fáceis** de resolver.
- Faça novo commit com os ajustes (mesmo título, ou um commit de ajuste, conforme fizer sentido).
- **Repita** (novo /code-review) até **todos os must-change resolvidos e as suggestions fáceis aplicadas**.

> As suggestions **não** fáceis podem ser deixadas de fora nesta rodada.

Só avance quando o review interno estiver limpo.

---

## Passo 7 — Push e abrir PR (confirmar uma vez)

Mostre o resumo e **peça confirmação** (ação externa):

```
Vou dar push e abrir a PR em cada repo:

  Branch:  <BRANCH>  (base <BRANCH_BASE>)
  Título:  <TITULO_COMMIT_PR>
  Repos:   api-vena-core, front-vena

Confirma push + PR? (sim / ajustar)
```

Ao confirmar, para **cada** repositório:

```bash
cd "<repo>"
git push -u origin "<BRANCH>"
gh pr create --base "<BRANCH_BASE>" --head "<BRANCH>" \
  --title "<TITULO_COMMIT_PR>" \
  --body "<descrição LEIGA do que foi feito>"
```

A **descrição da PR** deve explicar, em **linguagem leiga**, o que foi feito (sem jargão técnico). Guarde as URLs das PRs.

---

## Passo 8 — Acompanhar o CI até passar (loop)

Para cada PR, acompanhe os checks do CI (polling até concluir):

```bash
cd "<repo>"
gh pr checks "<BRANCH>" --watch
```

- Se **algum check falhar**: investigue (`gh run view --log-failed`), ajuste o código, commite e faça push. Volte a acompanhar.
- **Repita** até **todos os checks passarem** em todas as PRs → PR pronta para review.

---

## Passo 9 — Mover o card para code-review

Com o CI verde, mova o card no Jira para **code-review** (MCP do Jira, `transitionJiraIssue`). Se o board não tiver esse status, pergunte qual usar.

---

## Passo 10 — Atualizar o `index.md` e concluir

Registre o fim:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_EXEC`.

No `index.md` do plan:
- preencha **PR** com a(s) URL(s);
- marque a fase `/execute` como `✅ concluído` (Início = `INICIO_EXEC`, Fim = `FIM_EXEC`).

---

## Passo 11 — Resumo Final

```
✅ /execute concluído

  Plano:    plan-N — <título>
  Branch:   <BRANCH>
  Commit/PR: <TITULO_COMMIT_PR>
  PRs:      <urls>
  CI:       verde ✓
  Card:     <CARD_ID> → code-review
  Duração:  <INICIO_EXEC> → <FIM_EXEC>

Próximo passo: rode /create-test para gerar o guia de teste leigo.
(Se o reviewer deixar feedback na PR, use /resolve-reviewer.)
```
