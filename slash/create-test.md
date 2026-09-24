---
name: create-test
description: Cria um guia de teste em português, leigo e humanizado, explicando como um usuário sem conhecimento técnico valida a alteração — salva no plan e posta como comentário no card do Jira
---

# /create-test — Guia de Teste (leigo)

## Uso

```
/create-test            # usa o plan ativo (mais recente)
/create-test plan-3     # opcional: especifica o plan
```

É a **FASE 6** do fluxo (depois de `/execute`, com a PR já feita). Gera um **guia de teste para leigos** (pt-BR) explicando como validar a resolução/novidade **+ um roteiro estruturado** (fonte da Fase 7 `/execute-test`), e posta o guia como **comentário no card**.

---

## REGRA GLOBAL

- O guia é em **português**, **leigo e humanizado** — escrito para alguém que **não entende o sistema**.
- Esta fase **não altera código**.
- **Guard:** só roda se o `/execute` estiver **concluído** no `index.json` (`phases["execute"].done`).
- Toda escrita no `index.json` é **read-modify-write**: leia o objeto inteiro, altere só o campo desta fase e regrave (Write, JSON válido). **Nunca** apague dado de outra fase.
- Requer **MCP do Jira** conectado (para comentar no card).
- Se travar — sem card, ambiguidade sobre o que testar — **pare e pergunte**.

---

## Passo 1 — Plan ativo e leitura

`MONOREPO` vem do `.claude/estrutura.md`. Determine `plan-N`: se o kanban passou `JARVIS_PLAN`, use-o; senão o argumento; senão o mais recente:

```bash
echo "${JARVIS_PLAN:-}"
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
cat "$MONOREPO/plans/plan-$N/index.json"
cat "$MONOREPO/plans/plan-$N/spec.md"
cat "$MONOREPO/plans/plan-$N/plano-implementacao.md"
```

Extraia do `index.json`: **título** (`title`), **tipo** (`type`), **id do card** (`jira` → `CARD_ID`); e do spec/plano as **telas/fluxo** e as **áreas afetadas** (front → API).

Registre o início:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_CT`.

---

## Passo 2 — Guard: `/execute` concluído?

No `index.json`, verifique `phases["execute"].done`.

- Se **não** for `true`:
  ```
  ⚠️ O /execute deste plano não está concluído.
  Rode /execute antes de usar /create-test.
  ```
  Interrompa aqui.

- Se for `true`, faça **read-modify-write** no `index.json` marcando `phases["create-test"].startedAt = "<INICIO_CT>"` (preservando o resto) e siga.

---

## Passo 3 — A alteração é só de API?

Com base no plano/áreas afetadas, decida:
- **Só de API** — nenhuma tela mudou (só endpoints/serviços/bastidores).
- **Envolve telas** — há mudança visível no front.

Se ficar ambíguo, pergunte ao usuário.

---

## Passo 4 — Criar o `guia-de-teste.md`

Escreva pensando **como um humano leigo**, em pt-BR, de forma clara e acolhedora. Salve em `"$MONOREPO/plans/plan-$N/guia-de-teste.md"`.

### Variante A — Envolve telas

```markdown
# Como testar: <título em linguagem leiga>

Esta alteração mexe em <área> do sistema. Abaixo, um passo a passo para você conferir
se está tudo certo — mesmo sem entender a parte técnica.

## O que mudou (em poucas palavras)
<explicação bem simples>

## Como testar (passo a passo)
O escopo vai de <ponto inicial> até <ponto final>. São <N> telas para conferir:

1. Abra a tela <X> e faça <ação>.
2. Vá para a tela <Y> e faça <ação>.
3. Na tela <Z>, confira <resultado>.

## O que deve acontecer
- <resultado esperado 1>
- <resultado esperado 2>

## Se algo sair diferente
Anote o que aconteceu (e em qual tela) e avise o time.
```

### Variante B — Só de API

```markdown
# Como testar: <título em linguagem leiga>

Esta alteração é nos "bastidores" (API), sem tela. Para testar, é preciso chamar um endpoint.

## O que mudou (em poucas palavras)
<explicação bem simples>

## Como testar (via API)
- Chame: `<MÉTODO> <caminho do endpoint>`
- Enviando: <corpo/parâmetros, se houver>
- Deve retornar: <resposta esperada — status e exemplo do retorno>

## O que confirma que está certo
- <o retorno/valor esperado>
```

Use o **exemplo real** do escopo (ex.: *"Como testar a otimização da esteira logística — o fluxo vai da tela A até a confirmação na tela C, são 3 telas a testar"*).

### Bloco roteiro (estruturado) — obrigatório, ao final do arquivo

Depois do bloco leigo, adicione um **segundo bloco** no mesmo `guia-de-teste.md`: o **roteiro estruturado**. Ele **não** substitui o texto leigo — é uma tabela **por passo**, precisa e sem enfeite, que a **Fase 7 (`/execute-test`)** consome para reproduzir o teste automaticamente. Nenhum código de produto muda por causa deste bloco; é só documentação estruturada.

Cada passo é uma linha com **exatamente** estas colunas:

- **passo** — número sequencial.
- **tipo** — `front` (mexe em tela) ou `api` (chamada HTTP direta).
- **rota** — para `front`: a **rota/url** da tela (ex.: `/pedidos/:id`); para `api`: `<MÉTODO> <endpoint>` (ex.: `POST /api/v1/pedidos/123/confirmar`).
- **elemento** — em linguagem humana, o que se toca (ex.: *"botão Confirmar pedido"*, *"campo Quantidade"*); para `api`, o alvo (*"pedido 123"*).
- **acao** — o que fazer (ex.: *"clicar"*, *"preencher com 5"*, *"enviar a requisição"*).
- **antes (X)** — o estado observável **antes** da ação (ex.: *"status = Pendente"*).
- **depois (Y)** — o estado observável esperado **depois** (ex.: *"status = Confirmado"*).
- **operacao** — só para passos com **efeito** (mutação): `GET` (leitura, sem efeito), `POST`, `PUT`, `PATCH`, `DELETE`. Deixe `—` quando não houver efeito.

```markdown
## Roteiro estruturado (para /execute-test)

> Bloco lido pela Fase 7 para reproduzir o teste. Uma linha por passo.

| passo | tipo | rota | elemento | acao | antes (X) | depois (Y) | operacao |
|---|---|---|---|---|---|---|---|
| 1 | front | /pedidos/123 | tela do pedido | abrir | — | pedido visível, status "Pendente" | GET |
| 2 | front | /pedidos/123 | botão "Confirmar" | clicar | status "Pendente" | status "Confirmado" | POST |
| 3 | api | GET /api/v1/pedidos/123 | pedido 123 | ler estado | — | `{ "status": "confirmado" }` | GET |
```

Regras do roteiro:
- **Front-first quando full-stack**: se o fluxo passa pela tela, descreva o passo `front`; só use `api` quando a alteração for de bastidor sem tela, ou para **confirmar o efeito** via leitura.
- **Seja preciso o suficiente** para decidir o efeito real: a Fase 7 bloqueia execução de passos destrutivos com base neste roteiro. Se um clique de UI dispara uma deleção, marque `operacao: DELETE` nesse passo `front`.
- **Nunca** coloque credenciais/segredos aqui — só nomes de campos e valores de teste não-sensíveis.

---

## Passo 5 — Postar o guia como comentário no card

Leia o conteúdo do `guia-de-teste.md` e poste como **comentário no card** `CARD_ID` (MCP do Jira, `addCommentToJiraIssue`).

Confirme que o comentário foi criado.

---

## Passo 6 — Atualizar o `index.json` e concluir

Registre o fim:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_CT`.

No `index.json` do plan, faça **read-modify-write** (preservando o resto):
- `phases["create-test"].done = true` · `phases["create-test"].startedAt = "<INICIO_CT>"` · `phases["create-test"].finishedAt = "<FIM_CT>"`
- `artifacts.testGuide = "guia-de-teste.md"`

---

## Passo 7 — Resumo Final

```
✅ /create-test concluído

  Plano:    plan-N — <título>
  Guia:     plans/plan-N/guia-de-teste.md  (leigo + roteiro estruturado)
  Card:     <CARD_ID> — guia postado como comentário ✓
  Duração:  <INICIO_CT> → <FIM_CT>

Próximo passo: rode /execute-test para executar o roteiro contra qa e capturar evidências.
(Se o reviewer deixar feedback na PR, use /resolve-reviewer.)
```
