---
name: worktree
description: Gerencia os workspaces isolados (git worktrees) dos planos — lista os planos ativos com branch/estado/PR e remove o workspace de um plano com segurança (checando trabalho não commitado/não enviado)
---

# /worktree — Workspaces dos Planos

## Uso

```
/worktree              # lista os workspaces ativos (um por plano)
/worktree clean plan-2 # remove o workspace do plan-2 (com checagem de segurança)
```

Cada plano roda em um **workspace isolado** criado pelo `/execute`: um `git worktree` por repo em `MONOREPO/.worktrees/plan-N/<repo>`. Isso permite **vários planos em paralelo** no mesmo monorepo. Este comando **lista** e **remove** esses workspaces — nada some sozinho.

---

## REGRA GLOBAL

- `MONOREPO` vem do `.claude/estrutura.md`.
- **Remover é destrutivo:** só remova um workspace após checar trabalho **não commitado** e **não enviado (unpushed)**, e **confirmar** com o usuário.
- **Nunca** apague a cópia principal (`MONOREPO/<repo>`) nem os **worktrees-base** (`MONOREPO/.worktrees/base/<qa|main>/`, usados pelo `/scope`) — este comando só lista e remove os worktrees **de plano** (`MONOREPO/.worktrees/plan-N/`).
- A remoção do workspace **não** fecha o card nem apaga a PR — só libera a pasta local.
- Se travar — worktree corrompido, path inesperado — **pare e pergunte**.

---

## Modo LISTAR — `/worktree` (sem argumentos)

Descubra os workspaces existentes:

```bash
ls -d "$MONOREPO"/.worktrees/plan-* 2>/dev/null | sed 's#.*/##'
```

Para **cada** `plan-N` encontrado, e para **cada** repo dentro de `$MONOREPO/.worktrees/plan-N/`, colete o estado:

```bash
WT="$MONOREPO/.worktrees/plan-N/<repo>"
git -C "$WT" rev-parse --abbrev-ref HEAD           # branch
git -C "$WT" status --porcelain | wc -l            # nº de arquivos alterados (0 = limpo)
git -C "$WT" log --oneline @{upstream}.. 2>/dev/null | wc -l   # commits não enviados
```

Enriqueça com o `index.json` de cada plan (`title`, `jira`, fase atual via `phases`) e, se útil, o estado da PR (`gh pr view "<BRANCH>" --json state,url` de dentro do worktree).

Apresente uma tabela:

```
Workspaces ativos:

  | Plano  | Título              | Card      | Branch            | Estado            | PR        |
  |--------|---------------------|-----------|-------------------|-------------------|-----------|
  | plan-2 | Otimização esteira  | VENA-223  | fix/main/VENA-223 | limpo             | OPEN      |
  | plan-3 | Filtro relatório    | VENA-230  | feat/qa/VENA-230  | 3 arq. alterados  | —         |

Para remover um workspace: /worktree clean plan-N
```

Se não houver nenhum workspace, informe `Nenhum workspace ativo.` e encerre.

---

## Modo LIMPAR — `/worktree clean plan-N`

### 1. Validar

```bash
test -d "$MONOREPO/.worktrees/plan-N" && echo "OK" || echo "não existe"
```

Se não existir, avise e encerre. Leia o `index.json` do plan para contexto (`title`, `jira`, `pr`).

### 2. Checar trabalho pendente (por repo)

Para **cada** repo do workspace:

```bash
WT="$MONOREPO/.worktrees/plan-N/<repo>"
git -C "$WT" status --porcelain                       # não commitado
git -C "$WT" log --oneline @{upstream}.. 2>/dev/null  # commits não enviados
```

- Se houver **não commitado** ou **não enviado** em algum repo: **avise claramente** e **pergunte** antes de continuar:
  ```
  ⚠️ plan-N tem trabalho pendente:
     - front-vena: 3 arquivos não commitados
     - api-vena-core: 1 commit não enviado (unpushed)

  Remover o workspace vai DESCARTAR o que não estiver no remote.
  Confirma a remoção mesmo assim? (sim / não)
  ```
  Só prossiga com **sim** explícito.

- Se tudo estiver **limpo e enviado**, confirme uma vez:
  ```
  plan-N está limpo e enviado. Remover o workspace? (sim / não)
  ```

### 3. Remover os worktrees

Ao confirmar, para **cada** repo:

```bash
git -C "$MONOREPO/<repo>" worktree remove "$MONOREPO/.worktrees/plan-N/<repo>" --force
git -C "$MONOREPO/<repo>" worktree prune
```

> `--force` é necessário quando o usuário confirmou remover mesmo com pendências; sem pendências ele também funciona.

Depois, remova a pasta-raiz do plano se tiver ficado vazia:

```bash
rmdir "$MONOREPO/.worktrees/plan-N" 2>/dev/null || true
```

### 4. Registrar no `index.json`

Faça **read-modify-write** no `index.json` do plan registrando que o workspace foi removido (com data), sem apagar o resto — ex.: `workspace.removedAt = "<data>"`:

```bash
date '+%Y-%m-%d %H:%M'
```

### 5. Resumo

```
✅ /worktree clean plan-N concluído

  Workspace removido:  $MONOREPO/.worktrees/plan-N
  Repos liberados:     api-vena-core, front-vena
  Card/PR:             intactos (não foram alterados)
```
