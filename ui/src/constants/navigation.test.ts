import { describe, expect, it } from "vitest";
import { NAVIGATION, ROUTES, navigationFor } from "./app.constants";

/**
 * Ocultar el enlace no es la protección (la API responde 403 igual), pero sí
 * evita ofrecerle a un usuario normal una pantalla que va a fallar — y anunciarle
 * que existe un panel de admin.
 */
describe("navigationFor", () => {
  it("no ofrece el historial de errores a un usuario normal", () => {
    const paths = navigationFor("user").map((item) => item.path);

    expect(paths).not.toContain(ROUTES.ERRORS);
    expect(paths).toContain(ROUTES.VAULT);
  });

  // Mientras /me no responde no se sabe el rol: se asume el mínimo.
  it("sin rol conocido tampoco lo ofrece", () => {
    expect(navigationFor(undefined).map((item) => item.path)).not.toContain(
      ROUTES.ERRORS,
    );
  });

  it("un admin ve todo", () => {
    expect(navigationFor("admin")).toHaveLength(NAVIGATION.PRIVATE.length);
  });

  it("solo el historial de errores está marcado como admin", () => {
    const adminOnly = NAVIGATION.PRIVATE.filter((item) => item.adminOnly);

    expect(adminOnly.map((item) => item.path)).toEqual([ROUTES.ERRORS]);
  });
});
