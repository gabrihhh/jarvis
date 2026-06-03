---
name: submit-folder
description: Detecta o branch base (qa/main), pergunta se é fix ou feature, cria branch no padrão, faz commit com descrição e push — tudo no repositório atual
---

# /submit-folder — Submeter Alterações do Repositório Atual

## Uso

```
/submit-folder
```

Sem argumentos. O comando detecta automaticamente o branch base.

---

## REGRA GLOBAL

- Nunca executar `git add`, `commit` ou `push` sem aprovação explícita do usuário
- Nunca subir arquivos de ambiente ou segredos — bloquear e avisar sempre que encontrado
- Se travar em qualquer ponto — erro inesperado, ambiguidade — **pare e pergunte ao usuário**
- Sempre mostrar o que será feito antes de executar qualquer ação destrutiva

---

## Passo 1 — Verificar repositório e alterações

Confirme que o diretório atual é um repositório git:

```bash
git rev-parse --is-inside-work-tree 2>/dev/null
```

Se não for um repositório git, informe:
**"Este diretório não é um repositório git. Navegue para um repositório antes de usar `/submit-folder`."**
Interrompa aqui.

Verifique se há alterações pendentes:

```bash
git status --short
```

Se não houver nenhuma alteração (output vazio):
**"Nenhuma alteração pendente encontrada. Nada a submeter."**
Interrompa aqui.

---

## Passo 2 — Detectar branch base (qa ou main)

Execute os comandos abaixo para determinar a origem das alterações:

```bash
# Branch atual
git branch --show-current

# Verificar relação com qa e main
git log --oneline origin/qa..HEAD 2>/dev/null | wc -l
git log --oneline origin/main..HEAD 2>/dev/null | wc -l
```

**Lógica de detecção:**

1. Se o branch atual **é** `qa` ou `main` → esse é o `BRANCH_BASE`
2. Se o branch atual é outro (ex: já numa feature branch):
   - Calcule quantos commits existem desde cada base
   - O branch com **menos commits de distância** é o `BRANCH_BASE`
   - Em caso de empate, use `git merge-base` para confirmar:
     ```bash
     git merge-base HEAD origin/qa
     git merge-base HEAD origin/main
     # Compare qual merge-base é mais recente (mais próximo de HEAD)
     git rev-list --count <merge-base-qa>..HEAD
     git rev-list --count <merge-base-main>..HEAD
     ```
3. Se `origin/qa` não existir, use `main` como `BRANCH_BASE`
4. Se nenhum dos dois existir no remote, pergunte ao usuário:
   **"Não encontrei `origin/qa` nem `origin/main`. Qual é o branch base das suas alterações?"**

Defina internamente:
- `BRANCH_BASE` = `qa` ou `main`
- `LABEL` = `QA` ou `MAIN`

---

## Passo 3 — Verificar arquivos sensíveis (BLOQUEIO DE SEGURANÇA)

Antes de qualquer `git add`, verifique se há arquivos sensíveis nas alterações:

```bash
git diff --name-only
git diff --cached --name-only
git ls-files --others --exclude-standard
```

Bloqueie arquivos que correspondam a qualquer um destes padrões:

```
.env
.env.*
*.env
*.pem
*.key
*.p12
*.pfx
secrets.*
*secret*
*credentials*
*password*
*.token
```

Se encontrar qualquer arquivo bloqueado, **não prossiga**. Informe:

```
⛔ Arquivo sensível detectado:
   • .env.local
   • config/secrets.json

Corrija o .gitignore ou remova os arquivos antes de tentar novamente.
```

Interrompa aqui.

---

## Passo 4 — Analisar o que foi alterado

Execute:

```bash
git diff
git diff --cached
git status --short
```

Com base no diff, entenda:
- Quais arquivos foram modificados, adicionados ou removidos
- Qual o propósito das alterações (correção de bug, nova funcionalidade, ajuste, etc.)

---

## Passo 5 — Perguntar tipo (fix ou feature)

Apresente um resumo do que foi encontrado e pergunte:

```
Branch base detectado: qa  (ou main)

Alterações encontradas:
  M  src/auth/login.ts
  M  src/auth/middleware.ts
  ?? src/utils/tokenHelper.ts

Isso é um fix ou uma feature?
  [1] fix   — correção de bug, ajuste, hotfix
  [2] feat  — nova funcionalidade, melhoria, adição
```

Aguarde resposta do usuário. Aceite variações como:
- "fix", "1", "correção", "bug" → `TIPO = fix`, `PREFIXO_COMMIT = fix:`
- "feat", "feature", "2", "funcionalidade", "melhoria" → `TIPO = feat`, `PREFIXO_COMMIT = feat:`

---

## Passo 6 — Propor branch, commit e descrição

Com base no diff e no tipo confirmado, proponha:

**Branch** no padrão: `<tipo>/<branch_base>/<slugCamelCase>`
- Slug em camelCase, curto (3–5 palavras), descritivo do que foi feito
- Exemplos: `correcaoValidacaoToken`, `novaTelaLogin`, `ajusteMiddlewareAuth`

**Commit** no padrão: `<prefixo_commit> [<LABEL>] <Título breve>`
- Título em português, conciso, sem ponto final
- Exemplos: `fix: [QA] Correção na validação do token`, `feat: [MAIN] Nova tela de login`

**Descrição do commit**: 3–6 linhas explicando o que foi alterado e por quê, baseado no diff.

Apresente tudo de uma vez e pergunte uma única confirmação:

```
Detectei: branch base = qa | tipo = fix

  Branch:    fix/qa/correcaoValidacaoToken
  Commit:    fix: [QA] Correção na validação do token de autenticação

             Ajustado o middleware de autenticação para rejeitar tokens
             expirados corretamente. O comportamento anterior permitia
             tokens inválidos em edge cases de timezone.
             Adicionado helper `tokenHelper.ts` para centralizar validação.

Posso criar a branch, commitar e fazer push? (confirme ou ajuste o que quiser)
```

Aguarde resposta:
- **Confirmar / sim / pode:** prossiga para o Passo 7 com esses dados
- **Ajuste pontual (ex: "muda o nome da branch para X"):** aplique e prossiga sem nova confirmação
- **Cancelar:** interrompa sem modificar nada

---

## Passo 7 — Executar: criar branch, add, commit, push

### 7.1 — Criar a branch a partir do branch base

```bash
git checkout -b <nova-branch> origin/<branch-base>
```

Se `origin/<branch-base>` não existir localmente:
```bash
git fetch origin <branch-base>
git checkout -b <nova-branch> origin/<branch-base>
```

Se a branch já existir, informe o usuário e pergunte se quer usar um nome diferente.

### 7.2 — Adicionar arquivos

```bash
git add .
```

Confirme o que foi staged:
```bash
git status --short
```

Se arquivos inesperados aparecerem no stage (que não estavam no resumo), avise antes de continuar.

### 7.3 — Fazer commit com mensagem e descrição

```bash
git commit -m "$(cat <<'EOF'
<prefixo>: [<LABEL>] <título>

<descrição>
EOF
)"
```

Se o commit falhar (hook rejeitou, nada para commitar, etc.), informe o erro e pergunte o que fazer.

### 7.4 — Fazer push

```bash
git push origin <nova-branch>
```

Se o push falhar, informe o erro e pergunte ao usuário o que fazer.

---

## Passo 8 — Resumo Final

```
✅ submit-folder concluído

  Branch base:  qa
  Tipo:         fix
  Branch:       fix/qa/correcaoValidacaoToken
  Commit:       fix: [QA] Correção na validação do token de autenticação
  Push:         origin/fix/qa/correcaoValidacaoToken ✓
```
