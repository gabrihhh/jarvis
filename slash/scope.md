---
name: scope
description: Define o escopo de uma alteração — sincroniza a branch (main/qa), entende o fluxo real front→API, tira todas as dúvidas, cria e revisa a especificação e salva em plans/plan-N com o index.json (estado estruturado do progresso)
---

# /scope — Escopo da Alteração

## Uso

```
/scope
```

Sem argumentos. É a **FASE 2** do fluxo (depois de `/setup`). Entende a fundo o que precisa ser feito e produz uma especificação aprovada + revisada, salva em `plans/plan-N/`.

---

## REGRA GLOBAL

- Esta fase **não implementa código** — só entende, decide e especifica.
- **Nunca toca na cópia primária** (`MONOREPO/<repo>`) nem no trabalho de outros planos. O `/scope` lê o código de um **worktree-base dedicado** do alvo (`main` ou `qa`), em `MONOREPO/.worktrees/base/<base>/<repo>`.
- No sync, **a verdade é o remote**: o worktree-base é sempre alinhado a `origin/<base>` (é um checkout só do `/scope`, ninguém edita nele — por isso não há risco de perder trabalho seu).
- **Sem limite de perguntas**: só avance quando tiver **100% de certeza** do que o usuário quer.
- Nada é salvo em `plans/` antes da spec estar **aprovada** e com **todos os gaps fechados**.
- Se travar — erro, ambiguidade, comando indisponível — **pare e pergunte**.

---

## Passo 1 — Guard: validar o `.claude` (pré-requisito /setup)

Registre o horário de início do scope:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_SCOPE`.

Valide o arquivo canônico criado pelo `/setup`:

```bash
test -f ./.claude/estrutura.md && echo "OK" || echo "FALTA"
cat ./.claude/estrutura.md 2>/dev/null
```

O arquivo precisa conter: **Caminho** do monorepo, **Pasta de frontend** e a **tabela de classificação** (api/front/outro).

- Se **faltar ou estiver incompleto**, encerre:
  ```
  ⚠️ O .claude/estrutura.md não está configurado corretamente.
  Rode /setup antes de usar /scope.
  ```
  Interrompa aqui.

- Se **OK**, extraia dessa base: `MONOREPO` (Caminho), `FRONTEND` e a classificação `api`/`front`/`outro` de cada pasta.

---

## Passo 2 — Branch: main ou qa?

Pergunte:

```
As alterações desta rodada vão para qual branch base?
  [1] main
  [2] qa
```

Guarde `BRANCH_BASE` (`main`|`qa`) e `LABEL` (`MAIN`|`QA`).

---

## Passo 3 — Preparar/atualizar o worktree-base do alvo (qa/main)

O `/scope` lê o código a partir de um **worktree-base permanente** do alvo escolhido — `MONOREPO/.worktrees/base/<BRANCH_BASE>/<repo>` — sempre alinhado a `origin/<BRANCH_BASE>`. A **cópia primária não é tocada** e os worktrees dos outros planos não são afetados, então dá pra escopar `main` e `qa` de forma independente.

Defina a raiz do base e liste os repos git de primeiro nível:

```bash
BASE="$MONOREPO/.worktrees/base/<BRANCH_BASE>"
mkdir -p "$BASE"
for d in "$MONOREPO"/*/; do
  test -d "$d/.git" && basename "$d"
done
```

Lance um **sub-agent** (Task tool) para, em **cada repo**, criar (se ainda não existir) e **atualizar** o worktree-base — a verdade é o remote:

```bash
PRIMARY="$MONOREPO/<repo>"
BASE_REPO="$BASE/<repo>"
git -C "$PRIMARY" fetch origin --prune --quiet

if [ -e "$BASE_REPO/.git" ]; then
  # já existe → apenas alinhar ao remote (checkout dedicado, nada do usuário vive aqui)
  git -C "$BASE_REPO" reset --hard "origin/<BRANCH_BASE>"
  git -C "$BASE_REPO" clean -fd
else
  # criar. Se a cópia primária estiver NA base branch, ela impede o worktree — destaque-a (sem perda: só move o HEAD)
  [ "$(git -C "$PRIMARY" symbolic-ref --quiet --short HEAD 2>/dev/null)" = "<BRANCH_BASE>" ] \
    && git -C "$PRIMARY" checkout --detach --quiet
  git -C "$PRIMARY" worktree add -B "<BRANCH_BASE>" "$BASE_REPO" "origin/<BRANCH_BASE>"
fi
```

> O worktree-base é **só de leitura** para o `/scope` (mapear o fluxo) — **não** precisa de `npm install`.

O sub-agent retorna o status final de cada `BASE_REPO`. Confirme que todos estão em `origin/<BRANCH_BASE>` atualizados antes de seguir. **A partir daqui, leia o código dos repos em `$BASE/<repo>`.**

---

## Passo 4 — Qual alteração desta rodada?

Pergunte:

```
Qual alteração você quer implementar nesta rodada?
(descreva o problema a resolver ou a funcionalidade a criar)
```

Guarde a descrição inicial.

---

## Passo 5 — É fix ou feat?

Pergunte e guarde `TIPO` (`fix`|`feat`):

```
Essa alteração é:
  [1] fix   — correção de bug / ajuste
  [2] feat  — nova funcionalidade / melhoria
```

---

## Passo 6 — Mapear o fluxo real (front → API)

Usando a classificação do `.claude/estrutura.md`, entre pela **pasta de frontend** (no worktree-base: `$BASE/<FRONTEND>`) e siga o fluxo até a **API** (`$BASE/<repo-api>`) para entender exatamente onde a alteração acontece:

- No `$BASE/<FRONTEND>`, localize a tela/componente/serviço relacionado à descrição do usuário.
- Siga as chamadas HTTP até o(s) repo(s) de **api** e mapeie o endpoint/serviço/entidade envolvidos.
- Anote os arquivos e camadas que provavelmente serão tocados (só para entendimento — não altere nada).

---

## Passo 7 — Stack de teste (detectar + confirmar)

Detecte o stack de teste nos repositórios envolvidos:

```bash
cat "$BASE/<repo>/package.json" 2>/dev/null | grep -E '"(jest|vitest|mocha|@playwright/test|cypress|karma|jasmine)"'
```

Pistas: `jest`/`vitest`/`mocha` (unit) · `@playwright/test`/`cypress` (e2e) · `karma`+`jasmine` (Angular unit).

Proponha e **confirme com o usuário**:

```
Stack de teste detectado:
  unit: Jest
  e2e:  Playwright

Uso esse para os testes desta alteração? (confirme ou ajuste)
```

Guarde `STACK_UNIT` e `STACK_E2E`.

---

## Passo 8 — Tirar TODAS as dúvidas (loop, sem limite)

Faça ao usuário quantas perguntas forem necessárias (use o "ask me") até entender **sem nenhuma dúvida**:
- como funciona hoje × como o usuário quer que funcione;
- regras de negócio, edge cases, o que está fora do escopo;
- comportamento esperado em erro.

**Repita** enquanto restar qualquer dúvida. Só avance ao ter **100% de certeza**. Se ainda houver incerteza, volte a perguntar.

---

## Passo 9 — Criar a especificação

Monte a especificação (ainda **sem salvar em disco**) com, no mínimo:

- **Título** curto baseado no escopo (vira o título do card depois).
- **Objetivo** (o quê e por quê).
- **Como funciona hoje** × **Como deve funcionar**.
- **Áreas afetadas**: fluxo front → API, arquivos/camadas prováveis.
- **Regras de negócio e edge cases**.
- **Critérios de aceite**.
- **Cenários de teste** (apenas do escopo **novo**, nada de pré-existente):
  - `e2e:` … (com `STACK_E2E`)
  - `unit:` … (com `STACK_UNIT`)

---

## Passo 10 — Mostrar e aprovar (loop)

Mostre a especificação inteira em tela e pergunte:

```
Essa especificação está aprovada? (sim / ou me diga o que ajustar)
```

- Se **não aprovada**: ajuste conforme o pedido e mostre de novo. Repita até aprovar.
- Se **aprovada**: siga.

---

## Passo 11 — Review por sub-agent + fechar gaps (loop)

Lance um **sub-agent** (Task tool) para revisar a especificação aprovada, focando em:
- **problemas de segurança**;
- **falhas / gaps de implementação** (o que ficou ambíguo ou faltando para implementar sem dúvida).

O sub-agent retorna uma lista de problemas/perguntas. Para cada gap:
- traga a pergunta ao usuário;
- ajuste a especificação com a resposta.

**Repita** (novo review, se necessário) até **todos os gaps estarem fechados**. Só então a spec está pronta.

---

## Passo 12 — Salvar em `plans/plan-N/`

Determine o próximo número sequencial de plan:

```bash
mkdir -p "$MONOREPO/plans"
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
```

`N` = maior encontrado + 1 (se não houver nenhum, `N = 1`). Crie a pasta e salve a spec:

```bash
mkdir -p "$MONOREPO/plans/plan-$N"
```

Grave a especificação em `"$MONOREPO/plans/plan-$N/spec.md"`.

---

## Passo 13 — Criar o `index.json` (estado estruturado do progresso)

Registre o horário de fim:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_SCOPE`.

Crie `"$MONOREPO/plans/plan-$N/index.json"` — a **fonte de verdade estruturada** do plano, marcando **`phases.scope.done = true`**. Este arquivo é lido por máquina (inclusive pelo kanban), então **é JSON válido, sem comentários**. Use a ferramenta Write (não heredoc de shell) para gravá-lo.

Preencha exatamente com o que você já sabe do scope; deixe `null` o que ainda não existe (será preenchido pelas fases seguintes):

```json
{
  "title": "<título>",
  "type": "<fix|feat>",
  "base": "<main|qa>",
  "repos": ["<repos envolvidos>"],
  "org": null,
  "jira": null,
  "branch": null,
  "pr": null,
  "stack": { "unit": "<STACK_UNIT>", "e2e": "<STACK_E2E>" },
  "scenarios": { "e2e": ["<cenário e2e>"], "unit": ["<cenário unit>"] },
  "phases": {
    "scope":        { "done": true,  "startedAt": "<INICIO_SCOPE>", "finishedAt": "<FIM_SCOPE>" },
    "blueprint":    { "done": false, "startedAt": null, "finishedAt": null },
    "card":         { "done": false, "startedAt": null, "finishedAt": null },
    "execute":      { "done": false, "startedAt": null, "finishedAt": null },
    "create-test":  { "done": false, "startedAt": null, "finishedAt": null },
    "execute-test": { "done": false, "startedAt": null, "finishedAt": null }
  },
  "reviewRounds": [],
  "artifacts": { "spec": "spec.md", "blueprint": null, "testGuide": null, "evidence": null }
}
```

> Chaves das fases (`scope`, `blueprint`, `card`, `execute`, `create-test`, `execute-test`) são **fixas** — as fases seguintes só alteram `done`/`startedAt`/`finishedAt` da sua própria fase, sem renomear nada. Quem lê o `index.json` (fases seguintes, kanban) faz **read-modify-write**: lê o objeto inteiro, muda só o seu campo e regrava, para nunca apagar dado das outras fases.

---

## Passo 14 — Resumo Final

```
✅ /scope concluído

  Plano:      plan-N — <título>
  Tipo:       <fix|feat>   ·   Branch base: <main|qa>
  Testes:     unit <STACK_UNIT> · e2e <STACK_E2E>
  Salvos:     plans/plan-N/spec.md  +  plans/plan-N/index.json
  Duração:    <INICIO_SCOPE> → <FIM_SCOPE>

Próximo passo: rode /blueprint para gerar o planejamento de implementação.
```
