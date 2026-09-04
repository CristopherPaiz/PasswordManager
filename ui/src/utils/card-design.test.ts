import { describe, expect, it } from "vitest";
import { detectCardBrand } from "./card-brand";
import {
  CARD_COLOR_IDS,
  CARD_DESIGN_IDS,
  CardColorId,
  colorSwatch,
  isCardColorId,
  isCardDesignId,
  resolveCardStyle,
} from "./card-design";

const visa = detectCardBrand("4111111111111111");
const amex = detectCardBrand("378282246310005");

describe("resolveCardStyle", () => {
  it("por defecto usa el color de la marca detectada", () => {
    const style = resolveCardStyle(visa);
    expect(style.backgroundImage).toContain(visa.from);
    expect(style.backgroundImage).toContain(visa.to);
    expect(style.fg).toBe(visa.fg);
  });

  it("el color del usuario gana sobre el de la marca", () => {
    const style = resolveCardStyle(visa, "forest");
    expect(style.backgroundImage).not.toContain(visa.from);
    expect(style.backgroundImage).toContain("#14532d");
  });

  it("`brand` sigue a la marca: la misma elección da colores distintos por tarjeta", () => {
    const conVisa = resolveCardStyle(visa, "brand");
    const conAmex = resolveCardStyle(amex, "brand");
    expect(conVisa.backgroundImage).not.toBe(conAmex.backgroundImage);
  });

  /**
   * Platino es el único color claro del catálogo. Si heredara el texto blanco
   * quedaría ilegible, así que debe traer tinta oscura propia.
   */
  it("platino usa texto oscuro para no volverse ilegible", () => {
    expect(resolveCardStyle(visa, "platinum").fg).toBe("#111827");
    expect(resolveCardStyle(visa, "midnight").fg).toBe("#ffffff");
  });

  /**
   * Los once acabados deben verse distintos, pero NO necesariamente por el
   * fondo: los siete con patrón comparten la misma base de color a propósito
   * (el patrón es ortogonal al color) y se diferencian en su capa. El
   * invariante real es que la combinación fondo + patrón sea única.
   */
  it("cada acabado produce un resultado visual distinto", () => {
    const seen = new Set(
      CARD_DESIGN_IDS.map((d) => {
        const style = resolveCardStyle(visa, "ocean", d);
        return `${style.backgroundImage}||${style.pattern?.image ?? "sin-patron"}`;
      }),
    );
    expect(seen.size).toBe(CARD_DESIGN_IDS.length);
  });

  /** Un acabado plano con brillo diagonal deja de verse plano. */
  it("el acabado plano no lleva brillo", () => {
    expect(resolveCardStyle(visa, "ocean", "solid").sheen).toBe(0);
    expect(resolveCardStyle(visa, "ocean", "gradient").sheen).toBeGreaterThan(0);
  });

  it("es pura: la misma entrada da siempre la misma salida", () => {
    expect(resolveCardStyle(visa, "wine", "duotone")).toEqual(
      resolveCardStyle(visa, "wine", "duotone"),
    );
  });

  it("toda combinación de color y acabado produce CSS utilizable", () => {
    for (const color of CARD_COLOR_IDS) {
      for (const design of CARD_DESIGN_IDS) {
        const style = resolveCardStyle(visa, color, design);
        expect(style.backgroundImage).toMatch(/^linear-gradient\(/);
        expect(style.fg).toMatch(/^#[0-9a-f]{6}$/);
        expect(style.sheen).toBeGreaterThanOrEqual(0);
        expect(style.sheen).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("colorSwatch", () => {
  it("siempre muestra el degradado, sin importar el acabado elegido", () => {
    // La muestra del selector comunica el COLOR; el acabado se elige aparte.
    expect(colorSwatch(visa, "gold")).toContain("#78350f");
    expect(colorSwatch(visa, "gold")).toContain("#d97706");
  });

  it("`brand` refleja la marca de esa tarjeta", () => {
    expect(colorSwatch(amex, "brand")).toContain(amex.from);
  });

  it("las doce muestras son distintas entre sí", () => {
    const seen = new Set(CARD_COLOR_IDS.map((id) => colorSwatch(visa, id)));
    expect(seen.size).toBe(CARD_COLOR_IDS.length);
  });
});

describe("validación de valores guardados", () => {
  /**
   * Un blob viejo o un respaldo importado puede traer cualquier cosa en estos
   * campos. Se valida antes de confiar en ellos: un id desconocido debe caer al
   * valor por defecto, no romper el render.
   */
  it("acepta solo los ids del catálogo", () => {
    for (const id of CARD_COLOR_IDS) expect(isCardColorId(id)).toBe(true);
    for (const id of CARD_DESIGN_IDS) expect(isCardDesignId(id)).toBe(true);
  });

  it("rechaza basura", () => {
    for (const value of ["", "rojo", "#ff0000", null, undefined, 42, {}]) {
      expect(isCardColorId(value)).toBe(false);
      expect(isCardDesignId(value)).toBe(false);
    }
  });

  it("un id desconocido no se cuela como color", () => {
    expect(isCardColorId("neon")).toBe(false);
  });

  /** Una tarjeta vieja no trae estos campos: debe verse como antes. */
  it("sin elección guardada, el resultado es el de marca con degradado", () => {
    const legacy = resolveCardStyle(visa, undefined as unknown as CardColorId);
    expect(legacy).toEqual(resolveCardStyle(visa, "brand", "gradient"));
  });
});

describe("acabados con patrón", () => {
  const CON_PATRON = ["guilloche", "waves", "arcs", "grid", "stripes", "mesh", "holo"] as const;
  const SIN_PATRON = ["gradient", "solid", "horizon", "duotone"] as const;

  it("los lisos no traen capa de patrón", () => {
    for (const design of SIN_PATRON) {
      expect(resolveCardStyle(visa, "ocean", design).pattern).toBeNull();
    }
  });

  it("los siete con patrón sí la traen", () => {
    for (const design of CON_PATRON) {
      const style = resolveCardStyle(visa, "ocean", design);
      expect(style.pattern).not.toBeNull();
      expect(style.pattern!.opacity).toBeGreaterThan(0);
      expect(style.pattern!.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("cada patrón es visualmente distinto", () => {
    const vistos = new Set(
      CON_PATRON.map((d) => resolveCardStyle(visa, "ocean", d).pattern!.image),
    );
    expect(vistos.size).toBe(CON_PATRON.length);
  });

  /**
   * Un `#` sin escapar dentro de un data URI de SVG hace que el navegador lo
   * lea como fragmento de URL y el patrón desaparece sin error. Es el fallo
   * clásico con SVG en CSS, así que se fija aquí.
   */
  it("los SVG embebidos no llevan '#' sin escapar", () => {
    for (const design of CON_PATRON) {
      const image = resolveCardStyle(visa, "ocean", design).pattern!.image;
      if (image.startsWith("url(")) {
        expect(image).toContain("data:image/svg+xml,");
        expect(image).not.toMatch(/[^%]#/);
      }
    }
  });

  it("el patrón es independiente del color (ortogonalidad)", () => {
    // El mismo acabado sobre dos colores distintos: cambia el fondo, no el patrón.
    const a = resolveCardStyle(visa, "ocean", "guilloche");
    const b = resolveCardStyle(visa, "wine", "guilloche");
    expect(a.pattern!.image).toBe(b.pattern!.image);
    expect(a.backgroundImage).not.toBe(b.backgroundImage);
  });

  it("los acabados con patrón bajan el brillo para no apagarlo", () => {
    const conPatron = resolveCardStyle(visa, "ocean", "waves").sheen;
    const degradado = resolveCardStyle(visa, "ocean", "gradient").sheen;
    expect(conPatron).toBeLessThan(degradado);
  });

  it("un id de acabado inválido no rompe el render", () => {
    const style = resolveCardStyle(visa, "ocean", "inventado" as never);
    expect(style.backgroundImage).toMatch(/^linear-gradient\(/);
    expect(style.pattern).toBeNull();
  });
});
