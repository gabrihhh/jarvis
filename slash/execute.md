---
name: execute
description: Implementa a alteração escopada — cria a branch em cada repo, implementa código e testes conforme o plano, roda /code-review interno (se existir), commita, abre a PR, acompanha o CI até passar e move o card para code-review
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
- **Isolamento por plano (worktrees):** cada plano trabalha em seu **próprio workspace** — um `git worktree` por repo em `MONOREPO/.worktrees/plan-N/<repo>`. Isso permite **vários planos em paralelo** no mesmo monorepo sem colisão. A **cópia principal** de cada repo (`MONOREPO/<repo>`) **nunca** é usada pra editar: fica sempre no branch base, livre pros outros planos. **A partir do Passo 3, `<repo>` sempre se refere ao worktree do plano** (`$WORKSPACE/<repo>`), nunca à cópia principal.
- Implemente **exatamente o plano** (`plano-implementacao.md`) — código **e** os testes e2e/unit do escopo (só do novo).
- **Não abra a PR** antes do `/code-review` interno passar (must-change resolvidos) — **quando o `/code-review` existir**. Se não existir no ambiente, esse passo é **pulado** (ver Passo 6).
- **Não conclua** antes do **CI verde**.
- `push` e abertura de PR são ações externas: **peça confirmação uma vez** antes de executá-las.
- Requer **`gh`** autenticado e **MCP do Jira** conectado.
- **Guard:** só roda se o `/card` estiver **concluído** no `index.json` (`phases["card"].done`).
- Toda escrita no `index.json` é **read-modify-write**: leia o objeto inteiro, altere só o campo desta fase e regrave (Write, JSON válido). **Nunca** apague dado de outra fase.
- Se travar — CI quebrado sem causa clara, conflito, ambiguidade — **pare e pergunte**.

---

## Passo 1 — Plan ativo e leitura do plano

`MONOREPO` vem do `.claude/estrutura.md`. Determine `plan-N`: se o kanban passou `JARVIS_PLAN`, use-o; senão o argumento; senão o mais recente:

```bash
echo "${JARVIS_PLAN:-}"
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
cat "$MONOREPO/plans/plan-$N/index.json"
cat "$MONOREPO/plans/plan-$N/plano-implementacao.md"
```

Extraia do `index.json`: **título** (`title`), **tipo** (`type`), **branch base** (`base`), **branch de trabalho** (`branch`, ex.: `fix/main/VENA-223`) e **id do card** (`jira` → `CARD_ID`). Do plano, extraia os **repositórios envolvidos**.

Defina:
- `LABEL` = `MAIN`|`QA`
- `TITULO_COMMIT_PR` = `[<LABEL>] <tipo>(<CARD_ID>): <título>`
  - ex.: `[MAIN] fix(VENA-223): Otimização da esteira logística`
- `WORKSPACE` = `$MONOREPO/.worktrees/plan-$N` — a **raiz do workspace** deste plano (criada no Passo 3). Cada repo envolvido fica em `$WORKSPACE/<repo>`.

Registre o início:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_EXEC`.

---

## Passo 2 — Guard: `/card` concluído?

No `index.json`, verifique `phases["card"].done`.

- Se **não** for `true`:
  ```
  ⚠️ O /card deste plano não está concluído.
  Rode /card antes de usar /execute.
  ```
  Interrompa aqui.

- Confirme `gh auth status` OK. Se não, oriente `gh auth login`.
- Se for `true`, faça **read-modify-write** no `index.json` marcando `phases["execute"].startedAt = "<INICIO_EXEC>"` (preservando o resto) e siga.

---

## Passo 3 — Criar o workspace do plano (worktrees + deps) (sub-agent)

O plano trabalha num **workspace isolado** (`$WORKSPACE = $MONOREPO/.worktrees/plan-$N`), com **um `git worktree` por repo envolvido** no branch `<BRANCH>`. Isso deixa a cópia principal livre e permite **rodar vários planos ao mesmo tempo**.

Lance um **sub-agent** (Task tool) para, em **cada repositório envolvido**, fazer:

```bash
mkdir -p "$WORKSPACE"
git -C "$MONOREPO/<repo>" fetch origin --quiet

# cria o worktree no branch de trabalho, a partir da base
git -C "$MONOREPO/<repo>" worktree add "$WORKSPACE/<repo>" -b "<BRANCH>" "origin/<BRANCH_BASE>"
```

Casos especiais:
- **Worktree já existe** (`$WORKSPACE/<repo>` presente, ex.: re-rodando `/execute` no mesmo plano): **reutilize** — informe e não recrie.
- **Branch já existe** (local ou remoto): crie o worktree **sem `-b`** (`git -C "$MONOREPO/<repo>" worktree add "$WORKSPACE/<repo>" "<BRANCH>"`) ou pergunte (reusar / outro nome).
- Se a cópia principal estiver **na** `<BRANCH>` (fluxo antigo), o `worktree add` falha — avise e peça pra voltar a cópia principal pra base.

**Copiar arquivos ignorados necessários** (worktree não traz `.env` nem ignorados). Da cópia principal pro worktree, sem sobrescrever:

```bash
# .env e variantes (ajuste a lista se o repo usar outros arquivos ignorados)
for f in "$MONOREPO/<repo>"/.env "$MONOREPO/<repo>"/.env.*; do
  [ -e "$f" ] && cp -n "$f" "$WORKSPACE/<repo>/" 2>/dev/null || true
done
```

**Auto-install das dependências** no worktree (detecta o gerenciador pelo lockfile):

```bash
cd "$WORKSPACE/<repo>"
if   [ -f pnpm-lock.yaml ];    then pnpm install --frozen-lockfile
elif [ -f yarn.lock ];         then yarn install --frozen-lockfile
elif [ -f package-lock.json ]; then npm ci
elif [ -f package.json ];      then npm install
fi
```

> Repos sem `package.json` (libs de outra stack) não instalam nada — apenas o worktree é criado.

Confirme que **todos** os repos envolvidos têm worktree em `$WORKSPACE/<repo>` no branch `<BRANCH>` antes de seguir. **A partir daqui, `<repo>` = `$WORKSPACE/<repo>`.**

---

## Passo 4 — Implementar (código + testes)

Seguindo `plano-implementacao.md`, implemente em cada repositório:
- as alterações de **código** dos passos de implementação;
- os **testes e2e/unit** do escopo (só do novo), com o stack definido no plan.

Não desvie do plano. Se surgir algo não previsto que exija decisão, **pare e pergunte**.

---

## Passo 5 — Commit (mesmo título em todos os repos)

Em cada repo com alterações, adicione e verifique o que ficou **staged** — bloqueie se algum arquivo sensível (`.env`, `*.key`, `*secret*`, etc.) estiver prestes a ser commitado (o `.env` copiado no Passo 3 é ignorado pelo git, então não deve aparecer aqui; se aparecer, **bloqueie**):

```bash
cd "$WORKSPACE/<repo>"
git add .
git diff --cached --name-only | grep -Ei '(^|/)\.env|\.key$|secret' && echo "⚠️ arquivo sensível staged — bloquear" || true
git commit -m "<TITULO_COMMIT_PR>"
```

O **mesmo** `TITULO_COMMIT_PR` em todos os repositórios.

---

## Passo 6 — /code-review interno + ajustes (loop)

**Primeiro, verifique se o `/code-review` existe neste ambiente.** Ele pode estar em qualquer um destes locais:

```bash
ls "$MONOREPO/.claude/commands/code-review.md" \
   ~/.claude/commands/code-review.md \
   ~/.claude/plugins/marketplaces/*/**/skills/*/code-review* 2>/dev/null
```

Também vale como "existe" um skill/plugin de code-review disponível na sessão (ex.: `code-review:code-review`).

- Se **não existir** em nenhum lugar: **pule este passo inteiro**. Avise e siga direto para o Passo 7:
  ```
  ℹ️ /code-review não encontrado no ambiente — pulando o review interno.
  ```
  Registre no `index.json` (read-modify-write) `codeReviewInternal = "pulado-ausente"`. **Não** bloqueie o fluxo por isso.

- Se **existir**, siga o loop abaixo.

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
cd "$WORKSPACE/<repo>"
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
cd "$WORKSPACE/<repo>"
gh pr checks "<BRANCH>" --watch
```

- Se **algum check falhar**: investigue (`gh run view --log-failed`), ajuste o código, commite e faça push. Volte a acompanhar.
- **Repita** até **todos os checks passarem** em todas as PRs → PR pronta para review.

---

## Passo 9 — Mover o card para code-review

Com o CI verde, mova o card no Jira para **code-review** (MCP do Jira, `transitionJiraIssue`). Se o board não tiver esse status, pergunte qual usar.

---

## Passo 10 — Atualizar o `index.json` e concluir

Registre o fim:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_EXEC`.

No `index.json` do plan, faça **read-modify-write** (preservando o resto):
- `workspace.root = "<WORKSPACE>"` · `workspace.worktrees = [<repos envolvidos>]`
- `pr = [<url(s) da(s) PR(s)>]`
- `phases["execute"].done = true` · `phases["execute"].startedAt = "<INICIO_EXEC>"` · `phases["execute"].finishedAt = "<FIM_EXEC>"`

---

## Passo 11 — Resumo Final

```
✅ /execute concluído

  Plano:    plan-N — <título>
  Workspace: <WORKSPACE>
  Branch:   <BRANCH>
  Commit/PR: <TITULO_COMMIT_PR>
  PRs:      <urls>
  CI:       verde ✓
  Card:     <CARD_ID> → code-review
  Duração:  <INICIO_EXEC> → <FIM_EXEC>

Próximo passo: rode /create-test para gerar o guia de teste leigo.
(Se o reviewer deixar feedback na PR, use /resolve-reviewer.)
(Quando o plano fechar, rode /worktree clean plan-N para remover o workspace.)
```
