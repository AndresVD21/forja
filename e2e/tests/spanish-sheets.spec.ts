import { expect, test } from "@playwright/test";
import { openEntry, uniqueName } from "../support/entry";
import { SET_LABELS, fillSets, pickExercise } from "../support/helpers";

// Spanish copy of the two new sheets (labels from docs/assets/m3-pages/README.md and messages/es.json).
// Nothing is saved, so these tests share no data with others.

test("Spanish: the set details sheet", async ({ page }) => {
  await openEntry(page, "SmartFit Hacienda", "es");
  await pickExercise(page, "press inclinado", "Press inclinado con barra");
  await fillSets(page, [["20", "10"], ["25", "8"]], "es");
  const exercise = "Press inclinado con barra";

  await page.getByRole("button", { name: `Detalles de la serie 1 de ${exercise}`, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Serie 1", exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Los cambios quedan en este borrador hasta Guardar entrenamiento.")).toBeVisible();

  const toFailure = sheet.getByRole("switch", { name: "Al fallo" });
  await toFailure.click();
  await expect(toFailure).toBeChecked();

  await sheet.getByRole("radiogroup", { name: "Unidad de esta serie" }).getByRole("radio", { name: "Libras" }).click();
  await expect(sheet.getByRole("radio", { name: /^Mantener número/ })).toBeChecked();
  await expect(sheet.getByRole("radio", { name: /^Convertir peso/ })).toBeEnabled();
  await expect(sheet.getByText("20 kg/lado → 20 lb/lado", { exact: true })).toBeVisible();
  await expect(sheet.getByText("El entrenamiento aún no está guardado.")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancelar cambio de unidad" }).click();
  await expect(sheet.getByRole("button", { name: "Eliminar serie" })).toBeVisible();

  await sheet.getByRole("radiogroup", { name: "Unidad de esta serie" }).getByRole("radio", { name: "Libras" }).click();
  await sheet.getByRole("radio", { name: /^Convertir peso/ }).check();
  await sheet.getByRole("button", { name: "Aplicar cambio de unidad" }).click();
  await sheet.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(sheet).toBeHidden();
  // 20 kg is 44.09 lb; the decimal separator follows the language, so accept either.
  await expect(page.getByLabel(SET_LABELS.es.weight(1), { exact: true })).toHaveValue(/^44[.,]09$/);
  await expect(page.getByText("Al fallo", { exact: true })).toHaveCount(1); // the badge

  await page.getByRole("button", { name: `Marcar todas las series al fallo en ${exercise}` }).click();
  await expect(page.getByText("Al fallo", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: `Quitar marcas de fallo en ${exercise}` }).click();
  await expect(page.getByText("Al fallo", { exact: true })).toHaveCount(0);

  // Delete and Undo.
  await page.getByRole("button", { name: `Detalles de la serie 2 de ${exercise}`, exact: true }).click();
  await page.getByRole("button", { name: "Eliminar serie" }).click();
  await expect(page.getByText("Serie eliminada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Deshacer la eliminación de una serie de ${exercise}` }).click();
  await expect(page.getByLabel(SET_LABELS.es.weight(2), { exact: true })).toHaveValue("25");
  await expect(page.getByText("Serie eliminada", { exact: true })).toHaveCount(0);
});

test("Spanish: the custom exercise sheet", async ({ page }) => {
  await openEntry(page, "SmartFit Hacienda", "es");
  const name = uniqueName("es");
  await page.getByRole("combobox", { name: "Nombre del ejercicio" }).fill(name);
  await page.getByRole("option", { name: `Usar “${name}”` }).click();
  const sheet = page.getByRole("dialog", { name: "Nuevo ejercicio" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Solo visible para ti")).toBeVisible();
  await expect(sheet.getByLabel("Nombre del ejercicio", { exact: true })).toHaveValue(name);
  await expect(sheet.getByLabel("Grupo muscular", { exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Equipo", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("radiogroup", { name: "Unidad por defecto" })).toBeVisible();
  await expect(sheet.getByText("¿Cómo registras el peso?")).toBeVisible();
  await expect(sheet.getByText("Al guardar, este ejercicio se añade a tu lista aunque descartes el entrenamiento.")).toBeVisible();

  await sheet.getByRole("button", { name: "Guardar ejercicio y usarlo" }).click();
  await expect(sheet.getByText("Elige un grupo muscular.")).toBeVisible();
  await expect(sheet.getByText("Elige el equipo.")).toBeVisible();
  await expect(sheet.getByText("Elige cómo registras el peso.")).toBeVisible();
  await expect(sheet.getByText("Corrige los campos marcados para continuar.")).toBeVisible();

  await sheet.getByLabel("Grupo muscular", { exact: true }).selectOption({ label: "Pecho" });
  await sheet.getByLabel("Equipo", { exact: true }).selectOption({ label: "Barra" });
  await sheet.getByRole("radio", { name: /^Discos por lado/ }).check();
  await expect(sheet.getByLabel("Peso de la barra", { exact: true })).toHaveValue("20");
  await sheet.getByRole("radiogroup", { name: "Unidad de la barra" }).getByRole("radio", { name: "Libras" }).click();
  await expect(sheet.getByLabel("Peso de la barra", { exact: true })).toHaveValue(/^44[.,]09$/);

  // Cancel creates nothing (this test never saves, so it leaves no exercise behind).
  await sheet.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Nombre del ejercicio" })).toHaveValue(name);
});
