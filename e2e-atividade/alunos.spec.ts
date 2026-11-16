import type { Page, Request } from "@playwright/test";
import {
  expect,
  fillForm,
  SEED_STUDENTS,
  submitForm,
  tableRows,
  test,
} from "./support";

/** Registra os POST /api/students enviados pelo navegador durante o teste. */
function trackPosts(page: Page) {
  const posts: Request[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/students"
    ) {
      posts.push(request);
    }
  });
  return posts;
}

/** Envia o formulário e aguarda a resposta do POST /api/students. */
async function submitAndWaitForResponse(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/students" &&
      response.request().method() === "POST",
  );
  await submitForm(page);
  return responsePromise;
}

test.describe("Listagem inicial", () => {
  test("exibe os alunos existentes no banco ao abrir a página", async ({
    page,
  }) => {
    await expect(page.getByTestId("student-row")).toHaveCount(
      SEED_STUDENTS.length,
    );
    expect(await tableRows(page)).toEqual(SEED_STUDENTS);
    await expect(page.getByTestId("list-message")).toBeEmpty();
  });
});

test.describe("Lista vazia", () => {
  test.use({ seeded: false });

  test("exibe a mensagem 'Nenhum aluno cadastrado.' sem alunos", async ({
    page,
  }) => {
    await expect(page.getByTestId("list-message")).toHaveText(
      "Nenhum aluno cadastrado.",
    );
    await expect(page.getByTestId("student-row")).toHaveCount(0);
  });
});

test.describe("Cadastro válido", () => {
  test("cadastra um aluno, atualiza a tabela sem recarregar e limpa o formulário", async ({
    page,
  }) => {
    // Marca o documento: se a página recarregasse, a marca desapareceria.
    await page.evaluate(() => {
      (window as unknown as { __semRecarga: boolean }).__semRecarga = true;
    });
    const student = { ra: "259001", name: "Mariana Costa Lima" };

    await fillForm(page, student.ra, student.name);
    const response = await submitAndWaitForResponse(page);
    expect(response.status()).toBe(201);

    // Mensagem de sucesso exibida ao usuário.
    await expect(page.getByTestId("form-message")).toHaveText(
      "Aluno cadastrado com sucesso.",
    );
    await expect(page.getByTestId("form-message")).toHaveAttribute(
      "data-state",
      "success",
    );

    // Tabela atualizada com o novo aluno, mantendo os existentes.
    await expect(page.getByTestId("student-row")).toHaveCount(
      SEED_STUDENTS.length + 1,
    );
    expect(await tableRows(page)).toEqual(
      expect.arrayContaining([student]),
    );
    await expect(
      page.getByTestId("student-row").filter({ hasText: student.name }),
    ).toContainText(student.ra);

    // Formulário limpo e página não recarregada.
    await expect(page.getByLabel("RA", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("");
    expect(
      await page.evaluate(
        () => (window as unknown as { __semRecarga?: boolean }).__semRecarga,
      ),
    ).toBe(true);
  });

  test("aceita os limites válidos: RA 1 e 2147483647, nome com 3 caracteres", async ({
    page,
  }) => {
    for (const student of [
      { ra: "1", name: "Ana" },
      { ra: "2147483647", name: "  Léo  " },
    ]) {
      const expectedName = student.name.trim();
      await fillForm(page, student.ra, student.name);
      const response = await submitAndWaitForResponse(page);
      expect(response.status()).toBe(201);
      await expect(page.getByTestId("form-message")).toHaveAttribute(
        "data-state",
        "success",
      );
      await expect(
        page.getByTestId("student-row").filter({
          has: page.getByRole("cell", { name: expectedName, exact: true }),
        }),
      ).toContainText(student.ra);
    }
    await expect(page.getByTestId("student-row")).toHaveCount(
      SEED_STUDENTS.length + 2,
    );
  });
});

test.describe("Persistência", () => {
  test("mantém o aluno cadastrado após recarregar a página", async ({
    page,
  }) => {
    const student = { ra: "259002", name: "Rafael Almeida" };
    await fillForm(page, student.ra, student.name);
    const response = await submitAndWaitForResponse(page);
    expect(response.status()).toBe(201);
    await expect(page.getByTestId("form-message")).toHaveAttribute(
      "data-state",
      "success",
    );

    await page.reload();
    await expect(page.locator("#students")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.getByTestId("student-row")).toHaveCount(
      SEED_STUDENTS.length + 1,
    );
    expect(await tableRows(page)).toEqual(
      expect.arrayContaining([student]),
    );
    // Após o reload o formulário também volta ao estado inicial.
    await expect(page.getByLabel("RA", { exact: true })).toHaveValue("");
  });
});

test.describe("Campos obrigatórios", () => {
  const cases = [
    { title: "RA e Nome vazios", ra: "", name: "" },
    { title: "RA vazio", ra: "", name: "Fulano de Tal" },
    { title: "Nome vazio", ra: "259003", name: "" },
  ];

  for (const { title, ra, name } of cases) {
    test(`impede o cadastro com ${title}`, async ({ page }) => {
      const posts = trackPosts(page);
      await fillForm(page, ra, name);
      await submitForm(page);

      // O navegador bloqueia o envio e marca o campo vazio como inválido.
      const emptyField = ra === "" ? page.getByLabel("RA", { exact: true }) : page.getByLabel("Nome", { exact: true });
      await expect(emptyField).toHaveJSProperty("required", true);
      await expect(page.locator(":invalid").first()).toBeVisible();
      await expect(emptyField).toHaveValue("");
      expect(
        await emptyField.evaluate(
          (el) => (el as HTMLInputElement).validationMessage,
        ),
      ).not.toBe("");

      // Nenhuma requisição enviada, nenhum aluno novo e nenhuma mensagem de sucesso.
      expect(posts).toHaveLength(0);
      await expect(page.getByTestId("form-message")).toBeEmpty();
      expect(await tableRows(page)).toEqual(SEED_STUDENTS);
    });
  }
});

test.describe("RA inválido", () => {
  const invalidRas = [
    { title: "negativo", ra: "-1" },
    { title: "zero", ra: "0" },
    { title: "decimal", ra: "1.5" },
    { title: "maior que 2147483647", ra: "2147483648" },
  ];

  for (const { title, ra } of invalidRas) {
    test(`rejeita RA ${title} (${ra})`, async ({ page }) => {
      const posts = trackPosts(page);
      await fillForm(page, ra, "Aluno Valido");
      await submitForm(page);

      const raInput = page.getByLabel("RA", { exact: true });
      await expect(page.locator("#ra:invalid")).toHaveCount(1);
      expect(
        await raInput.evaluate(
          (el) => (el as HTMLInputElement).validationMessage,
        ),
      ).not.toBe("");

      // Cadastro rejeitado: campos preenchidos, nada enviado, tabela intacta.
      await expect(raInput).toHaveValue(ra);
      await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Aluno Valido");
      expect(posts).toHaveLength(0);
      await expect(page.getByTestId("form-message")).not.toHaveAttribute(
        "data-state",
        "success",
      );
      expect(await tableRows(page)).toEqual(SEED_STUDENTS);
    });
  }
});

test.describe("Nome inválido", () => {
  const invalidNames = [
    { title: "com 1 caractere", name: "A" },
    { title: "com 2 caracteres", name: "Ab" },
    { title: "com 2 caracteres e espaços nas extremidades", name: "  Ab  " },
    { title: "formado apenas por espaços", name: "     " },
  ];

  for (const { title, name } of invalidNames) {
    test(`rejeita nome ${title}`, async ({ page }) => {
      const posts = trackPosts(page);
      await fillForm(page, "259004", name);
      await submitForm(page);

      const nameInput = page.getByLabel("Nome", { exact: true });
      await expect(page.locator("#name:invalid")).toHaveCount(1);
      expect(
        await nameInput.evaluate(
          (el) => (el as HTMLInputElement).validationMessage,
        ),
      ).not.toBe("");

      // Cadastro rejeitado: campos preenchidos, nada enviado, tabela intacta.
      await expect(nameInput).toHaveValue(name);
      await expect(page.getByLabel("RA", { exact: true })).toHaveValue("259004");
      expect(posts).toHaveLength(0);
      await expect(page.getByTestId("form-message")).not.toHaveAttribute(
        "data-state",
        "success",
      );
      expect(await tableRows(page)).toEqual(SEED_STUDENTS);
    });
  }
});

test.describe("RA duplicado", () => {
  test("rejeita RA já cadastrado, exibe erro e mantém os campos preenchidos", async ({
    page,
  }) => {
    const duplicate = { ra: SEED_STUDENTS[0].ra, name: "Outro Aluno" };
    await fillForm(page, duplicate.ra, duplicate.name);
    const response = await submitAndWaitForResponse(page);
    expect(response.status()).toBe(409);

    // Mensagem de erro retornada pela API, exibida ao usuário.
    const message = page.getByTestId("form-message");
    await expect(message).toHaveAttribute("data-state", "error");
    await expect(message).toContainText("Não foi possível cadastrar o aluno.");
    await expect(message).toContainText("Já existe um estudante com este RA.");

    // Campos preservados e botão novamente habilitado para nova tentativa.
    await expect(page.getByLabel("RA", { exact: true })).toHaveValue(duplicate.ra);
    await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(duplicate.name);
    await expect(
      page.getByRole("button", { name: "Cadastrar aluno" }),
    ).toBeEnabled();

    // O aluno original permanece e o duplicado não foi inserido.
    expect(await tableRows(page)).toEqual(SEED_STUDENTS);
    await page.reload();
    await expect(page.getByTestId("student-row")).toHaveCount(
      SEED_STUDENTS.length,
    );
    expect(await tableRows(page)).toEqual(SEED_STUDENTS);
  });
});
