# Prompt — Gerador de Estimativa Técnica

> **Como usar:**
> 1. Abra o terminal na pasta pai que contém os repositórios do projeto
> 2. Execute `claude` para abrir o Claude Code
> 3. Cole o conteúdo deste arquivo no chat
> 4. Siga as fases na ordem — o Claude irá conduzir o processo

---

## Regras Absolutas (leia antes de qualquer coisa)

1. **Zero chutes** — toda afirmação sobre código deve ser verificada lendo o arquivo. Cite sempre `caminho/arquivo.ts:linha`. Se não leu, não afirme.
2. **Perguntas ilimitadas** — qualquer informação que não possa ser confirmada no código deve ser perguntada ao usuário. Não existe limite de perguntas. Agrupe-as por tema e apresente todas de uma vez.
3. **CLAUDE.md primeiro** — ao entrar em qualquer repositório, leia o `CLAUDE.md` antes de qualquer outro arquivo.
4. **Siga o fluxo, não o monorepo** — identifique apenas os repos que participam do caminho descrito pelo usuário. Se o front chama a API 1 e existe uma API 2 que não faz parte do fluxo, não leia a API 2.
5. **Português** — todo o documento gerado deve estar em português.
6. **Estimativa dupla** — estime usando a escala Fibonacci e preencha a coluna de horas, mas deixe a coluna do PO/Tech Lead sempre em branco para revisão humana.
7. **Saída no Desktop** — salvar o documento final em `~/Desktop/[nome-da-demanda].md`.

---

## FASE 1 — Contexto Inicial

Antes de qualquer pesquisa no código, solicite ao usuário:

- **Nome da demanda** — será o nome do arquivo gerado (ex: `amazon-fba-nfe.md`)
- **Número do PPM** — identificador da demanda (ex: `DMND0002177`)
- **Descrição do que precisa ser feito** — pode ser em linguagem natural, com o máximo de detalhes disponíveis
- **Ponto de entrada no fluxo** (opcional) — se souber por onde começa (ex: "webhook AnyMarket", "rota POST /pedidos", "evento SQS"), informe

> Não avance para a Fase 2 sem ter ao menos o **nome da demanda** e a **descrição do que precisa ser feito**.

---

## FASE 2 — Mapeamento do Monorepo

Execute nessa ordem:

### 2.1 — Inventariar os repositórios

Liste todas as pastas no diretório atual. Para cada pasta, verifique:
- Se é um repositório git (presença de `.git/`)
- Se tem `CLAUDE.md`
- Se tem `package.json` — registre o valor de `name`

Registre esse inventário internamente. Não apresente ao usuário ainda.

### 2.2 — Identificar repos candidatos

Com base na descrição do usuário, identifique quais repos provavelmente participam do fluxo. Critérios:
- Nome sugere relação com o que foi descrito
- `package.json` ou `CLAUDE.md` menciona tecnologias ou domínios relevantes

### 2.3 — Ler CLAUDE.md dos candidatos

Para cada repo candidato, leia o `CLAUDE.md` antes de qualquer outro arquivo. Use o conteúdo para:
- Confirmar se o repo é realmente relevante para o fluxo
- Entender a arquitetura e convenções do projeto
- Identificar os pontos de entrada (automations, controllers, routes)

### 2.4 — Traçar o fluxo e descartar o que não é relevante

A partir do ponto de entrada descrito pelo usuário (ou identificado no CLAUDE.md):
- Siga o caminho da requisição/evento passo a passo
- Identifique exatamente quais repos estão no caminho
- **Pare de explorar repos que não estão no fluxo**

Exemplo de raciocínio correto:
> "O usuário quer alterar o webhook. O webhook vive no repo `ServiceBUSMigrationJitter`. Ele chama internamente o `AnymarketOrderRepository`. Existe também um repo `FastshopFrontend` — mas o fluxo não passa por ele → não leio."

---

## FASE 3 — Deep Search nos Repos Relevantes

Para cada repo no fluxo, pesquise em profundidade seguindo esta sequência:

1. **Ponto de entrada** — automation, route, trigger, controller principal
2. **Controller / Handler** — como recebe, valida e despacha o request
3. **Use Case / Service** — lógica de negócio central
4. **Repository / Infrastructure** — acesso a banco, filas, APIs externas
5. **DTOs e validações** — tipagem, decorators, transformações
6. **Configurações** — config files, variáveis de ambiente, staging vs production
7. **Testes existentes** — se houver, entenda o que já está coberto

Para cada arquivo lido, registre internamente:
- Caminho completo + linhas relevantes (ex: `src/http/controllers/AnymarketController.ts:16-31`)
- O que o trecho faz
- Como se conecta com o próximo passo do fluxo

> Se encontrar algo que não entende, que parece incompleto, ou que depende de informação externa (nome de fila, credencial, schema de terceiro): **não assuma** — adicione à lista de perguntas da Fase 4.

---

## FASE 4 — Perguntas ao Usuário

Após o mapeamento completo, compile todas as perguntas que não puderam ser respondidas pelo código. Agrupe por categoria e apresente **todas de uma vez**:

- **Negócio / Requisitos** — comportamentos esperados que o código não define
- **Infraestrutura** — nomes de filas, hosts, credenciais, ambientes (HML/PRD)
- **Contrato externo** — schemas de APIs de terceiros, autenticação, retry, sandbox
- **Operacional** — volume estimado, SLA, responsáveis, deduplicação no consumidor

Aguarde todas as respostas antes de gerar o documento.

> Sem limite de perguntas. Prefira perguntar a inventar.

---

## FASE 5 — Geração do Documento

Com contexto completo, gere o documento em `~/Desktop/[nome-da-demanda].md` usando o template abaixo.

Substitua todos os campos entre `[colchetes]` com informações reais verificadas no código ou confirmadas pelo usuário. Não deixe nenhum `[colchete]` no documento final.

---

## Template do Documento

```markdown
# Estimativa — PPM [NUMERO_PPM] [NOME DA DEMANDA]

> Documento de estimativa e planejamento técnico. **Rascunho para refinamento.**
> Pontuação Fibonacci: **PP (1–3h), P (3–6h), M (6–9h), G (9–12h), GG (18h), XG (24h)**.
> As horas finais serão preenchidas pelo PO/Tech Lead após refinamento.

---

## Contexto

[Descrição do que precisa ser feito. Combine a descrição do usuário com o que foi encontrado no código. Cite repos e arquivos onde o contexto foi confirmado. Inclua o impacto no fluxo existente.]

---

## Estado Atual (AS IS)

**Repo:** `[nome-do-repo-principal]`

Fluxo:

1. [Passo 1 — ex: Gateway → `automations/XAutomation.ts`]
2. [Passo 2 — ex: `src/http/controllers/XController.ts` → `xMethod(ctx)`]
3. [Passo N — com caminho:linha verificado]

**Observações importantes para o desenho TO BE** (verificadas no código):

- [Observação 1 — `caminho/arquivo.ts:linha` — o que foi encontrado e por que é relevante]
- [Observação 2 — idem]

Infraestrutura reutilizável já existente:

- `[caminho/Classe.ts]` — [o que faz e como pode ser reaproveitada]
- [...]

---

## Estado Alvo (TO BE)

[Descrição do novo fluxo proposto. Se houver ramificação de roteamento, use diagrama ASCII:]

```
[Ponto de entrada]
  switch [discriminador]:
    case "[TIPO_A]"  → [UseCase existente] (fluxo atual, INTOCADO)
    case "[TIPO_B]"  → [Novo UseCase]
                       ├── [passo 1]
                       ├── [passo 2]
                       └── [passo N]
    default          → log + 200 (não-bloqueante)
```

**Por que [decisão técnica chave tomada]:**

- [Justificativa 1 — baseada no código existente]
- [Justificativa 2 — baseada nas respostas do usuário]

---

## Contratos e Integrações Externas

> Seção por integração externa identificada no fluxo.

### [Nome da integração — ex: API AnyMarket, Fila IBM MQ]

**Fonte:** [documentação oficial, código, resposta do usuário]

**Payload / Schema:**

```json
{
  "[campo]": "[valor de exemplo]"
}
```

**Autenticação:** [como é feita, onde o token está armazenado, confirmado em `arquivo:linha`]

**Retry / Contingência:** [comportamento em falha — confirmado ou perguntado]

**Idempotência:** [estratégia adotada e por quê]

---

## Perguntas Remanescentes para [Nome do time/cliente]

> Apenas o que é genuinamente do lado deles: negócio, infra interna, credenciais, contratos externos.

### [Categoria 1 — ex: Fila GAN]

1. [Pergunta objetiva]
2. [Pergunta objetiva]

### [Categoria 2 — ex: Cadastro / Credenciais]

1. [Pergunta objetiva]

### [Categoria 3 — ex: Operacional]

1. [Pergunta objetiva]

---

## Estrutura — Épico, Features, Histórias e Tarefas

### ÉPICO: [Título do épico — resumo da demanda em uma linha]

---

#### FEATURE 1 — [Nome da feature]

> [Descrição curta do objetivo desta feature — uma linha]

| #   | História / Tarefa | Tipo     | Estimativa     | Horas (Claude) | Horas (PO/TL) |
| --- | ----------------- | -------- | -------------- | -------------- | ------------- |
| 1.1 | [Descrição]       | Tarefa   | **PP**         | 2              |               |
| 1.2 | [Descrição]       | História | **M**          | 9              |               |

---

#### FEATURE 2 — [Nome da feature]

> [Descrição curta]

| #   | História / Tarefa | Tipo   | Estimativa | Horas (Claude) | Horas (PO/TL) |
| --- | ----------------- | ------ | ---------- | -------------- | ------------- |
| 2.1 | [Descrição]       | Tarefa | **P**      | 4              |               |

[Repetir para cada feature identificada]

---

## Riscos & Buffers

- **[Risco 1 — ex: Contrato externo indefinido]**: [Descrição do risco e qual tarefa pode ser impactada]. Se [condição], estimativa X pode subir de **[tamanho]** para **[tamanho maior]**.
- **[Risco 2 — ex: Dependência de provisionamento externo]**: [Descrição — não conta como esforço de dev mas pode bloquear cronograma].
- **[Risco 3 — ex: Ausência de testes no repo]**: [Impacto no escopo de testes].
- **Buffer recomendado**: **+[X]%** sobre o total para [motivo específico — ex: imprevistos de integração, retrabalho pós-validação].

---

## Arquivos Críticos a Modificar

- `[caminho/Arquivo.ts]` — [o que será alterado]
- `[caminho/Arquivo.ts]` — [o que será alterado]
- [Novos arquivos a criar:]
- `[caminho/NovoArquivo.ts]` — [o que fará]

---

## Verificação

[Preencha apenas com comandos e passos confirmados no código — scripts definidos no `package.json`, comandos de teste encontrados no repo, etc. Não inclua comandos de plataforma ou deploy que não foram verificados.]

1. Build local: `[comando confirmado no package.json]`
2. Testes: `[comando confirmado no package.json]`
3. [Passo de validação manual que pode ser inferido do fluxo]
```

---

## Checklist antes de salvar o documento

- [ ] Todos os arquivos citados foram lidos (nenhum chute)
- [ ] Todo `caminho/arquivo.ts:linha` foi verificado no código
- [ ] Nenhum `[colchete]` permaneceu no documento final
- [ ] Perguntas remanescentes são do lado do cliente, não dúvidas técnicas suas
- [ ] Estimativas usam escala Fibonacci correta: PP / P / M / G / GG / XG
- [ ] Coluna "Horas (PO/TL)" está em branco em todas as tabelas
- [ ] Documento está em português
- [ ] Arquivo salvo em `~/Desktop/[nome-da-demanda].md`
