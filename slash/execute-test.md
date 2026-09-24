---
name: execute-test
description: Executa o roteiro do create-test contra o ambiente qa — sobe a app localmente, reproduz cada passo via Playwright MCP (front) e chamadas HTTP (api), captura evidências redigidas, comenta no card do Jira e registra o progresso no index.json
---

# /execute-test — Execução do Roteiro de Teste (Fase 7)

## Uso

```
/execute-test            # usa o plan ativo (mais recente)
/execute-test plan-3     # opcional: especifica o plan
```

É a **FASE 7** do fluxo (depois de `/create-test`). Sobe a app **localmente contra qa**, executa o **roteiro estruturado** gerado pelo `/create-test`, captura **evidências redigidas** (prints antes/depois + request/response mascarados) em `plans/plan-N/evidencias/`, comenta o resultado no **card do Jira** e registra o progresso no `index.json`.

---

## REGRA GLOBAL

- Esta fase **não altera código de produto** — só sobe a app, executa o roteiro e documenta.
- **Guard:** só roda se o `/create-test` estiver **concluído** (`phases["create-test"].done === true`).
- **Ambiente:** default **qa**. Em **prd nada é executado** — só se documenta o que seria feito.
- **Guardrails por efeito real:** em qa, **DELETE / ações destrutivas** são *documentado-mas-não-executado*. O bloqueio é pelo **efeito** da ação (um clique de UI que dispara deleção conta), não só pelo rótulo `operacao`.
- **Segredos:** **nunca** peça senha no chat, **nunca** ecoe valores do `.env` no transcript. Redação **antes** de qualquer escrita em disco ou postagem no Jira.
- **Credenciais:** lidas do `.env` de cada repo **em runtime**, pelos **nomes** de variável definidos no `jarvis-test-settings.md`. Variável ausente → **parar e orientar**.
- **MCP:** requer **Playwright MCP** apenas se o roteiro tiver algum passo `tipo:front`; requer **MCP do Jira** para comentar no card.
- **Escrita atômica no `index.json`:** read-modify-write com **tmp+rename** (`write .tmp → mv`), não a ferramenta Write simples — planos rodam em worktrees paralelas e uma escrita parcial corromperia o estado. Preserve todas as outras fases.
- **Teardown garantido:** ao fim — **inclusive em erro ou interrupção** — derrube a app local que você subiu. Nunca deixe app de teste exposta.
- Se travar — app não sobe, health não responde, variável ausente, ambiguidade — **pare e pergunte**.

---

## Passo 1 — Plan ativo e leitura

`MONOREPO` vem do `.claude/estrutura.md`. Determine `plan-N`: se o kanban passou `JARVIS_PLAN`, use-o; senão o argumento; senão o mais recente:

```bash
echo "${JARVIS_PLAN:-}"
ls -d "$MONOREPO"/plans/plan-* 2>/dev/null | sed 's#.*/plan-##' | sort -n | tail -1
cat "$MONOREPO/plans/plan-$N/index.json"
cat "$MONOREPO/plans/plan-$N/spec.md"
cat "$MONOREPO/plans/plan-$N/guia-de-teste.md"
```

Extraia do `index.json`: **título** (`title`), **id do card** (`jira` → `CARD_ID`), **repos** envolvidos. Do `guia-de-teste.md`, extraia o **bloco roteiro estruturado** (a tabela `passo/tipo/rota/elemento/acao/antes/depois/operacao`) — é a fonte da execução.

- Se **não houver** bloco roteiro no `guia-de-teste.md`: **pare e peça** para rodar `/create-test` novamente (versão que gera o roteiro).

Registre o início:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `INICIO_ET`.

---

## Passo 2 — Guard: `/create-test` concluído?

No `index.json`, verifique `phases["create-test"].done`.

- Se **não** for `true`:
  ```
  ⚠️ O /create-test deste plano não está concluído.
  Rode /create-test antes de usar /execute-test.
  ```
  Interrompa aqui.

- Se for `true`, faça **read-modify-write atômico** no `index.json` marcando `phases["execute-test"].startedAt = "<INICIO_ET>"` (preservando o resto — ver Passo 13 para o padrão tmp+rename) e siga.

> Se a chave `phases["execute-test"]` ainda não existir no `index.json` (planos criados antes desta fase), crie-a agora com `{ "done": false, "startedAt": "<INICIO_ET>", "finishedAt": null }`, sem tocar nas demais.

---

## Passo 3 — Seleção de ambiente

Pergunte o alvo, **default qa**:

```
Contra qual ambiente rodar o teste?
  [1] qa   (default) — sobe a app local apontando para qa e executa o roteiro
  [2] prd  — NÃO executa nada; apenas documenta o que seria feito
```

Guarde `AMBIENTE` (`qa`|`prd`). Em **prd**, os Passos 7–9 **não sobem app nem executam** — cada passo do roteiro é apenas documentado como *não-executado (prd)*.

---

## Passo 4 — Mini-setup do `jarvis-test-settings.md` (por repo)

Para cada repo envolvido, verifique se existe `jarvis-test-settings.md` na **raiz do repo**:

```bash
test -f "$MONOREPO/<repo>/jarvis-test-settings.md" && echo "OK" || echo "FALTA"
```

- **Existe:** leia e reutilize (não pergunte nada).
- **Falta:** rode um **wizard interativo** e pergunte, um a um:
  - **comando(s) para subir a app** apontando para qa (ex.: `npm run start:qa`);
  - **porta / URL local** onde a app fica acessível (ex.: `http://localhost:3000`);
  - **endpoint de health** para saber que subiu (ex.: `GET /health`);
  - **tempo de boot** esperado (timeout do poll, ex.: `60s`);
  - **como apontar o front→api local** (qual variável de env sobrescrever em runtime, ex.: `API_URL=http://localhost:4000`);
  - **nomes das variáveis** do usuário de teste no `.env` (ex.: `TEST_USER`, `TEST_PASS`) — **apenas os nomes, nunca os valores**;
  - **fonte de log** opcional (arquivo/comando), se houver;
  - **referência documental de prd** (link/nota de onde validar em prd), se houver.

  Grave o `jarvis-test-settings.md` na raiz do repo e **garanta o gitignore** dele:

  ```bash
  grep -qxF 'jarvis-test-settings.md' "$MONOREPO/<repo>/.gitignore" 2>/dev/null \
    || echo 'jarvis-test-settings.md' >> "$MONOREPO/<repo>/.gitignore"
  ```

Execuções seguintes apenas **leem** o arquivo.

---

## Passo 5 — Credenciais do `.env` (em runtime)

Leia o `.env` de cada repo **em runtime**, buscando **pelos nomes de variável** definidos no settings — **sem** imprimir os valores no transcript:

```bash
# exemplo: carregar sem ecoar (nunca use `cat .env` nem `echo "$TEST_PASS"`)
set -a; . "$MONOREPO/<repo>/.env" 2>/dev/null; set +a
[ -n "$TEST_USER" ] && [ -n "$TEST_PASS" ] && echo "credenciais OK" || echo "credencial ausente"
```

- Variável ausente → **pare e oriente** o usuário a preencher o `.env` (diga **qual nome** falta, nunca peça o valor no chat).

---

## Passo 6 — Guardrails de ambiente

Decida a execução de cada passo pelo **efeito real** (mutação por UI conta, não só o rótulo `operacao`):

| Ambiente | GET / leitura | POST · PUT · PATCH | DELETE / destrutivo |
|---|---|---|---|
| **prd** | não executa (documenta) | não executa (documenta) | não executa (documenta) |
| **qa**  | executa | executa direto (sem confirmar passo a passo) | **não executa** → *documentado-mas-não-executado* |

- Em **qa**, passos permitidos (GET/POST/PUT/PATCH sem efeito destrutivo) rodam **direto**, sem pedir confirmação a cada passo.
- Passos destrutivos (ou cliques de UI que disparam deleção) são **documentados** com o motivo, marcados *documentado-mas-não-executado*.

---

## Passo 7 — Ciclo de vida da app (só qa)

> **prd:** pule este passo inteiro — nada sobe.

Para cada repo a subir (ordem **api antes do front** em full-stack):

1. Suba a app com o comando do settings, apontando para qa.
2. **Poll no health** até o `endpoint de health` responder OK ou estourar o `tempo de boot`.
   - App não sobe / health não responde no timeout → **pare e pergunte** (não siga com app meio-morta).
3. Em full-stack, suba a **api primeiro**; ao subir o **front**, aponte `front→api local` via **override de env em runtime** (a variável do settings) — **nunca** edite arquivo versionado.

Registre os PIDs / handles dos processos que você subiu para o **teardown** do Passo final.

---

## Passo 8 — Captura front (passos `tipo:front`, Playwright MCP)

> Só se houver passo `tipo:front`. Playwright MCP ausente e roteiro tem passo `front` → **oriente e pare**.

Para cada passo `front` (respeitando os guardrails do Passo 6):
- navegue até a `rota`, faça login com as credenciais lidas em runtime;
- **print ANTES** (estado X) → salve como `plans/plan-N/evidencias/passo-<n>-antes.png`;
- execute a `acao` no `elemento`;
- **print DEPOIS** (estado Y) → salve como `plans/plan-N/evidencias/passo-<n>-depois.png`.

Passos destrutivos: **não** execute a ação — capture só o print ANTES e anote *documentado-mas-não-executado*.

---

## Passo 9 — Captura api (passos `tipo:api`)

Para cada passo `api` (respeitando os guardrails):
- dispare a chamada `<MÉTODO> <endpoint>` com o body do roteiro;
- capture **request** (método, URL, headers, body) **e response** (status, corpo);
- para passos de **mutação**, capture o estado **antes/depois** via um **GET de leitura** quando existir;
- **log**: só colete se o settings definir uma fonte; senão, anote *"sem fonte de log"*.

Passos destrutivos: **não** dispare — documente o request que seria enviado, marcado *documentado-mas-não-executado*.

---

## Passo 10 — Redação obrigatória de segredos

**Antes** de gravar qualquer coisa em disco **ou** postar no Jira, mascare em **request e response**:
- headers `Authorization`, `Cookie`, `Set-Cookie`;
- tokens / bearer;
- campos de body como `password`, `token`, `secret`, `apiKey` e similares.

Substitua o valor por `***REDACTED***`. Se tiver dúvida se algo é sensível, **redija**. Nunca grave um valor de `.env` em texto claro.

---

## Passo 11 — Destino das evidências

Grave tudo em `plans/plan-N/evidencias/`:
- os prints `.png` (antes/depois de cada passo `front`);
- um `evidencias.md` com **resumo por passo**: o que era esperado (antes X → depois Y), o que aconteceu, embutindo os prints e os pares **request/response redigidos**, marcando claramente os passos *documentado-mas-não-executado*.

Garanta o **gitignore** das evidências:

```bash
grep -qxF 'plans/*/evidencias/' "$MONOREPO/.gitignore" 2>/dev/null \
  || echo 'plans/*/evidencias/' >> "$MONOREPO/.gitignore"
```

---

## Passo 12 — Comentário no card

Se houver `jira` (`CARD_ID`) no index e o MCP do Jira estiver conectado, poste um comentário (`addCommentToJiraIssue`) com:
- o resultado do teste em linguagem clara (o que passou, o que foi documentado-mas-não-executado);
- **referência aos arquivos locais** de evidência (`plans/plan-N/evidencias/`);
- todo conteúdo já **redigido** (Passo 10).

> Anexo de imagem: **best-effort** — o MCP Atlassian disponível posta **texto**; se não houver tool de upload confirmada, comente em texto apontando os arquivos locais.

Sem `jira` no index → **salve as evidências localmente e avise** que não comentou (não há card vinculado).

---

## Passo 13 — Atualizar o `index.json` (escrita atômica)

Registre o fim:

```bash
date '+%Y-%m-%d %H:%M'
```
Guarde como `FIM_ET`.

Faça **read-modify-write com tmp+rename** (não a ferramenta Write simples), preservando todas as outras fases:

```bash
IDX="$MONOREPO/plans/plan-$N/index.json"
# 1) leia o objeto inteiro, 2) altere SÓ os campos desta fase, 3) grave em .tmp, 4) mv atômico
#    (use node/jq para editar; o exemplo abaixo é o esqueleto — nunca edite outra fase)
node -e '
  const fs=require("fs"); const p=process.argv[1];
  const o=JSON.parse(fs.readFileSync(p,"utf8"));
  o.phases=o.phases||{}; o.phases["execute-test"]=o.phases["execute-test"]||{};
  o.phases["execute-test"].done=true;
  o.phases["execute-test"].startedAt=process.argv[2];
  o.phases["execute-test"].finishedAt=process.argv[3];
  o.artifacts=o.artifacts||{}; o.artifacts.evidence="evidencias/";
  fs.writeFileSync(p+".tmp", JSON.stringify(o,null,2)+"\n");
  fs.renameSync(p+".tmp", p);
' "$IDX" "$INICIO_ET" "$FIM_ET"
```

Campos alterados: `phases["execute-test"].done=true` · `.startedAt` · `.finishedAt` · `artifacts.evidence="evidencias/"`.

---

## Passo 14 — Resumo Final

```
✅ /execute-test concluído

  Plano:      plan-N — <título>
  Ambiente:   <qa | prd>
  Executados: <N passos executados>   ·   Documentados (não-executados): <M>
  Evidências: plans/plan-N/evidencias/  (prints + evidencias.md redigido)
  Card:       <CARD_ID — comentário postado ✓ | sem card — salvo localmente>
  App local:  derrubada (teardown ✓)
  Duração:    <INICIO_ET> → <FIM_ET>

Fluxo linear concluído. Rode /done para encerrar o plano.
(Se o reviewer deixar feedback na PR, use /resolve-reviewer.)
```
