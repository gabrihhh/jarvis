---
name: configure-memory
description: Configurar a arquitetura do grafo de memória semântica — personaliza o schema, regras e fluxos usados pelo /create-memory e /update-memory
---

# /configure-memory — Configurar Arquitetura de Memória

Você vai guiar o usuário para criar ou modificar a arquitetura do grafo de memória semântica.
O resultado será salvo em `~/.claude/skills/MEMORY_ARCHITECTURE.md`, substituindo o padrão e sendo usado pelo `/create-memory` e `/update-memory`.

## REGRA GLOBAL

- Nunca salvar sem aprovação explícita do usuário
- Se qualquer intenção do usuário for ambígua, pergunte antes de continuar
- Ao final, sempre mostrar o arquivo completo gerado antes de salvar

---

## Passo 0 — Ler arquitetura atual

Leia o arquivo `~/.claude/skills/MEMORY_ARCHITECTURE.md`.

Se não existir, informe: "Nenhuma arquitetura customizada encontrada. Usarei a arquitetura padrão como base."
Nesse caso, use o conteúdo padrão definido internamente (schema básico com Project, Module, File, Concept, Pattern, Dependency).

---

## Passo 1 — Entender a intenção

Apresente as duas opções ao usuário:

```
Como deseja proceder?

  1. Modificar a arquitetura atual (ajustar regras, schema ou convenções)
  2. Criar uma arquitetura do zero (descreva o que precisa)
```

Aguarde a resposta antes de continuar.

---

## Passo 2a — Se escolher "Modificar"

Mostre um resumo da arquitetura atual (schema e regras principais) e pergunte:

```
O que deseja modificar? Exemplos:
  • Adicionar/remover tipos de nó
  • Mudar regras de granularidade de módulo
  • Alterar convenções de naming (português/inglês, etc.)
  • Adicionar/remover tipos de relacionamento
  • Mudar critérios de qualidade
  • Ajustar regras de o que indexar/ignorar
```

Conduza a conversa até ter clareza completa sobre cada alteração desejada.
Se o usuário der uma instrução vaga ("quero algo mais simples"), faça perguntas de refinamento:
- "Simples em qual sentido? Menos tipos de nó? Menos regras?"
- "Pode me dar um exemplo do que ficaria fora?"

---

## Passo 2b — Se escolher "Do zero"

Conduza uma conversa estruturada com estas perguntas (adapte conforme as respostas):

**Sobre o domínio:**
- "Que tipo de projetos você vai indexar? (frontend, backend, monorepo, scripts, etc.)"
- "Qual linguagem/stack predominante?"
- "Qual o vocabulário do seu domínio? (ex: pedidos, clientes, eventos, pipelines)"

**Sobre o schema:**
- "Além de módulos e arquivos, quer rastrear algo mais? (ex: serviços externos, tabelas de banco, endpoints de API)"
- "Quer rastrear relacionamentos entre projetos diferentes?"
- "Padrões de design são relevantes para o seu contexto?"

**Sobre as regras:**
- "Qual é a granularidade ideal de módulo para você? (diretório? feature? domínio de negócio?)"
- "Há diretórios/arquivos específicos que sempre devem ser ignorados no seu contexto?"
- "Prefere conceitos em português, inglês ou misto?"

**Sobre os fluxos:**
- "Quer manter o fluxo de aprovação antes de salvar, ou prefere algo mais direto?"
- "O /update-memory deve sempre mostrar o delta ou pode salvar direto se as mudanças forem pequenas?"

Continue perguntando até ter uma visão clara e completa da arquitetura desejada.

---

## Passo 3 — Gerar a arquitetura

Com base na conversa, gere o arquivo completo `MEMORY_ARCHITECTURE.md` seguindo esta estrutura:

```markdown
# Memory Architecture — [título que reflita o contexto do usuário]

[descrição breve do propósito desta configuração]

---

## 1. Schema do Grafo

### Nodes
[tabela com nodes, propriedades e unicidade]

### Relationships
[diagrama em texto]

### Notas do schema
[decisões e justificativas]

---

## 2. Regras de Indexação

### O que É um módulo
[definição específica para o contexto do usuário]

### O que NÃO é um módulo
[exclusões]

### O que É um arquivo indexável
[critérios]

### O que NÃO indexar
[exclusões]

### Convenções de naming
[padrões de escrita para domain, concepts, patterns]

---

## 3. Fluxo de Criação (/create-memory)
[resumo do fluxo, com qualquer customização]

---

## 4. Fluxo de Atualização (/update-memory)
[resumo do fluxo, com qualquer customização]

---

## 5. Critérios de Qualidade

### Grafo saudável
[sinais positivos]

### Sinais de grafo poluído
[antipadrões a evitar]

---

## 6. Objeto canônico para save-project
[exemplo JSON com os campos relevantes para este contexto]
```

---

## Passo 4 — Apresentar para aprovação

Mostre o arquivo **completo** gerado ao usuário.

Diga: **"Esta é a arquitetura que vou salvar em `~/.claude/skills/MEMORY_ARCHITECTURE.md`. Revise, corrija o que quiser, e me diga 'pode salvar' quando estiver pronto."**

Se o usuário pedir ajustes:
- Aplique, mostre o trecho alterado
- Confirme: "Ajustei X. Mais alguma coisa antes de salvar?"
- Repita até aprovação

---

## Passo 5 — Salvar

Após aprovação explícita, salve o conteúdo gerado em:

```
~/.claude/skills/MEMORY_ARCHITECTURE.md
```

Informe ao usuário:
**"Arquitetura salva. O `/create-memory` e o `/update-memory` já vão usar essa configuração a partir de agora."**

Se quiser restaurar o padrão no futuro: **"Rode `jarvis --setup` novamente para reinstalar a arquitetura padrão."**
