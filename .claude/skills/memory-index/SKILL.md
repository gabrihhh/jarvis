---
name: memory-index
description: Indexar repositório atual no grafo de memória semantica (Neo4j)
---

# Memory Index — Indexar Repositório no Grafo de Memória

Você vai analisar o repositório atual de forma exaustiva e indexar seu entendimento no Neo4j. **Não grave nada sem aprovação explícita do usuário.**

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
```

Se algum comando falhar (branch inexistente, conflitos, sem remote), pergunte ao usuário o que fazer antes de continuar.

Confirme com:
```bash
git branch --show-current
```

O output deve mostrar o branch escolhido. Se não, pergunte ao usuário.

---

## Passo 1 — Descoberta Inicial

Execute para entender a estrutura geral:

```bash
# Manifesto principal do projeto
cat package.json 2>/dev/null || cat composer.json 2>/dev/null || cat pyproject.toml 2>/dev/null || cat go.mod 2>/dev/null || echo "Nenhum manifesto padrão encontrado"

# Estrutura de diretórios (sem node_modules, .git, dist, build)
find . -maxdepth 3 -type d \
  ! -path "*/node_modules/*" ! -path "*/.git/*" \
  ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.next/*"

# Arquivos de configuração relevantes
find . -maxdepth 2 -type f \( -name "*.json" -o -name "*.toml" -o -name "*.yaml" -o -name "*.yml" -o -name "*.env.example" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*"
```

Com base no output, identifique:
- Linguagem principal e framework
- Diretórios de primeiro e segundo nível como candidatos a módulos
- Dependências listadas no manifesto

Se qualquer coisa não for óbvia, pergunte ao usuário antes de prosseguir.

---

## Passo 2 — Análise Profunda

Para cada diretório candidato a módulo identificado:

**1. Liste os arquivos:**
```bash
find <diretório> -type f \
  ! -path "*/node_modules/*" ! -path "*/.git/*" \
  ! -name "*.lock" ! -name "package-lock.json"
```

**2. Leia os arquivos mais relevantes** (entry points, services, controllers, models, routers, handlers):
- Priorize: `.js`, `.ts`, `.py`, `.php`, `.go`, `.java`, `.rb`
- Ignore: binários, lock files, arquivos gerados, arquivos minificados

**3. Para cada arquivo lido, determine com certeza:**
- **Responsabilidade:** o que este arquivo faz?
- **Imports/Exports:** quais módulos ele usa ou expõe?
- **Padrões:** Repository, Service Layer, MVC, Factory, Middleware, etc.?
- **Domínio de negócio:** a qual área pertence (autenticação, pedidos, faturamento, etc.)?

**A qualquer momento que não tiver 100% de certeza → pergunte ao usuário.**

Exemplos de perguntas válidas:
- "A pasta `src/oms/` é o módulo de gestão de pedidos?"
- "O arquivo `auth.service.js` usa JWT ou sessões?"
- "Qual é o domínio de negócio de `src/billing/`?"
- "Este diretório `src/shared/` contém utilitários compartilhados?"
- "Esse padrão aqui é Repository ou Service Layer?"

---

## Passo 3 — Montagem do Mapa

Ao concluir a análise, consolide mentalmente (sem gravar ainda) o mapa completo:

```
Projeto: <nome> [<branch>]
Linguagem: <linguagem>
Descrição: <descrição curta do que o projeto faz>

Módulos:
  - <nome> | Domínio: <domínio> | Path: <path>
    Arquivos: [lista com propósito de cada um]
    Padrões: [padrões de código identificados]
    Conceitos: [conceitos de negócio]
    Depende de: [outros módulos do projeto]

Padrões globais do projeto: [lista]
Dependências externas relevantes: [nome, versão, tipo]
```

---

## Passo 4 — Apresentação para Aprovação

Apresente o mapa completo ao usuário de forma clara e legível.

Diga ao final: **"Este é meu entendimento completo do projeto. Revise, corrija o que estiver errado, e quando estiver tudo certo me diga 'pode salvar'."**

Aguarde a resposta. Se o usuário corrigir algo:
- Atualize o mapa
- Confirme as correções: "Entendido. Corrigi X para Y. Mais alguma correção?"
- Repita até aprovação explícita

---

## Passo 5 — Gravação

Após aprovação explícita do usuário, chame a MCP tool `save-project` com o objeto completo:

```json
{
  "project": {
    "name": "<nome do projeto>",
    "path": "<path absoluto do repositório>",
    "description": "<descrição>",
    "language": "<linguagem principal>",
    "branch": "<branch escolhido>"
  },
  "modules": [
    {
      "name": "<nome do módulo>",
      "path": "<path relativo>",
      "domain": "<domínio de negócio>",
      "files": [
        { "path": "<path do arquivo>", "purpose": "<responsabilidade>" }
      ],
      "patterns": ["<padrão identificado>"],
      "concepts": ["<conceito de negócio>"],
      "dependsOn": ["<nome de outro módulo do projeto>"]
    }
  ],
  "dependencies": [
    { "name": "<nome>", "version": "<versão>", "type": "external" }
  ],
  "patterns": [
    { "name": "<nome>", "description": "<descrição do padrão>" }
  ]
}
```

Após a tool retornar sucesso, informe ao usuário:
**"Projeto `<nome>` [<branch>] indexado com sucesso no grafo de memória."**
