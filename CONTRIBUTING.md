# Contribuindo no SaveChat

Convenções do repositório. As regras aqui **têm teeth**: a maioria é
verificada por teste automatizado e falha o CI.

---

## Fluxo de trabalho

```
main  ──────►  producao (Vercel, automatico)
  │
  └── staging ────►  homologacao (Vercel, preview)
        │
        ├── feature/… ──┐
        ├── fix/…       ├── merge em staging
        └── chore/… ────┘
```

### `main` e `staging`

| Branch | Vai para | Quem testa |
|---|---|---|
| `staging` | URL de preview da Vercel | **você**, antes de produção |
| `main` | domínio de produção | usuários |

Fluxo: trabalho sai de `staging` para uma branch de subsistema → merge
em `staging` → você testa → merge em `main` → deploy.

```bash
# 1. nasce de staging (nunca da main)
git switch staging && git pull --ff-only
git switch -c feature/ia-melhorias

# 2. implementa, commita, sobe
npm run check && npm test && npm run e2e
git push -u origin feature/ia-melhorias

# 3. depois de testar de verdade em staging:
git switch staging && git pull --ff-only
git merge --no-ff feature/ia-melhorias
git push origin staging
```

A promoção para `main` passa por **PR** (ver `### Proteção da main`).

Três regras que evitam problema passado:

- **`main` nunca recebe commit direto.** Nem-doc, nem hotfix: entra por
  `staging`.
- **Só merge em `main` depois do seu teste manual em staging.** O CI
  cobre sintaxe, unidade e fluxo crítico — não cobre se a feature é
  boa.
- **Antes de mergear, atualize a base:** `git pull --ff-only` em
  `staging` e em `main`. Merge de branch desatualizada é origem de
  conflito silencioso.

### Testar localmente antes do merge

Você não precisa da Vercel para testar a branch. O preview local serve o
**mesmo build de produção** (`dist/`, com `sw.js`, minificação e
versão):

```bash
git switch staging && git pull --ff-only
npm run preview     # build + serve em http://localhost:3002
```

O script imprime a **porta real**, a **versão** e a **branch** servida —
nunca muda de porta em silêncio. Se a 3002 estiver ocupada, ele avisa e
pega a próxima livre; para forçar:

```bash
PREVIEW_PORT=3100 npm run preview
```

> Duas diferenças entre o preview e a Vercel, para não se enganar: o
> preview serve `help.html` literalmente (sem redirect para `/help`) e
> manda `Cache-Control: no-cache` — a Vercel é a referência final. Se
> algo só falha no preview, provavelmente é cache: clique em
> **Atualizar app** (menu do perfil), porque hard refresh não
> substitui o service worker.

### `npm run promote` — branch de trabalho → staging

Um comando faz os dois primeiros movimentos: valida, mergeia em
`staging`, sobe e acompanha o CI até dar o veredito.

```bash
git switch -c feature/ia-melhorias
# ... implementar e commitar ...
git push -u origin feature/ia-melhorias

npm run promote              # branch atual
npm run promote fix/modal    # branch específica
npm run promote --no-wait    # só merge + push, sem esperar o CI
```

Portões — nada sobe sem passar por eles:

| Portão | O que faz |
|---|---|
| branch de origem | recusa rodar em `main` ou `staging` |
| árvore limpa | recusa com pendência não commitada |
| branch no remoto | recusa se `git push -u` não foi feito |
| **staging parada** | **recusa se outro agente promoveu algo que a branch não viu** |
| suíte local | `check` + `test` + `e2e` — **nada sobe com a suíte vermelha** |
| revisão do diff | mostra o que vai para `staging` antes de enviar |
| CI | acompanha até `success`/`failure` e imprime o comando de log |

Ao final: `staging` com o código, CI verde, pronto para
`npm run preview`.

O script **não** abre PR nem mergeia em `main` — produção continua
sendo sua decisão, depois do teste manual.

#### O portão "staging parada" (vários agentes em paralelo)

A worktree isola os **arquivos**, não o **merge**. Dois agentes que
promovem em paralelo partem da mesma base, e o segundo faria merge em
cima do merge do primeiro — com o conflito aparecendo tarde, depois de
`npm test`/`e2e` já terem rodado sobre uma árvore que mudou embaixo.

Por isso o `promote` compara a base da branch com a ponta de
`origin/staging` **antes de validar**. Se a staging andou desde que a
branch partiu dela, o promote para e imprime os commits novos mais os
comandos para resolver:

```bash
git fetch origin
git rebase origin/staging
npm test && npm run e2e
git push --force-with-lease
npm run promote
```

A referência é a `staging` **remota**, nunca a local: a worktree
principal fica na `staging` alguns commits atrás da remota enquanto
outro agente promove, e comparar com a local acusaria uma defasagem que
não existe.

Consequência prática: **um promote por vez**. Se dois agentes promoverem
no mesmo minuto, o segundo recebe essa mensagem e rebaixa em ~10s —
bem melhor que um conflito resolvido no escuro.

### `staging` no CI

`CI` e `Lighthouse CI` rodam em `main` **e** `staging`. A branch de
homologação tem o mesmo gate de qualidade da produção — se o CI
estiver vermelho em `staging`, não promova.

Branch de *feature* não dispara workflow (só `main` e `staging` estão
no filtro) — nela, valide local:

```bash
npm run check && npm test && npm run e2e
```

### Proteção da `main`

A `main` está protegida: push direto é recusado (`GH006`). A promoção
passa por **pull request** com o check `CI` verde. `git push origin main`
falha — o caminho é:

```bash
git switch staging && git pull --ff-only
git push origin staging
gh pr create --base main --head staging --title "…" --body "…"
gh pr merge --merge --auto
```

Force-push e deleção da `main` também estão bloqueados.

**Merge commit, não squash.** O repositório está configurado para
`squash = não` e `rebase = não` (só merge commit), e o squash está
desligado de propósito: ele reescreve os SHAs a cada promoção, então a
branch deixa de ser ancestral da `main` e `git merge-base --is-ancestor`
passa a responder "não" para trabalho que já está em produção. Foi o que
tornou os PRs difíceis de ler — um diff de 2 linhas convivia com "17
commits não mergeados". Com merge commit a pergunta "isto já está na
main?" vira fato, e `git log --first-parent main` mostra só as promoções.

O custo: `git log main` fica mais verboso (vê cada commit da branch).
É o preço de não mentir sobre o estado do repositório.

### Branches de subsistema

Uma branch por **subsistema**, não por ticket. Se duas tarefas mexem nos
mesmos arquivos, são a mesma branch — dividir gera conflito evitado.

```bash
git switch -c feature/ia-melhorias        # novo recurso
git switch -c fix/modal-fora-da-tela      # correção
git switch -c chore/css-parity            # tarefa mecânica
git switch -c refactor/messages-mixins    # reestruturação
```

Prefixos: `feature/`, `fix/`, `chore/`, `refactor/`, `docs/`.

**Trabalhe fora da `main`.** A `main` é sempre deployável e com CI verde.
Antes de abrir a branch, atualize a base:

```bash
git fetch origin && git switch main && git pull --ff-only
```

### Worktree por agente (paralelismo real)

Se dois agentes (ou duas conversas) trabalham no mesmo repo ao mesmo tempo,
**branch não basta** — branch é só um ponteiro. As duas conversas com o mesmo
cwd compartilham UM working tree, e `git switch` move o índice e os arquivos do
processo inteiro: o outro agente acorda na branch nova, com o trabalho dele em
cima. Não há como isolar isso por sessão.

A worktree é o isolamento real — um diretório por agente:

```bash
# a partir do repo raiz (NUNCA de dentro de outra worktree)
node scripts/wt.mjs new feature/modal-altura
# imprime o path; trabalhe a partir dele
cd .worktrees/modal-altura
```

O script cria a worktree a partir de `staging`, faz o junction de
`node_modules` (45M não copiados por branch) e adiciona+commita
`.worktrees/` no `.gitignore`. Feito isso, dois agentes correm em paralelo sem
se ver:

```bash
node scripts/wt.mjs list              # worktrees vivas + o que está sujo
node scripts/wt.mjs remove <slug>     # descarta (recusa se houver WIP)
```

O `npm run promote` **funciona de dentro da worktree** — o merge sai numa
worktree descartável em detached sobre `origin/staging`, e o checkout principal
nunca é tocado. É o caminho normal quando o agente promove o próprio trabalho.

> Não use `git switch` para começar uma tarefa paralela. Crie a worktree.
> O atalho do Hermes (⌘⇧B / `/worktree new`) faz o mesmo por outro caminho,
> mas o agente consegue chamar este script sem depender de UI.

### Commits

Convencional, em português, com escopo do subsistema:

```
fix(auth): PKCE explícito no cliente Supabase restaura o login com Google
feat(composer): botão de enviar vira microfone no campo vazio
refactor(workspace): fatia em 3 mixins por área
chore(build): tira partials/ e styles/ do dist
```

O escopo importa mais que a descrição: é ele que permite `git log --grep`
e agrupar mudanças por área.

### Teste e implementação no mesmo commit

**Não versione um teste cuja implementação não está no mesmo push.**

Causa real: o commit `4809e06` quebrou o CI porque um teste de regressão
foi enviado antes do código que ele verificava. O `main` ficou vermelho
com o teste pedindo algo que ainda não existia.

Se o teste e a implementação não couberem juntos, o caminho é o mesmo
commit ou um PR — nunca deixar o `main` intermediário quebrado.

---

## Antes de commitar

```bash
npm run check    # node --check em todo JS público
npm test         # unit — inclui as convenções de versão e PWA
npm run e2e      # Playwright: fluxo crítico
```

Os três precisam passar. `npm run e2e` roda em workers paralelos; se
reproducir instabilidade, rode isolado antes de investigar o código:

```bash
npx playwright test tests/e2e/features.spec.js -g "nome do teste"
```

**Port drift:** `npm run dev` pede a porta 3000, mas o `serve` **não
falha** se ela estiver ocupada — ele escolhe uma porta aleatória e
imprime no log. Leia a linha `Accepting connections at` da saída antes
de apontar o browser para lá. Um `curl :3000` recusando conexão depois
de um "dev iniciado" significa drift, não servidor quebrado.

---

## Convenção de versão

Todo deploy toca **cinco arquivos juntos**. O teste `tests/sync.test.js`
falha se algum ficar para trás.

| Arquivo | O que muda |
|---|---|
| `public/sw.js` | `const CACHE = 'notethread-vN'` — **+1** a cada deploy |
| `public/index.html` | `window.APP_VERSION` **e** `#about-app-version` |
| `package.json` | campo `version` |
| `public/CHANGELOG.md` | entrada `## [x.y.z]` no **topo** |
| `tests/sync.test.js` | o valor esperado do `CACHE` |

Regra: **x.y no CHANGELOG = APP_VERSION no index = package.json**. Uma
`npm test` vermelha em `sw.js é vN` quase sempre significa drift entre
esses arquivos — leia os dois lados antes de editar qualquer um.

`fix` → patch (1.13.6) · `feat` → minor (1.14.0) · breaking → major.

---

## Service Worker

O `sw.js` é cache-first para o app shell, mas **network-first para CSS e
JS**. Hard refresh (`Ctrl+Shift+R`) não contorna um service worker
instalado: o fetch handler intercepta antes da rede.

- **Nunca** reintroduza `skipWaiting()` no `install` — desde a v1.4.1 a
  atualização é controlada pelo usuário (chip no menu do perfil). Um
  teste trava isso.
- Após mexer em `public/`, o bump de versão é obrigatório: sem ele o
  usuário vê assets antigos.
- Prefira **network-first** a cache-first para `.css`/`.js`/`.mjs`.

---

## Código

### CSS

O estilo foi fatiado em `public/styles/00-*.css` … `18-*.css` (mais os
parciais `03a`/`03b`), importados por `public/styles.css` **na ordem
original do monólito**. A cascata depende dessa ordem: várias regras
vencem por declaração, não por especificidade. **Não reordene** sem rodar
o teste de paridade (`scripts/css-parity.mjs`).

- Nunca `transition: all` — liste as propriedades (o count hoje é 0).
- Antes de "corrigir" um estilo que parece ignorado, procure uma
  declaração duplicada do mesmo seletor: last-wins esconde bugs.
- Tokens em `:root`; nada de hex literal quando existe token.
- Floor de contraste: 4.5:1 no texto, 4.75:1 no texto sobre bolha.

### JavaScript

- ES modules nativos. Sem build step no dev; o `npm run build` só minifica.
- Tooltips e popovers ancorados **precisam ser medidos** e presos dentro
  do viewport — `position: fixed` sob ancestral com `transform` vira
  relativo ao ancestral, não à viewport.
- Nada de espera fixa quando dá para esperar estado
  (`expect(...).toBeVisible()` no Playwright).

### Ferramentas de dev

Código de desenvolvimento **não roda em produção**. Use o gate por
hostname já estabelecido:

```js
const IS_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (!IS_DEV) return;
```

Ver `public/js/friendly-names.js` como referência. O botão do devtool
vai no HTML mas nasce `display: none` e só recebe `.is-dev` em
localhost — evita flash antes do script decidir.

---

## Testes

- `tests/sync.test.js` — convenções de versão, PWA, precache, RLS.
  É a rede de segurança das regras deste arquivo.
- `tests/e2e/*.spec.js` — fluxo crítico via Playwright.
- Ao criar um componente, **adicione o teste que trava a convenção** dele,
  não só o que verifica se renderizou.

Nos e2e, **bloqueie o service worker** ao medir estilo ou estado:

```js
const ctx = await b.newContext({ serviceWorkers: 'block' });
```

Sem isso você testa a versão anterior do módulo — o sintoma é a regra
CSS "não tem efeito" em código correto.

---

## Terminologia

Vocabulário oficial em [`docs/GLOSSARIO.md`](docs/GLOSSARIO.md):
**conversa** = thread, **mensagem** = note, **caderno** = folder.

- Verbos e micro-ações usam linguagem de conversa ("Enviar mensagem",
  "Nova conversa").
- Nouns globais usam linguagem de notas ("Buscar notas", "Exportar notas").
- O código interno mantém `thread`/`note`/`folder`.

---

## Exemplo prático

```bash
# 1. base atualizada
git switch main && git pull --ff-only

# 2. branch do subsistema
git switch -c fix/modal-altura

# 3. implementar + testar
#    ... editar ...
npm run check && npm test && npm run e2e

# 4. bump nos cinco arquivos
#    sw.js, index.html (x2), package.json, CHANGELOG.md, sync.test.js

# 5. commitar tudo junto
git add -A
git commit -m "fix(modal): altura máxima respeita a viewport em telas baixas"

# 6. revisão honesta do staged
git diff --cached

git push -u origin fix/modal-altura
```

**Passo 6 não é opcional.** Se outra agent trabalha no mesmo repositório,
um arquivo pode ter mudado entre o `git add` e o commit — confira
linha a linha antes de commitar.
