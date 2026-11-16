import { test as base, expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Dados de database/seed.sql: os três alunos presentes antes de cada cenário. */
export const SEED_STUDENTS = [
  { ra: "258001", name: "Ana Clara Silva" },
  { ra: "258002", name: "Bruno Henrique Santos" },
  { ra: "258003", name: "Camila Oliveira Souza" },
];

/** Limpa o banco exclusivo dos testes e, opcionalmente, reaplica o seed. */
function resetDatabase(withSeed: boolean) {
  const seed = readFileSync(
    resolve(__dirname, "../database/seed.sql"),
    "utf8",
  );
  const reset = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "compose.atividade.e2e.yml",
      "-p",
      "atividade-e2e",
      "exec",
      "-T",
      "database",
      "psql",
      "-U",
      "postgres",
      "-d",
      "atividade_e2e",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      cwd: resolve(__dirname, ".."),
      encoding: "utf8",
      input:
        "TRUNCATE enrollments, courses, students RESTART IDENTITY CASCADE;\n" +
        (withSeed ? seed : ""),
    },
  );
  if (reset.error || reset.status !== 0) {
    throw new Error(
      `Falha ao restaurar o banco E2E: ${reset.error?.message ?? reset.stderr}`,
    );
  }
}

export const test = base.extend<{ seeded: boolean }>({
  // Use test.use({ seeded: false }) para iniciar com o banco vazio.
  seeded: [true, { option: true }],
  page: async ({ page, seeded }, use) => {
    resetDatabase(seeded);
    await page.goto("/");
    // A listagem inicial terminou quando a seção deixa de estar ocupada.
    await expect(page.locator("#students")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.getByTestId("list-message")).toHaveAttribute(
      "data-state",
      "success",
    );
    await use(page);
  },
});
export { expect };

/** Preenche o formulário e clica em "Cadastrar aluno", como um usuário faria. */
export async function fillForm(page: Page, ra: string, name: string) {
  await page.getByLabel("RA", { exact: true }).fill(ra);
  await page.getByLabel("Nome", { exact: true }).fill(name);
}

export async function submitForm(page: Page) {
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
}

/** Linhas da tabela como [{ ra, name }], na ordem exibida. */
export async function tableRows(page: Page) {
  const rows = page.getByTestId("student-row");
  return rows.evaluateAll((trs) =>
    trs.map((tr) => {
      const cells = tr.querySelectorAll("td");
      return {
        ra: cells[0].textContent ?? "",
        name: cells[1].textContent ?? "",
      };
    }),
  );
}
