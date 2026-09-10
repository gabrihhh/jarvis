# 📋 Plano N — {Título da alteração}

> Painel de progresso do plano. **Todo comando lê e atualiza este arquivo.** É a fonte de verdade do andamento.

## Identificação
- **Pasta:** plan-N
- **Título:** {título baseado no escopo}
- **Tipo:** fix            <!-- fix | feat -->
- **Branch base:** main    <!-- main | qa -->
- **Branch de trabalho:** {tipo}/{base}/{card}   <!-- ex: fix/main/VENA-223 -->
- **Organização (Jira):** {org}
- **Card:** {VENA-223} — {url do card}
- **PR:** {#162} — {url da PR}
- **Repositórios:** {repo-a, repo-b}   <!-- multi-repo: mesmo card/branch/título -->

## Progresso
<!-- status: ⬜ pendente | 🔄 em andamento | ✅ concluído -->
| Fase          | Status          | Início            | Fim               |
|---------------|-----------------|-------------------|-------------------|
| /scope        | ⬜ pendente      | —                 | —                 |
| /blueprint    | ⬜ pendente      | —                 | —                 |
| /card         | ⬜ pendente      | —                 | —                 |
| /execute      | ⬜ pendente      | —                 | —                 |
| /create-test  | ⬜ pendente      | —                 | —                 |

## Testes (definidos no /scope)
- **Stack unit:** {ex: Jest}
- **Stack e2e:** {ex: Playwright}
- **Cenários:**
  - e2e: {cenário}
  - unit: {cenário}

## Rodadas de review (/resolve-reviewer)
<!-- uma linha por rodada; nunca sobrescrever, sempre adicionar -->
| Rodada | Quando            | Resumo                                   |
|:------:|-------------------|------------------------------------------|
| —      | —                 | —                                        |

## Artefatos
- 📄 Especificação → spec.md
- 🛠️ Plano de implementação → plano-implementacao.md
- 🧪 Guia de teste → guia-de-teste.md

---
<!--
REGRAS DE ATUALIZAÇÃO (para os comandos):
- Cada fase, ao iniciar, marca seu status como "🔄 em andamento" e grava Início.
- Ao concluir, marca "✅ concluído" e grava Fim.
- GUARD de pré-requisito: uma fase só roda se a fase anterior estiver "✅ concluído"
  na tabela Progresso; senão, sugere rodar o comando anterior e encerra.
- /resolve-reviewer é avulso: NÃO altera a tabela Progresso; adiciona 1 linha em
  "Rodadas de review" a cada acionamento (rodada 1, 2, 3...).
- Datas no formato: AAAA-MM-DD HH:MM.
-->
