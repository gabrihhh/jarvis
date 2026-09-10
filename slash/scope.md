---
name: scope
description: Define o escopo de uma alteração — sincroniza a branch (main/qa), entende o fluxo real front→API, tira todas as dúvidas, cria e revisa a especificação e salva em plans/plan-N com o index.md (painel de progresso)
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
- No sync de branch, **a verdade é o remote**: qualquer branch/alteração local é descartada — mas **só após avisar e o usuário confirmar**.
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

## Passo 3 — Sincronizar a branch em todas as pastas (verdade = remote)

Liste os repositórios git de primeiro nível do monorepo:

```bash
for d in "$MONOREPO"/*/; do
  test -d "$d/.git" && echo "$d"
done
```

Para cada repo, verifique se há algo local a descartar:

```bash
cd "<repo>" && git fetch origin --quiet && git status --short && git branch --show-current
```

Monte um resumo do que será **descartado** (branches locais não enviadas, arquivos modificados/não commitados) e **peça confirmação explícita**:

```
⚠️ Vou alinhar todos os repositórios com o remote na branch "<BRANCH_BASE>".
Isto DESCARTA o que está local:

  api-vena-core   → 2 arquivos modificados, branch local "wip-teste"
  front-vena      → limpo

Confirma descartar o local e deixar tudo igual ao remote? (sim / não)
```

- Se o usuário **não confirmar**, pergunte como proceder (ou encerre).
- Se **confirmar**, lance um **sub-agent** (Task tool) para executar em cada repo, em paralelo:

  ```bash
  cd "<repo>"
  git fetch origin --prune
  git checkout "<BRANCH_BASE>"
  git reset --hard "origin/<BRANCH_BASE>"
  git clean -fd
  git pull --ff-only origin "<BRANCH_BASE>"
  ```

  O sub-agent retorna o status final de cada repo. Confirme que todos estão em `origin/<BRANCH_BASE>` atualizados antes de seguir.

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

Usando a classificação do `.claude/estrutura.md`, entre pela **pasta de frontend** e siga o fluxo até a **API** para entender exatamente onde a alteração acontece:

- No `FRONTEND`, localize a tela/componente/serviço relacionado à descrição do usuário.
- Siga as chamadas HTTP até o(s) repo(s) de **api** e mapeie o endpoint/serviço/entidade envolvidos.
- Anote os arquivos e camadas que provavelmente serão tocados (só para entendimento — não altere nada).

---

## Passo 7 — Stack de teste (detectar + confirmar)

Detecte o stack de teste nos repositórios envolvidos:

```bash
cat "<repo>/package.json" 2>/dev/null | grep -E '"(jest|vitest|mocha|@playwright/test|cypress|karma|jasmine)"'
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

## Passo 13 — Criar o `index.md` (painel de progresso)

Registre o horário de fim:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_SCOPE`.

Crie `"$MONOREPO/plans/plan-$N/index.md"` (markdown-only) marcando **/scope como concluído**:

```markdown
# 📋 Plano N — <título>

> Painel de progresso do plano. Todo comando lê e atualiza este arquivo. É a fonte de verdade do andamento.

## Identificação
- **Pasta:** plan-N
- **Título:** <título>
- **Tipo:** <fix|feat>
- **Branch base:** <main|qa>
- **Branch de trabalho:** <tipo>/<base>/<card>   <!-- card definido no /card -->
- **Organização (Jira):** —   <!-- definido no /card -->
- **Card:** —                 <!-- definido no /card -->
- **PR:** —                   <!-- definido no /execute -->
- **Repositórios:** <repos envolvidos>

## Progresso
<!-- status: ⬜ pendente | 🔄 em andamento | ✅ concluído -->
| Fase          | Status        | Início            | Fim               |
|---------------|---------------|-------------------|-------------------|
| /scope        | ✅ concluído   | <INICIO_SCOPE>    | <FIM_SCOPE>       |
| /blueprint    | ⬜ pendente    | —                 | —                 |
| /card         | ⬜ pendente    | —                 | —                 |
| /execute      | ⬜ pendente    | —                 | —                 |
| /create-test  | ⬜ pendente    | —                 | —                 |

## Testes (definidos no /scope)
- **Stack unit:** <STACK_UNIT>
- **Stack e2e:** <STACK_E2E>
- **Cenários:**
  - e2e: <cenário>
  - unit: <cenário>

## Rodadas de review (/resolve-reviewer)
| Rodada | Quando            | Resumo                                   |
|:------:|-------------------|------------------------------------------|
| —      | —                 | —                                        |

## Artefatos
- 📄 Especificação → spec.md
- 🛠️ Plano de implementação → plano-implementacao.md   <!-- criado no /blueprint -->
- 🧪 Guia de teste → guia-de-teste.md                  <!-- criado no /create-test -->
```

---

## Passo 14 — Resumo Final

```
✅ /scope concluído

  Plano:      plan-N — <título>
  Tipo:       <fix|feat>   ·   Branch base: <main|qa>
  Testes:     unit <STACK_UNIT> · e2e <STACK_E2E>
  Salvos:     plans/plan-N/spec.md  +  plans/plan-N/index.md
  Duração:    <INICIO_SCOPE> → <FIM_SCOPE>

Próximo passo: rode /blueprint para gerar o planejamento de implementação.
```
