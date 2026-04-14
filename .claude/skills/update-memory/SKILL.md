---
name: update-memory
description: Atualizar o índice de memória semântica (Neo4j) de um repositório já indexado com base nas mudanças recentes
---

# /update-memory — Atualizar Memória do Repositório

Você vai identificar o que mudou no repositório desde a última indexação e aplicar as atualizações no grafo de memória.

**Antes de iniciar:** leia `.claude/skills/MEMORY_ARCHITECTURE.md` — ele define o schema, as regras de indexação e os critérios de qualidade que guiam esta skill.

## PRÉ-REQUISITO — Verificar ambiente

Antes de qualquer passo, chame a MCP tool:
```
list-projects()
```

Se a tool retornar erro de conexão, tool não encontrada ou MCP indisponível:
**"O MCP server `jarvis-memory` não está acessível. Execute `/setup-memory` primeiro e reinicie o Claude Code antes de continuar."**
Interrompa aqui — não prossiga.

Se a tool retornar "Nenhum projeto indexado ainda":
**"Nenhum projeto indexado encontrado. Execute `/create-memory` primeiro para criar o índice inicial."**
Interrompa aqui — não prossiga.

Se a tool listar projetos, o ambiente está pronto. Continue.

---

## REGRA GLOBAL

- Se travar em qualquer ponto — dúvida técnica, ambiguidade, mudança que não entende — **pare e pergunte ao usuário**
- Só chame `save-project` após aprovação explícita do usuário
- **Nunca re-indexar o projeto inteiro** — se detectar que a mudança é muito grande, sugira usar `/create-memory` no lugar

---

## Passo 0 — Consultar Estado Atual do Grafo

Chame a MCP tool `query-project` para obter o estado atual indexado:

```
query-project(name: "<nome do projeto>", branch: "<branch>")
```

Se o projeto não estiver indexado, interrompa e informe:
**"Este projeto não está indexado ainda. Use `/create-memory` para criar o índice inicial."**

Anote o estado atual: módulos existentes, conceitos, padrões.

---

## Passo 1 — Detectar Mudanças no Repositório

Execute os comandos abaixo para entender o que mudou:

```bash
# Commits recentes (para ter contexto das mudanças)
git log --oneline -20

# Arquivos modificados nos últimos commits (ajuste N conforme necessário)
git diff HEAD~5..HEAD --name-status

# Arquivos modificados e não commitados (trabalho em andamento)
git status --short

# Resumo de quais diretórios foram afetados
git diff HEAD~5..HEAD --name-only | sed 's|/[^/]*$||' | sort -u
```

Se o projeto não tiver histórico git ou a última indexação for muito antiga, pergunte ao usuário qual período considerar.

---

## Passo 2 — Calcular o Delta

Com base nos arquivos modificados, classifique cada mudança:

### Módulos novos
Diretórios que apareceram e não existem no grafo atual.

### Módulos modificados
Diretórios cujos arquivos foram alterados (novos arquivos, arquivos removidos, lógica modificada).

### Módulos removidos
Diretórios que existiam no grafo mas não existem mais no código.
> ⚠️ **Limitação v1:** `save-project` não deleta nós — módulos removidos serão sinalizados ao usuário mas não removidos automaticamente do grafo.

### Novos conceitos / padrões
Identificados na análise dos módulos modificados que não constam no grafo atual.

Apresente o delta inicial ao usuário antes de continuar a análise profunda:

```
Delta detectado:
  ✅ Módulos novos: [lista]
  🔄 Módulos modificados: [lista]
  ⚠️  Módulos removidos (ficam no grafo — não são deletados automaticamente): [lista]
```

Pergunte: **"Este delta está correto? Posso prosseguir com a análise?"**

---

## Passo 3 — Re-analisar Módulos Afetados

Para cada módulo **novo** ou **modificado** (apenas esses):

**1. Liste os arquivos atuais:**
```bash
find <diretório> -type f \
  ! -path "*/node_modules/*" ! -path "*/.git/*" \
  ! -name "*.lock"
```

**2. Leia os arquivos relevantes.**

**3. Determine para cada arquivo:**
- Responsabilidade
- Padrões (nomes canônicos conforme `MEMORY_ARCHITECTURE.md §2`)
- Conceitos de negócio (domínio, não termos técnicos)
- Dependências de outros módulos

**A qualquer incerteza → pergunte ao usuário.**

---

## Passo 4 — Apresentar Delta Completo

Apresente o mapa atualizado apenas com o que vai mudar:

```
## Atualização proposta para <nome do projeto> [<branch>]

### Módulos novos
  - <nome> | Domínio: <domain> | Path: <path>
    Arquivos: [lista]
    Padrões: [lista]
    Conceitos: [lista]
    Depende de: [lista]

### Módulos atualizados
  - <nome> | Antes: <domain antigo> → Depois: <domain novo>
    Arquivos adicionados: [lista]
    Arquivos removidos: [lista]
    Novos conceitos: [lista]
    Novos padrões: [lista]

### ⚠️ Módulos removidos do código (permanecem no grafo nesta versão)
  - <nome> — ainda presente no grafo, mas não encontrado no código
```

Diga ao final: **"Este é o delta que vou aplicar. Corrija o que estiver errado e me diga 'pode salvar' quando estiver pronto."**

---

## Passo 5 — Aplicar Merge no Grafo

Após aprovação explícita, monte o objeto completo do projeto (estado atual do grafo + mudanças do delta) e chame `save-project`.

O `save-project` usa `MERGE` — atualiza e adiciona, nunca deleta. O resultado será um merge seguro.

Use o objeto canônico definido em `MEMORY_ARCHITECTURE.md §6`.

Após sucesso:
**"Memória de `<nome>` [<branch>] atualizada. <N> módulos processados."**

Se houver módulos removidos não tratados:
**"⚠️ Os módulos `<lista>` foram removidos do código mas ainda existem no grafo. Para removê-los, será necessário um tool de limpeza (previsto para v2)."**
