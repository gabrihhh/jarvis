---
name: submit-folders
description: Cria branches, commita e faz push das alterações em todos os repositórios git filhos com mudanças locais pendentes
---

# /submit-folders — Submeter Alterações dos Repositórios Filhos

## Uso

```
/folder-submit qa
/folder-submit main
```

---

## REGRA GLOBAL

- Nunca executar `git add`, `commit` ou `push` sem aprovação explícita do usuário
- Nunca subir arquivos de ambiente ou segredos — bloquear e avisar sempre que encontrado
- Se travar em qualquer ponto — erro inesperado, ambiguidade — **pare e pergunte ao usuário**
- Tratar cada repositório de forma independente: um erro em um repo não impede os demais
- Sempre tentar usar o MCP do GitHub quando disponível; se não estiver, usar linha de comando

---

## Passo 1 — Ler argumento

O alvo é o branch passado como argumento: `qa` ou `main`.

Se nenhum argumento for fornecido, informe:
**"Qual o branch alvo? Use: `/folder-submit qa` ou `/folder-submit main`"**
Interrompa aqui.

Defina internamente:
- `BRANCH_ALVO` = argumento recebido (ex: `qa`)
- `LABEL` = argumento em maiúsculas (ex: `QA`)

---

## Passo 2 — Descobrir repositórios com alterações

Execute na pasta atual:

```bash
for d in */; do
  [ -d "${d}.git" ] && echo "${d%/}"
done
```

Para cada repositório encontrado, verifique se há alterações pendentes:

```bash
git -C <repo> status --short
```

Considere "com alterações" qualquer repo que retorne output não-vazio (arquivos modificados, staged, untracked).

Se nenhum repositório tiver alterações:
**"Nenhuma alteração encontrada nos repositórios de `$(pwd)`. Nada a submeter."**
Interrompa aqui.

---

## Passo 3 — Apresentar panorama e pedir confirmação

Liste os repositórios com alterações e o que cada um tem:

```
Repositórios com alterações pendentes:

  📦 api-service
     M  src/auth/login.js
     M  src/auth/middleware.js
     ?? src/utils/newHelper.js

  📦 frontend
     M  src/components/LoginForm.tsx
     D  src/components/OldModal.tsx

Total: 2 repositórios com alterações.

Deseja criar branches e submeter as alterações de todos eles?
```

Aguarde resposta:
- **Sim / confirmar / pode ir:** prossiga para o Passo 4
- **Não / cancelar / parar:** interrompa aqui sem modificar nada

---

## Passo 4 — Verificar arquivos de ambiente (BLOQUEIO DE SEGURANÇA)

Antes de qualquer `git add`, verifique em **cada repositório** se há arquivos sensíveis nas alterações:

```bash
# Arquivos modificados e não-rastreados
git -C <repo> diff --name-only
git -C <repo> ls-files --others --exclude-standard
```

Considere bloqueados arquivos que correspondam a qualquer um destes padrões:

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

Se encontrar qualquer arquivo bloqueado em algum repositório, **não prossiga** nesse repo. Informe:

```
⛔ Arquivo sensível detectado em <repo>:
   • .env.local
   • config/secrets.json

Esse repositório será ignorado por segurança.
Corrija o .gitignore ou remova os arquivos antes de tentar novamente.
```

Continue normalmente com os demais repositórios.

---

## Passo 5 — Coletar informações para cada repositório

Para cada repositório aprovado (sem arquivos sensíveis), **um de cada vez**:

**5.1 — Analisar diff e propor tudo de uma vez:**

```bash
git -C <repo> diff
git -C <repo> diff --cached
```

Com base no diff, decida autonomamente:
- **Tipo**: `fix` se for correção/ajuste, `feat` se for funcionalidade nova ou melhoria
- **Slug da branch**: camelCase curto que descreva a alteração (ex: `correcaoValidacaoToken`)
- **Título do commit**: breve, no padrão `<tipo>: [<LABEL>] <título>`
- **Descrição do commit**: o que foi feito e por quê, baseado no diff

Apresente tudo junto e pergunte **uma única vez**:

```
Repositório: api-service

  Branch:    fix/qa/correcaoValidacaoToken
  Commit:    fix: [QA] Correção na validação do token de autenticação

             Ajustado o middleware de autenticação para rejeitar tokens
             expirados corretamente. O comportamento anterior permitia
             tokens inválidos passarem em edge cases de timezone.

Posso subir assim? (ajuste o que quiser ou confirme para prosseguir)
```

Aguarde resposta:
- **Confirmar / sim / pode:** prossiga para o Passo 6 com esses dados
- **Ajuste pontual:** aplique e prossiga sem nova confirmação
- **Cancelar:** pule este repositório e siga para o próximo

---

## Passo 6 — Executar: branch, add, commit, push

Para cada repositório, com as informações coletadas:

**6.1 — Criar a branch:**

Tente via MCP do GitHub se disponível:
```
create_branch(repo: "<repo>", branch: "<nova-branch>", from: "<branch-alvo>")
```

Se o MCP não estiver disponível ou retornar erro, use CLI:
```bash
git -C <repo> checkout -b <nova-branch>
```

**6.2 — Adicionar arquivos:**

```bash
git -C <repo> add .
```

Confirme o que foi staged:
```bash
git -C <repo> status --short
```

Se arquivos inesperados aparecerem no stage (ex: arquivos que não estavam no resumo), avise o usuário antes de continuar.

**6.3 — Fazer commit:**

```bash
git -C <repo> commit -m "$(cat <<'EOF'
<tipo>: [<LABEL>] <título>

<descrição>
EOF
)"
```

Se o commit falhar (hook rejeitou, nada para commitar, etc.), informe o erro e pergunte o que fazer.

**6.4 — Fazer push:**

Tente via MCP do GitHub se disponível:
```
push_branch(repo: "<repo>", branch: "<nova-branch>")
```

Se o MCP não estiver disponível, use CLI:
```bash
git -C <repo> push origin <nova-branch>
```

Se o push falhar, informe o erro e pergunte ao usuário o que fazer.

---

## Passo 7 — Resumo Final

Ao concluir todos os repositórios, apresente o resultado:

```
Resumo — submit-folders <branch-alvo>

  ✅ api-service
     Branch:  fix/qa/correcaoValidacaoToken
     Commit:  fix: [QA] Correção na validação do token de autenticação
     Push:    origin/fix/qa/correcaoValidacaoToken ✓

  ✅ frontend
     Branch:  feat/qa/novaTelaLogin
     Commit:  feat: [QA] Nova tela de login com validação em tempo real
     Push:    origin/feat/qa/novaTelaLogin ✓

  ⛔ config-service  → ignorado (arquivo .env detectado)

Concluído. 2 branches criadas e publicadas, 1 ignorado por segurança.

Branches criadas:
  • fix/qa/correcaoValidacaoToken
  • feat/qa/novaTelaLogin
```
