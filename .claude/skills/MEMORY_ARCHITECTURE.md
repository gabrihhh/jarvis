# Memory Architecture — Contrato do Grafo de Memória Semântica

Este documento é a fonte de verdade para as skills `/create-memory` e `/update-memory`.
Toda decisão de indexação deve seguir as regras aqui definidas.

---

## 1. Schema do Grafo

### Nodes

| Node | Propriedades | Unicidade |
|---|---|---|
| `Project` | name, path, description, language, branch, createdAt | (name, branch) |
| `Module` | name, path, domain, projectName, branch | (path, projectName, branch) |
| `File` | path, name, extension, purpose, projectName, branch | (path, projectName, branch) |
| `Concept` | name, projectName | (name, projectName) |
| `Pattern` | name, description | name — **global, compartilhado entre projetos** |
| `Dependency` | name, version, type, projectName, branch | (name, projectName, branch) |

### Relationships

```
Project  -[:HAS_MODULE]->  Module
Module   -[:CONTAINS]->    File
Module   -[:HANDLES]->     Concept
Module   -[:IMPLEMENTS]->  Pattern
Module   -[:DEPENDS_ON]->  Module
Project  -[:USES_PATTERN]-> Pattern
```

### Notas do schema

- `Pattern` é o único nó global — o mesmo padrão pode ser compartilhado entre projetos
- `Concept` é sempre vinculado ao projeto — "pedido" no projeto A ≠ "pedido" no projeto B
- `Dependency` registra apenas dependências diretas (package.json, go.mod, etc.), nunca transitivas

---

## 2. Regras de Indexação

### O que É um módulo

- Um diretório com **responsabilidade coesa e identificável**
- Exemplos: `src/auth`, `src/memory`, `.claude/skills`, `bin`
- Profundidade máxima: 2 níveis a partir da raiz do projeto (ex: `src/memory` é válido, `src/memory/adapters/neo4j` não)
- Diretórios "standalone" com um único arquivo importante podem ser tratados como módulo

### O que NÃO é um módulo

- `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `__pycache__/`
- Diretórios de configuração trivial (`.husky/`, `.vscode/`)
- Diretórios gerados automaticamente

### O que É um arquivo indexável

- Arquivos com lógica de negócio: `.js`, `.ts`, `.py`, `.go`, `.php`, `.java`, `.rb`, `.rs`
- Entry points, services, controllers, handlers, routers, models
- Arquivos de skill/automação (`.md` de skills)

### O que NÃO indexar como arquivo

- Lock files (`package-lock.json`, `yarn.lock`, `*.lock`)
- Arquivos minificados ou gerados
- Arquivos de configuração sem lógica (`tsconfig.json`, `.eslintrc`)
- Binários

### Conceitos: domínio, não técnica

- **Certo:** `autenticação`, `sessão`, `pedido`, `faturamento`, `status bar`, `injeção de contexto`
- **Errado:** `string`, `array`, `request`, `handler`, `utils`
- Conceitos em português quando o domínio é brasileiro, inglês quando o projeto é internacional

### Padrões: nomes canônicos

- Usar nomes reconhecíveis: `Repository Pattern`, `MCP Protocol`, `Command Pattern`, `Pipeline`, `Single Responsibility`, `Observer`, `Factory`, `Middleware`
- Nunca inventar nomes de padrões

### Granularidade do domain (Module.domain)

- Frase curta e descritiva: `"Autenticação de usuários"`, `"Grafo de memória semântica"`, `"Dashboard de uso do terminal"`
- Nunca genérico: `"Utilitários"`, `"Helpers"`, `"Misc"`

---

## 3. Fluxo de Criação (`/create-memory`)

Usado quando o projeto **não existe** no grafo ou se deseja reindexar do zero.

```
Passo 0 → Selecionar branch (main ou qa)
Passo 1 → Descoberta inicial (manifesto, estrutura, dependências)
Passo 2 → Análise profunda por módulo (arquivos, padrões, conceitos, deps)
Passo 3 → Montagem do mapa completo (sem salvar ainda)
Passo 4 → Apresentação ao usuário para aprovação e correção
Passo 5 → Gravação via save-project após "pode salvar"
```

**Regra:** nunca salvar sem aprovação explícita.

---

## 4. Fluxo de Atualização (`/update-memory`)

Usado quando o projeto **já existe** no grafo e houve mudanças no repositório.

```
Passo 0 → Consultar grafo atual (query-project)
Passo 1 → Detectar mudanças via git (git log + git diff)
Passo 2 → Calcular delta (novo, modificado, removido)
Passo 3 → Re-analisar apenas módulos afetados
Passo 4 → Apresentar delta ao usuário (antes vs. depois)
Passo 5 → Aplicar merge via save-project após aprovação
```

**Comportamento do save-project:** usa `MERGE` — adiciona e atualiza, nunca deleta.
**Limitação v1:** módulos removidos do código permanecem como nós órfãos no grafo.
Módulos removidos devem ser sinalizados ao usuário no Passo 4 com um aviso explícito.

---

## 5. Critérios de Qualidade

### Grafo saudável

- Cada módulo tem `domain` específico e não genérico
- Conceitos refletem o vocabulário do produto/negócio
- Relações `DEPENDS_ON` são reais e verificadas no código
- Patterns são nomes canônicos da literatura

### Sinais de grafo poluído

- Módulos com `domain: "utilitários"` ou `"misc"`
- Conceitos técnicos: `"json"`, `"http"`, `"string"`
- Arquivos de config indexados como arquivos relevantes
- Mais de 15 arquivos por módulo sem subdivisão
- Módulos sem nenhum conceito associado

---

## 6. Objeto canônico para save-project

```json
{
  "project": {
    "name": "<nome do repositório>",
    "path": "<path absoluto>",
    "description": "<uma linha descrevendo o que o projeto faz>",
    "language": "<linguagem principal>",
    "branch": "main | qa"
  },
  "modules": [
    {
      "name": "<nome do diretório ou nome semântico>",
      "path": "<path relativo ao root>",
      "domain": "<responsabilidade em frase curta>",
      "files": [
        { "path": "<path relativo>", "purpose": "<o que este arquivo faz>" }
      ],
      "patterns": ["Repository Pattern", "MCP Protocol"],
      "concepts": ["autenticação", "sessão"],
      "dependsOn": ["<nome de outro módulo deste projeto>"]
    }
  ],
  "dependencies": [
    { "name": "<pacote>", "version": "<versão>", "type": "external | internal" }
  ],
  "patterns": [
    { "name": "<nome canônico>", "description": "<descrição do padrão>" }
  ]
}
```
