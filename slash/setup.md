---
name: setup
description: Configura o ambiente do fluxo de desenvolvimento com IA — verifica MCP do Jira e GitHub CLI, identifica o monorepo, cria o .claude e classifica as pastas em API vs Front-end
---

# /setup — Configuração do Ambiente

## Uso

```
/setup
```

Sem argumentos. É a **primeira fase** do fluxo (`/setup` → `/scope` → `/blueprint` → `/card` → `/execute` → `/create-test`). Prepara o ambiente e cria a base de conhecimento do monorepo que as fases seguintes vão consumir.

---

## REGRA GLOBAL

- **Nunca** modifique arquivos fora da pasta do monorepo informada pelo usuário.
- **Nunca** rode `git add`, `commit` ou `push` nesta fase — o `/setup` só configura, não versiona nada.
- Toda ação que **cria ou altera arquivo** deve ser mostrada e confirmada antes de executar.
- Se travar em qualquer ponto — erro inesperado, ambiguidade, comando indisponível — **pare e pergunte ao usuário**.
- Conexões que exigem login (OAuth do Jira, `gh auth login`) são **interativas**: o `/setup` orienta e aguarda o usuário concluir, não tenta automatizar o login.

---

## Passo 1 — Verificar o MCP do Jira

O fluxo usa o MCP do Jira (Atlassian) nas fases `/card` e `/execute`. Verifique se está conectado:

```bash
claude mcp list 2>/dev/null
```

Procure na saída por um servidor de Jira/Atlassian (nomes comuns: `atlassian`, `jira`, `rovo`) marcado como conectado.

- **Se encontrar e estiver conectado:** informe `✓ MCP do Jira conectado` e siga para o Passo 2.
- **Se NÃO encontrar (ou estiver desconectado):** oriente o usuário e **aguarde**:

  ```
  ⚠️ MCP do Jira não encontrado.

  Para conectar, dentro do Claude Code:
    1. Rode  /mcp  e adicione o servidor da Atlassian (Jira), OU
    2. Rode no terminal:  claude mcp add --transport <...> atlassian <url>
    3. Conclua o login (OAuth) que abrir no navegador.

  Quando terminar, me avise para eu revalidar (ou rode /setup de novo).
  ```

  Revalide com `claude mcp list` após o usuário confirmar. Só prossiga quando o Jira estiver conectado.

---

## Passo 2 — Verificar o GitHub CLI (`gh`)

As fases `/execute` e `/resolve-reviewer` usam o `gh`. Verifique instalação e autenticação:

```bash
gh --version 2>/dev/null
gh auth status 2>&1
```

- **Se `gh` não estiver instalado:** informe e oriente a instalação (`https://cli.github.com`), depois aguarde e revalide.
- **Se instalado mas NÃO autenticado:** oriente o usuário e **aguarde**:

  ```
  ⚠️ GitHub CLI não autenticado.

  Rode no seu terminal (é interativo):
    gh auth login

  Quando terminar, me avise para eu revalidar.
  ```

- **Se instalado e autenticado:** informe `✓ GitHub CLI configurado` e siga para o Passo 3.

Só prossiga quando o `gh` estiver autenticado.

---

## Passo 3 — Identificar a pasta do monorepo

Pergunte ao usuário:

```
Qual a pasta do monorepo que você vai usar para trabalhar?
(caminho absoluto, ex: /home/você/projetos/vena)
```

Valide o caminho:

```bash
test -d "<CAMINHO>" && echo "OK: existe" || echo "ERRO: não existe"
ls -la "<CAMINHO>"
```

- Se não existir ou não for um diretório, avise e peça novamente.
- Guarde internamente como `MONOREPO`.

Liste as pastas de primeiro nível (os "repos"/módulos do monorepo):

```bash
find "<MONOREPO>" -maxdepth 1 -mindepth 1 -type d -not -name '.*' | sort
```

---

## Passo 4 — Detectar a pasta de frontend

Para cada pasta de primeiro nível, colete pistas do tipo de projeto:

```bash
# Para cada pasta encontrada:
cat "<MONOREPO>/<pasta>/package.json" 2>/dev/null | grep -E '"(@angular/core|react|react-dom|vue|next|@nestjs/core|express|fastify)"' 
```

**Heurística de frontend** (dependências): `@angular/core`, `react`, `react-dom`, `vue`, `next`.
Pistas complementares pelo nome da pasta: `front`, `frontend`, `web`, `app`, `ui`, `admin`, `portal`.

Proponha a pasta de frontend detectada e confirme:

```
Detectei que a pasta de frontend é:  front-vena  (Angular)

Está correto? (confirme, ou me diga qual é a pasta de frontend)
```

Aguarde confirmação/ajuste. Guarde como `FRONTEND`.

---

## Passo 5 — Criar o `.claude` no monorepo

Verifique se já existe:

```bash
test -d "<MONOREPO>/.claude" && echo "já existe" || echo "não existe"
```

- Se **não existir**, crie (mostre a ação antes):

  ```bash
  mkdir -p "<MONOREPO>/.claude"
  ```

- Se **já existir**, não sobrescreva nada — apenas informe que vai adicionar/atualizar o arquivo de estrutura no Passo 7.

---

## Passo 6 — Classificar API vs Front-end (com o usuário)

Para cada pasta de primeiro nível, proponha uma classificação em **`api`**, **`front`** ou **`outro`** (libs, infra, compartilhado).

**Heurística de API** (dependências / arquivos): `@nestjs/core`, `express`, `fastify`; presença de `controllers/`, `routes/`, `main.ts` de servidor.
**Front** já foi identificado no Passo 4.
**Outro:** libs compartilhadas, configs, pacotes utilitários.

Apresente a proposta como tabela e peça confirmação (o usuário pode corrigir cada linha):

```
Classificação proposta das pastas do monorepo:

  | Pasta            | Tipo   | Pista                     |
  |------------------|--------|---------------------------|
  | api-vena-core    | api    | NestJS                    |
  | front-vena       | front  | Angular                   |
  | shared-libs      | outro  | libs compartilhadas       |

Confirma essa classificação? (ou me diga o que ajustar, ex: "shared-libs é api")
```

Aguarde. Aplique os ajustes que o usuário pedir e reconfirme se necessário. Só prossiga com a classificação **100% confirmada**.

---

## Passo 7 — Salvar a classificação no `.claude`

Crie o arquivo canônico **`<MONOREPO>/.claude/estrutura.md`** (mostre o conteúdo antes de gravar). Este é o arquivo que o `/scope` valida no guard "`.claude` populado".

Formato:

```markdown
# Estrutura do Monorepo

<!-- Gerado por /setup. Base de conhecimento das fases seguintes. -->

- **Caminho:** /home/você/projetos/vena
- **Pasta de frontend principal:** front-vena
- **Configurado em:** AAAA-MM-DD HH:MM

## Classificação das pastas

| Pasta          | Tipo  | Observação            |
|----------------|-------|-----------------------|
| api-vena-core  | api   | NestJS                |
| front-vena     | front | Angular               |
| shared-libs    | outro | libs compartilhadas   |
```

Grave o arquivo e confirme:

```bash
cat "<MONOREPO>/.claude/estrutura.md"
```

---

## Passo 8 — Resumo Final

```
✅ /setup concluído

  MCP do Jira:     conectado ✓
  GitHub CLI:      autenticado ✓
  Monorepo:        /home/você/projetos/vena
  Frontend:        front-vena
  Pastas:          api-vena-core (api) · front-vena (front) · shared-libs (outro)
  Arquivo:         .claude/estrutura.md ✓

Ambiente pronto. Próximo passo: rode /scope para definir o escopo da alteração.
```
