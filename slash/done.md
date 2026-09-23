---
name: done
description: Encerra um plano — lê o index.json do plano ativo, marca a fase como concluída (status/closedAt) e, opcionalmente, move o card do Jira para o status final
---

# /done — Encerrar o Plano

## Uso

```
/done
```

Sem argumentos. É a fase final do fluxo: marca o plano como **encerrado** no `index.json`. Roda na **raiz do monorepo**.

---

## REGRA GLOBAL

- Esta fase **não implementa nada** — só registra o encerramento.
- Toda escrita no `index.json` é **read-modify-write**: leia o objeto inteiro, altere só os campos desta fase e regrave. **Nunca** apague dados das outras fases.
- Se travar — plano ambíguo, arquivo ausente — **pare e pergunte**.

---

## Passo 1 — Descobrir o plano ativo

O kanban injeta o plano no env. Leia:

```bash
echo "$JARVIS_PLAN"
```

- Se **veio um valor** (ex.: `plan-3`), use-o como `PLAN`.
- Se **vazio** (rodando fora do kanban), liste e escolha o mais recente, confirmando com o usuário:
  ```bash
  ls -d plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
  ```
  `PLAN = plan-<maior>`. Se houver dúvida sobre qual plano encerrar, **pergunte ao usuário**.

---

## Passo 2 — Ler o `index.json`

```bash
cat "plans/$PLAN/index.json"
```

Se o arquivo não existir, encerre avisando que o plano não tem `index.json` (rode `/scope` antes). Guarde o objeto lido inteiro.

---

## Passo 3 — Guard leve: create-test concluído?

Confira `phases["create-test"].done` no objeto lido.

- Se **true**, siga.
- Se **false**, avise e confirme:
  ```
  ⚠️ A fase /create-test ainda não está concluída neste plano.
  Deseja encerrar mesmo assim? (sim / não)
  ```
  Só siga com um **sim** explícito.

---

## Passo 4 — Marcar como encerrado (read-modify-write)

Registre o horário:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM`.

No objeto lido no Passo 2, **adicione/atualize apenas** os campos de encerramento, preservando todo o resto, e regrave `plans/$PLAN/index.json` com a ferramenta Write (JSON válido, sem comentários):

- `"status": "done"`
- `"closedAt": "<FIM>"`

Todas as demais chaves (`title`, `type`, `phases`, `jira`, `reviewRounds`, `artifacts`, …) permanecem **exatamente como estavam**.

---

## Passo 5 — (Opcional) Mover o card no Jira

Se o objeto tiver `jira` preenchido (ex.: `VENA-223`) e o MCP do Jira estiver conectado, ofereça mover o card para o status final:

```
O card <jira> está vinculado a este plano.
Quer que eu mova ele para o status final no Jira? (sim / não)
```

Só mova com um **sim**. Se o MCP não estiver disponível ou não houver `jira`, pule esta etapa.

---

## Passo 6 — Resumo Final

```
✅ /done — plano encerrado

  Plano:    <PLAN> — <title>
  Encerrado: <FIM>
  Jira:     <jira ou —>

O plano está concluído. No kanban, o card fica na coluna Done.
```
