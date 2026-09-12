---
name: resolve-reviewer
description: Resolve o feedback deixado por um reviewer numa PR — sincroniza a branch com o remote, entende o pedido, resolve com o usuário, roda /code-review, garante o CI verde, responde na PR, marca para review de novo e registra a rodada no index.md
---

# /resolve-reviewer — Resolver Feedback do Reviewer

## Uso

```
/resolve-reviewer
/resolve-reviewer https://github.com/kruzer-corp/api-vena-core/pull/162
```

É uma **fase avulsa** (sob demanda), acionada **sempre que um reviewer responde/comenta uma PR**. Resolve o que foi pedido e devolve a PR para review, registrando a rodada no painel do plan.

---

## REGRA GLOBAL

- No sync, **a verdade é o remote**: a branch local fica **igual ao remote** antes de qualquer mudança.
- Resolva o pedido **junto com o usuário** — não invente o que o reviewer quis dizer.
- **Não marque a PR para review de novo** antes do **CI verde**.
- Requer **`gh`** autenticado.
- **Nunca sobrescreva** o histórico de rodadas no `index.md` — sempre **adicione** uma linha.
- Se travar — link inválido, PR não encontrada, pedido ambíguo — **pare e pergunte**.

---

## Passo 1 — Receber o link da PR

Se o link não veio como argumento, peça e **aguarde**:

```
Envie o link da PR que recebeu review.
(ex: https://github.com/kruzer-corp/api-vena-core/pull/162)
```

Leia os dados da PR:

```bash
gh pr view "<URL>" --json number,url,headRefName,baseRefName,isDraft,headRepository,reviewRequests,latestReviews,comments
```

Extraia: `BRANCH` (headRefName), o **repositório** (owner/repo) e o número da PR.

---

## Passo 2 — Localizar o plan/workspace e sincronizar com o remote

`MONOREPO` vem do `.claude/estrutura.md`. Encontre o **plan** correspondente (pela branch / id do card):

```bash
CARD_ID="${BRANCH##*/}"    # última parte da branch, ex: VENA-223
grep -rl "$CARD_ID" "$MONOREPO"/plans/*/index.md 2>/dev/null
```

Guarde `plan-N` e leia no `index.md` o **Workspace** do plano (`$WORKSPACE = $MONOREPO/.worktrees/plan-N`). O `/execute` trabalha em **worktrees por plano**, então o código da PR está em `$WORKSPACE/<repo>`, **não** na cópia principal.

Determine o diretório de trabalho da PR (`REPO_DIR`):

```bash
REPO="<nome-da-pasta-do-repo-da-PR>"     # ex.: api-vena-core
REPO_DIR="$WORKSPACE/$REPO"
```

- Se `$REPO_DIR` **existir**, use-o.
- Se **não existir** (workspace já limpo, ou plano antigo pré-worktrees): **recrie o worktree** a partir do branch remoto —
  ```bash
  mkdir -p "$WORKSPACE"
  git -C "$MONOREPO/$REPO" fetch origin --quiet
  git -C "$MONOREPO/$REPO" worktree add "$REPO_DIR" "<BRANCH>"
  ```
  Copie os ignorados necessários (`.env*`) da cópia principal e instale as deps (como no Passo 3 do `/execute`).

No worktree da PR, deixe a branch **igual ao remote**:

```bash
cd "$REPO_DIR"
git fetch origin --prune
git checkout "<BRANCH>"
git reset --hard "origin/<BRANCH>"
git pull --ff-only origin "<BRANCH>"
```

---

## Passo 3 — Entender a última mensagem do reviewer

Leia os comentários/reviews mais recentes:

```bash
gh pr view "<URL>" --comments
```

Identifique **a última mensagem deixada pelo reviewer** e resuma, com suas palavras, o que está sendo pedido. Se houver mais de um ponto, liste todos.

---

## Passo 4 — Resolver com o usuário

Apresente o entendimento do pedido e **trabalhe com o usuário** para resolver:

```
O reviewer pediu:
  1. <ponto 1>
  2. <ponto 2>

Vou resolver assim: <proposta>. Concorda / quer ajustar?
```

Implemente as mudanças acordadas. Se algo do pedido não estiver claro, **pergunte** (não assuma).

---

## Passo 5 — Commit

Verifique arquivos sensíveis e commite as alterações:

```bash
cd "$REPO_DIR"
git add .
git commit -m "fix: [<LABEL>] ajustes do review (<CARD_ID>)"
```

---

## Passo 6 — /code-review + resolver bloqueantes (loop)

**Só roda se o `/code-review` existir** neste ambiente (mesma checagem do Passo 6 do `/execute`: `.claude/commands/`, `~/.claude/commands/`, plugins, ou skill na sessão). Se **não existir**, avise (`ℹ️ /code-review não encontrado — pulando`) e siga para o Passo 7.

Se existir, lance um **sub-agent** (Task tool) para rodar o **/code-review** novamente sobre o diff.

- Resolva os **problemas bloqueantes** apontados.
- Commit dos ajustes.
- **Repita** até não restar bloqueante.

---

## Passo 7 — Push

```bash
cd "$REPO_DIR"
git push origin "<BRANCH>"
```

---

## Passo 8 — Acompanhar o CI até passar (loop)

```bash
cd "$REPO_DIR"
gh pr checks "<BRANCH>" --watch
```

- Se falhar: investigue (`gh run view --log-failed`), ajuste, commite e push. Volte a acompanhar.
- **Repita** até **todos os checks passarem**.

---

## Passo 9 — Responder na PR

Poste um comentário na PR explicando, de forma objetiva, **o que foi feito** para atender o review:

```bash
gh pr comment "<URL>" --body "<resumo do que foi resolvido, ponto a ponto>"
```

---

## Passo 10 — Marcar a PR para review novamente

- Se a PR estiver como **draft**, marque como pronta: `gh pr ready "<URL>"`.
- **Re-solicite o review** do(s) reviewer(s) que comentaram:

```bash
gh api --method POST "repos/<owner>/<repo>/pulls/<number>/requested_reviewers" \
  -f "reviewers[]=<login-do-reviewer>"
```

---

## Passo 11 — Registrar a rodada no `index.md`

Descubra o número desta rodada (conte as linhas já existentes na tabela **Rodadas de review**) e **adicione** uma nova linha (nunca sobrescreva):

```bash
date '+%Y-%m-%d %H:%M'
```

Nova linha, ex.:

```
| 3 | 2026-09-12 09:15 | Ajuste no tratamento de erro do /esteira + teste faltante |
```

> `/resolve-reviewer` **não** altera a tabela **Progresso** — só adiciona em **Rodadas de review**.

---

## Passo 12 — Resumo Final

```
✅ /resolve-reviewer concluído

  PR:       <URL>
  Plano:    plan-N — <título>
  Rodada:   #<n> registrada no index.md
  CI:       verde ✓
  PR:       respondida e marcada para review novamente

Aguardando o próximo retorno do reviewer (se houver).
```
