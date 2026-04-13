---
name: create-memory
description: Indexar repositório atual no grafo de memória semântica (Neo4j) do zero
---

# /create-memory — Criar Índice de Memória do Repositório

Você vai analisar o repositório atual de forma exaustiva e indexar seu entendimento no Neo4j.

**Antes de iniciar:** leia `.claude/skills/MEMORY_ARCHITECTURE.md` — ele define o schema do grafo, as regras de indexação e os critérios de qualidade que você deve seguir durante toda a execução desta skill.

## REGRA GLOBAL

- Se travar em qualquer ponto — dúvida técnica, conceitual, arquivo ilegível, ambiguidade de qualquer natureza — **pare e pergunte ao usuário** antes de continuar
- Não há limite de perguntas. Prefira perguntar a gravar algo errado
- Só chame a MCP tool `save-project` após o usuário dizer explicitamente "pode salvar" ou equivalente

---

## Passo 0 — Seleção de Branch

Pergunte ao usuário: **"Deseja indexar o branch `main` ou `qa`?"**

Após a resposta, execute:
```bash
git checkout <branch-escolhido>
git pull origin <branch-escolhido>
git branch --show-current
```

Se qualquer comando falhar (branch inexistente, conflitos, sem remote), pergunte ao usuário o que fazer antes de continuar.

---

## Passo 1 — Descoberta Inicial

```bash
# Manifesto principal do projeto
cat package.json 2>/dev/null || cat composer.json 2>/dev/null || cat pyproject.toml 2>/dev/null || cat go.mod 2>/dev/null || echo "Nenhum manifesto padrão encontrado"

# Estrutura de diretórios (sem ruído)
find . -maxdepth 3 -type d \
  ! -path "*/node_modules/*" ! -path "*/.git/*" \
  ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*"

# Arquivos de configuração relevantes
find . -maxdepth 2 -type f \( -name "*.json" -o -name "*.toml" -o -name "*.yaml" -o -name "*.yml" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*"
```

Identifique com base no output:
- Linguagem principal e framework
- Candidatos a módulos (diretórios com responsabilidade identificável)
- Dependências do manifesto

Consulte `MEMORY_ARCHITECTURE.md §2` para decidir o que é ou não um módulo.

---

## Passo 2 — Análise Profunda

Para cada módulo candidato:

**1. Liste os arquivos:**
```bash
find <diretório> -type f \
  ! -path "*/node_modules/*" ! -path "*/.git/*" \
  ! -name "*.lock" ! -name "package-lock.json"
```

**2. Leia os arquivos relevantes** (entry points, services, controllers, handlers, routers, models).

**3. Para cada arquivo, determine:**
- **Responsabilidade:** o que este arquivo faz?
- **Imports/Exports:** quais módulos ele usa ou expõe?
- **Padrões:** nomes canônicos conforme `MEMORY_ARCHITECTURE.md §2`
- **Conceitos de negócio:** conforme regra de domínio em `MEMORY_ARCHITECTURE.md §2`

**A qualquer momento de incerteza → pergunte ao usuário.**

---

## Passo 3 — Montagem do Mapa

Consolide o mapa completo (sem salvar ainda):

```
Projeto: <nome> [<branch>]
Linguagem: <linguagem>
Descrição: <descrição curta>

Módulos:
  - <nome> | Domínio: <domain> | Path: <path>
    Arquivos: [lista com purpose de cada um]
    Padrões: [padrões identificados]
    Conceitos: [conceitos de negócio]
    Depende de: [outros módulos do projeto]

Padrões globais do projeto: [lista]
Dependências externas relevantes: [nome, versão, tipo]
```

Valide o mapa contra os critérios de qualidade em `MEMORY_ARCHITECTURE.md §5` antes de apresentar.

---

## Passo 4 — Apresentação para Aprovação

Apresente o mapa completo ao usuário de forma clara e legível.

Diga ao final: **"Este é meu entendimento completo do projeto. Revise, corrija o que estiver errado, e quando estiver tudo certo me diga 'pode salvar'."**

Se o usuário corrigir algo:
- Atualize o mapa
- Confirme: "Entendido. Corrigi X para Y. Mais alguma correção?"
- Repita até aprovação explícita

---

## Passo 5 — Gravação

Após aprovação explícita, chame `save-project` com o objeto canônico definido em `MEMORY_ARCHITECTURE.md §6`.

Após sucesso:
**"Projeto `<nome>` [<branch>] indexado com sucesso no grafo de memória."**
