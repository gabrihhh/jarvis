---
name: reset-folder
description: Reseta todos os repositórios git filhos da pasta atual para um branch específico (qa/main), tratando alterações locais de forma interativa
---

# /reset-folder — Sincronizar Repositórios para um Branch

## Uso

```
/reset-folder qa
/reset-folder main
```

---

## REGRA GLOBAL

- Nunca executar `checkout`, `pull`, `stash` ou `reset` sem que o comportamento esperado esteja claro
- Se travar em qualquer ponto — conflito inesperado, permissão negada, output estranho — **pare e pergunte ao usuário** antes de continuar
- Tratar cada repositório de forma independente: um erro em um repo não deve impedir a execução nos demais

---

## Passo 1 — Ler argumento

O branch alvo é o argumento passado após `/reset-folder`. Exemplos: `qa`, `main`.

Se nenhum argumento for fornecido, informe:
**"Qual branch deseja usar? Use: `/reset-folder qa` ou `/reset-folder main`"**
Interrompa aqui.

---

## Passo 2 — Descobrir repositórios

Execute na pasta atual:

```bash
for d in */; do
  [ -d "${d}.git" ] && echo "${d%/}"
done
```

Se nenhum repositório for encontrado:
**"Nenhum repositório git encontrado como subpasta direta de `$(pwd)`. Certifique-se de estar na pasta pai correta."**
Interrompa aqui.

---

## Passo 3 — Escanear status de cada repositório

Para cada repositório encontrado, colete as informações abaixo **sem modificar nada ainda**:

```bash
# Branch atual
git -C <repo> branch --show-current

# Alterações locais (staged + unstaged + untracked)
git -C <repo> status --short

# Branch alvo existe localmente ou no remote?
git -C <repo> show-ref --verify --quiet refs/heads/<branch> 2>/dev/null \
  || git -C <repo> ls-remote --heads origin <branch> 2>/dev/null | grep -q .
# exit 0 = existe, exit 1 = não existe
```

Para repositórios com alterações locais, verifique se as mudanças já foram enviadas ao remote da branch atual:

```bash
git -C <repo> fetch origin <branch-atual> 2>/dev/null
git -C <repo> diff origin/<branch-atual>
```

Se o diff for vazio, as alterações já estão no remote — descarte automaticamente sem perguntar:

```bash
git -C <repo> checkout -- .
git -C <repo> clean -fd
```

Classifique cada repositório em uma das categorias:

| Categoria | Critério |
|---|---|
| `PRONTO` | Branch existe, sem alterações locais |
| `AUTO-DESCARTADO` | Tinha alterações locais, mas já estavam no remote — descartado automaticamente |
| `COM ALTERAÇÕES` | Branch existe, tem mudanças locais que ainda não subiram ao remote |
| `SEM BRANCH` | Branch alvo não existe no repo |

---

## Passo 4 — Apresentar panorama ao usuário

Antes de qualquer ação, mostre o resumo completo:

```
Repositórios encontrados em <pasta atual>:

  ✅ PRONTOS (serão atualizados automaticamente):
     • api-service        [main → qa]
     • frontend           [main → qa]

  🔄 AUTO-DESCARTADOS (alterações já estavam no remote — descartadas automaticamente):
     • worker             [qa]  — 1 arquivo (já sincronizado com origin/qa)

  ⚠️  COM ALTERAÇÕES LOCAIS (aguardando decisão):
     • backend            [qa]  — 3 arquivos modificados

  ✗  SEM BRANCH "qa" (serão ignorados):
     • legacy-app         — branch "qa" não encontrado

Total: 5 repositórios | 2 prontos | 1 auto-descartado | 1 com alterações | 1 sem branch
```

**Se não houver nenhum repositório COM ALTERAÇÕES:** prossiga automaticamente para o Passo 6, sem pedir confirmação.

**Se houver repositórios COM ALTERAÇÕES:** pergunte: **"Posso prosseguir? Vou tratar os repositórios com alterações um a um antes de continuar."** e aguarde confirmação antes de continuar.

---

## Passo 5 — Tratar repositórios COM ALTERAÇÕES (interativo)

Para cada repositório da categoria `COM ALTERAÇÕES`, **um de cada vez**:

**5.1 — Mostrar o que mudou:**

```bash
git -C <repo> status --short
git -C <repo> diff --stat
```

Apresente ao usuário:

```
Repositório: backend  (branch atual: qa)

Arquivos modificados:
  M  src/auth/login.js
  M  src/auth/middleware.js
  ?? src/auth/newfile.js

O que deseja fazer com essas alterações?

  [1] Stash — guardar as alterações e continuar o reset (pode recuperar depois)
  [2] Commit — fazer commit das alterações no branch atual antes de mudar
  [3] Descartar — apagar todas as alterações locais (irreversível)
  [4] Pular — deixar este repositório como está, sem alterar
```

**5.2 — Executar conforme escolha:**

- **[1] Stash:**
  ```bash
  git -C <repo> stash push -m "reset-folder: stash antes de mudar para <branch> — $(date +%Y-%m-%d)"
  ```
  Confirme que o stash foi criado. Se falhar, informe e pergunte o que fazer.

- **[2] Commit:**
  Pergunte: **"Qual mensagem de commit para as alterações em `<repo>`?"**
  Aguarde a resposta, então:
  ```bash
  git -C <repo> add -A
  git -C <repo> commit -m "<mensagem do usuário>"
  ```
  Se falhar (ex: nada para commitar, hook rejeitou), informe o erro e pergunte o que fazer.

- **[3] Descartar:**
  Confirme com o usuário: **"Confirma que deseja DESCARTAR todas as alterações em `<repo>`? Isso é irreversível."**
  Só prossiga após confirmação explícita:
  ```bash
  git -C <repo> checkout -- .
  git -C <repo> clean -fd
  ```

- **[4] Pular:**
  Marque o repo como `PULADO` no resumo final. Não execute nada nele.

---

## Passo 6 — Executar checkout + pull

Para cada repositório das categorias `PRONTO` e `COM ALTERAÇÕES` (que não foi pulado):

```bash
# Mudar para o branch alvo
git -C <repo> checkout <branch>
```

Se o checkout falhar:
**"Erro ao fazer checkout em `<repo>`: <mensagem de erro>. O que deseja fazer?"**
Aguarde instrução antes de tentar o pull.

```bash
# Atualizar com o remote
git -C <repo> pull origin <branch>
```

Se o pull gerar conflito:
**"Conflito de merge em `<repo>` ao fazer pull de `<branch>`. Os conflitos estão em: <arquivos>. O que deseja fazer?"**
Opções sugeridas: resolver manualmente, usar `--ours`, abortar o merge.

---

## Passo 7 — Resumo Final

Ao concluir, apresente o resultado de cada repositório:

```
Resumo — reset-folder <branch>

  ✅ api-service      → <branch> atualizado  (pull: 3 commits novos)
  ✅ frontend         → <branch> atualizado  (pull: já estava atualizado)
  ✅ backend          → <branch> atualizado  (stash criado antes do pull)
  🔄 worker           → <branch> atualizado  (alterações locais já estavam no remote — descartadas automaticamente)
  ⏭️  legacy-app      → ignorado             (branch "<branch>" não existe)

Concluído. 4 repositórios atualizados, 1 ignorado.
```

Se algum repositório ficou com stash pendente, lembre o usuário:
**"O repositório `<repo>` tem um stash salvo com as alterações anteriores. Use `git stash pop` dentro dele quando quiser recuperá-las."**
