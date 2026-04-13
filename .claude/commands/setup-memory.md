# Setup Memory — Preparar ambiente Neo4j e MCP Server

Você vai configurar o ambiente de memória semântica para o Claude Code. Siga este fluxo exato, passo a passo.

## REGRA GLOBAL
Se travar em qualquer etapa — erro inesperado, permissão negada, output estranho — **pare e pergunte ao usuário o que deve ser feito** antes de continuar.

---

## Passo 1 — Verificar Docker

Execute:
```bash
docker --version
```

**Se não instalado:**
- Pergunte: "Docker não encontrado. Posso tentar instalar agora? (requer sudo)"
- Se aprovado, detecte o OS (`cat /etc/os-release` ou `uname -a`) e instale:
  - Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y docker.io`
  - Fedora/RHEL: `sudo dnf install -y docker`
  - macOS: instrua a instalar Docker Desktop manualmente e aguarde confirmação do usuário
  - Se a instalação falhar por qualquer motivo: informe o erro, forneça o link https://docs.docker.com/get-docker/ e aguarde o usuário confirmar que instalou antes de continuar

Execute:
```bash
docker info
```

**Se daemon não rodando:**
- Pergunte: "Docker está instalado mas não está rodando. Posso iniciar? (requer sudo)"
- Se aprovado:
  - Linux: `sudo systemctl start docker`
  - macOS: instrua a abrir o Docker Desktop
- Se falhar: pergunte ao usuário o que fazer

---

## Passo 2 — Verificar container Neo4j

Execute:
```bash
docker ps -a --filter name=claude-memory --format "{{.Status}}"
```

- Se retornar linha começando com `Up`: container já está rodando → **pule para o Passo 4**
- Se retornar linha começando com `Exited`: execute `docker start claude-memory` e aguarde 10s antes de continuar
- Se não retornar nada: siga para o Passo 3

---

## Passo 3 — Subir Neo4j (primeira vez)

Execute:
```bash
docker run -d \
  --name claude-memory \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/claudememory \
  --restart unless-stopped \
  neo4j:latest
```

Aguarde Neo4j estar pronto com polling (até 60 segundos):
```bash
for i in $(seq 1 12); do
  docker exec claude-memory cypher-shell -u neo4j -p claudememory "RETURN 1" 2>/dev/null && echo "Neo4j pronto!" && break
  echo "Aguardando Neo4j iniciar... ($i/12)"
  sleep 5
done
```

Se não ficar pronto após 60 segundos: pergunte ao usuário o que fazer.

---

## Passo 4 — Registrar MCP Server

Descubra o caminho absoluto do bin `jarvis-memory`:
```bash
which jarvis-memory 2>/dev/null || realpath bin/jarvis-memory.js
```

Leia o arquivo `~/.claude/settings.json`. Se não existir, trate como `{}`.

Adicione ou atualize a chave `mcpServers.claude-memory` preservando todas as outras chaves existentes:
```json
{
  "mcpServers": {
    "jarvis-memory": {
      "command": "node",
      "args": ["<CAMINHO_ABSOLUTO_DO_BIN>"]
    }
  }
}
```

Salve o arquivo `~/.claude/settings.json`.

---

## Passo 5 — Confirmação Final

Informe ao usuário:
- "Neo4j rodando em http://localhost:7474 (interface web) e bolt://localhost:7687"
- "MCP server `jarvis-memory` registrado em ~/.claude/settings.json"
- "**Reinicie o Claude Code** para que o MCP server seja ativado"
- "Após reiniciar, use `/memory-index` para indexar seu primeiro repositório"
