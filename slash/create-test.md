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

É a **FASE 6** do fluxo (depois de `/execute`, com a PR já feita). Gera um **guia de teste para leigos** (pt-BR) explicando como validar a resolução/novidade, e posta esse guia como **comentário no card**.

---

## REGRA GLOBAL

- O guia é em **português**, **leigo e humanizado** — escrito para alguém que **não entende o sistema**.
- Esta fase **não altera código**.
- **Guard:** só roda se o `/execute` estiver **concluído** no `index.md`.
- Requer **MCP do Jira** conectado (para comentar no card).
- Se travar — sem card, ambiguidade sobre o que testar — **pare e pergunte**.

---

## Passo 1 — Plan ativo e leitura

`MONOREPO` vem do `.claude/estrutura.md`. Determine `plan-N` (argumento ou o mais recente):

```bash
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
cat "$MONOREPO/plans/plan-$N/index.md"
cat "$MONOREPO/plans/plan-$N/spec.md"
cat "$MONOREPO/plans/plan-$N/plano-implementacao.md"
```

Extraia: **título**, **tipo**, **id do card** (`CARD_ID`), as **telas/fluxo** e as **áreas afetadas** (front → API).

Registre o início:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_CT`.

---

## Passo 2 — Guard: `/execute` concluído?

Na tabela **Progresso** do `index.md`, verifique `/execute`.

- Se **não** estiver `✅ concluído`:
  ```
  ⚠️ O /execute deste plano não está concluído.
  Rode /execute antes de usar /create-test.
  ```
  Interrompa aqui.

- Se concluído, marque `/create-test` como `🔄 em andamento` (Início = `INICIO_CT`) e siga.

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

---

## Passo 5 — Postar o guia como comentário no card

Leia o conteúdo do `guia-de-teste.md` e poste como **comentário no card** `CARD_ID` (MCP do Jira, `addCommentToJiraIssue`).

Confirme que o comentário foi criado.

---

## Passo 6 — Atualizar o `index.md` e concluir

Registre o fim:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_CT`.

No `index.md` do plan:
- marque `/create-test` como `✅ concluído` (Início = `INICIO_CT`, Fim = `FIM_CT`);
- confirme o link para `guia-de-teste.md` no bloco **Artefatos**.

---

## Passo 7 — Resumo Final

```
✅ /create-test concluído

  Plano:    plan-N — <título>
  Guia:     plans/plan-N/guia-de-teste.md  (<telas | API>)
  Card:     <CARD_ID> — guia postado como comentário ✓
  Duração:  <INICIO_CT> → <FIM_CT>

Fluxo linear concluído. Se o reviewer deixar feedback na PR, use /resolve-reviewer.
```
