# Testes E2E da atividade (cadastro de alunos)

Suíte Playwright + TypeScript para a interface de `atividade/`.

Requisitos: Node.js 22 ou superior, Docker em execução e Docker Compose com suporte a `up --wait`.
Na raiz do projeto:

```powershell
npm ci
npx playwright install chromium
npm run test:atividade
```

O comando sobe a aplicação completa (Nginx, API Express e PostgreSQL) com
`compose.atividade.e2e.yml`, projeto Docker `atividade-e2e` e porta local `18081`,
executa os testes e encerra os contêineres ao final, mesmo se houver falhas.

## Isolamento do banco

- Banco exclusivo `atividade_e2e`, em `tmpfs`, sem porta publicada.
- Não usa o `.env`, o `compose.yml` nem o volume da demonstração; os dados da
  exploração manual não são alterados.
- Antes de cada teste, a fixture em `support.ts` executa `TRUNCATE` e reaplica
  `database/seed.sql` (3 alunos conhecidos). Nos testes de lista vazia
  (`test.use({ seeded: false })`) o seed não é aplicado.
- Cada teste é independente; execução com 1 worker, sem retentativas.
  Não execute duas suítes ao mesmo tempo (a porta e o projeto Docker são fixos).

## Cenários (`alunos.spec.ts`)

| Cenário | Teste |
| --- | --- |
| Listagem inicial | 3 alunos do seed na tabela |
| Lista vazia | "Nenhum aluno cadastrado." |
| Cadastro válido, atualização da lista, limpeza do formulário | mensagem de sucesso, nova linha sem recarregar, campos vazios |
| Persistência | aluno continua na tabela após `reload` |
| Campos obrigatórios | RA e/ou Nome vazios impedem o envio |
| RA inválido | `-1`, `0`, `1.5`, `2147483648` |
| Nome inválido | 1 e 2 caracteres, 2 caracteres com espaços, só espaços |
| RA duplicado | HTTP 409, mensagem de erro, campos preenchidos |

Também há um teste dos limites válidos (RA 1 e 2147483647, nome de 3 caracteres).

Os cadastros usam o formulário (`getByLabel`, `getByRole`, `data-testid`), com API e
banco reais. As esperas são por respostas HTTP e condições da página, sem
`waitForTimeout()`. Nos casos de RA e Nome inválidos a validação ocorre no navegador:
o teste confere o estado `:invalid`, a `validationMessage`, que nenhum `POST` foi
enviado, que os campos continuam preenchidos e que a tabela não mudou.

## Comandos úteis

```powershell
npm run test:atividade:typecheck
npm run test:atividade:list
npm run test:atividade -- --headed
npm run test:atividade -- --grep "duplicado"
npm run test:atividade:report
```

Logs: `e2e-artifacts/compose-atividade.log`. Relatório HTML:
`playwright-report-atividade/`. Traces e capturas de falhas: `test-results-atividade/`.
Após uma interrupção forçada, limpe com:

```powershell
docker compose -f compose.atividade.e2e.yml -p atividade-e2e down --remove-orphans
```
