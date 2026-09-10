---
name: blueprint
description: Gera o planejamento técnico de implementação a partir da spec do /scope — analisa a spec e os repositórios (como está hoje × o que fazer), inclui os testes a criar e salva plano-implementacao.md no plan
---

# /blueprint — Planejamento de Implementação

## Uso

```
/blueprint            # usa o plan ativo (mais recente)
/blueprint plan-3     # opcional: especifica o plan
```

É a **FASE 3** do fluxo (depois de `/scope`). Transforma a especificação no **"como"** técnico. **IA-only**: não pede nada ao usuário além de confirmar qual é o plan, e **não altera código** — só produz o planejamento.

---

## REGRA GLOBAL

- Esta fase **não implementa** — apenas planeja (gera um markdown).
- **Não altere** nenhum arquivo dos repositórios; escreva somente dentro de `plans/plan-N/`.
- **Guard:** só roda se o `/scope` estiver **concluído** no `index.md`.
- Se travar — sem plan, spec ausente, ambiguidade — **pare e pergunte**.

---

## Passo 1 — Identificar o plan ativo e ler o `index.md`

Descubra o monorepo pelo `.claude/estrutura.md` (campo **Caminho**); guarde como `MONOREPO`.

Se o usuário passou `plan-N` como argumento, use-o. Caso contrário, pegue o **mais recente**:

```bash
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
```

Leia o painel:

```bash
cat "$MONOREPO/plans/plan-$N/index.md"
```

Confirme com o usuário em uma linha (só para garantir que é o plan certo):

```
Plano ativo: plan-N — <título>. Sigo com o blueprint? (sim / ou informe outro plan)
```

Registre o horário de início:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_BP`.

---

## Passo 2 — Guard: `/scope` concluído?

Na tabela **Progresso** do `index.md`, verifique a linha `/scope`.

- Se **não** estiver `✅ concluído`, encerre:
  ```
  ⚠️ O /scope deste plano não está concluído.
  Rode /scope antes de usar /blueprint.
  ```
  Interrompa aqui.

- Se estiver concluído, marque no `index.md` a fase `/blueprint` como `🔄 em andamento` (Início = `INICIO_BP`) e siga.

---

## Passo 3 — Sub-agent: analisar spec + repositórios

Lance um **sub-agent** (Task tool) com a tarefa de:

1. Ler `plans/plan-$N/spec.md` (a especificação aprovada).
2. Usar o `.claude/estrutura.md` para saber o que é **api**, **front** e **outro**.
3. Analisar os repositórios envolvidos e entender **como está hoje** e **o que precisa ser feito** para implementar exatamente o que foi escopado (os gaps já foram fechados no `/scope` — aqui é foco técnico).
4. Retornar um planejamento estruturado (ver Passo 4).

O sub-agent **não altera código** — só lê e planeja.

---

## Passo 4 — Criar o `plano-implementacao.md`

Com o retorno do sub-agent, grave `"$MONOREPO/plans/plan-$N/plano-implementacao.md"` com, no mínimo:

- **Resumo do escopo** (referência à spec).
- **Estado atual** — como funciona hoje, por área (front → API).
- **Passos de implementação** — ordenados, por repositório/arquivo, com o que muda em cada um.
- **Testes a criar** — derivados dos **cenários da spec** (só do novo):
  - `e2e:` … (arquivo/onde criar, com o stack do plan)
  - `unit:` … (arquivo/onde criar, com o stack do plan)
- **Pontos de atenção** — riscos, dependências entre repos, ordem de merge.

Formato sugerido:

```markdown
# Plano de Implementação — plan-N: <título>

> Derivado de spec.md. Base para o /execute.

## Resumo do escopo
<resumo>

## Estado atual
- front-vena: <como está>
- api-vena-core: <como está>

## Passos de implementação
1. [api-vena-core] <arquivo> — <o que fazer>
2. [front-vena] <arquivo> — <o que fazer>
...

## Testes a criar (do escopo novo)
- e2e (<stack>): <arquivo> — <cenário>
- unit (<stack>): <arquivo> — <cenário>

## Pontos de atenção
- <risco / dependência / ordem>
```

---

## Passo 5 — Atualizar o `index.md`

Registre o horário de fim:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_BP`.

No `index.md` do plan:
- marque a fase `/blueprint` como `✅ concluído` (Início = `INICIO_BP`, Fim = `FIM_BP`);
- no bloco **Artefatos**, confirme o link para `plano-implementacao.md`.

---

## Passo 6 — Resumo Final

```
✅ /blueprint concluído

  Plano:    plan-N — <título>
  Gerado:   plans/plan-N/plano-implementacao.md
  Testes:   <n> e2e · <n> unit planejados
  Duração:  <INICIO_BP> → <FIM_BP>

Próximo passo: rode /card para criar a tarefa no Jira.
```
