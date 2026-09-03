import { describe, expect, it } from "vitest";
import {
  cardLast4,
  detectCardBrand,
  formatCardNumber,
  formatExpiry,
  hasValidLength,
  isExpiryValid,
  isValidLuhn,
  maskCardNumber,
  maxCardDigits,
} from "./card-brand";

/**
 * Los prefijos IIN se solapan (34/37 de Amex contra 30/36/38 de Diners; 5018
 * de Maestro contra 51-55 de Mastercard), así que el orden de detección es
 * lógica frágil que merece tests. Todos los números de abajo son los de prueba
 * públicos de cada red o pasan Luhn: ninguno corresponde a una tarjeta real.
 */

describe("detectCardBrand", () => {
  const CASES: [string, string][] = [
    ["4111 1111 1111 1111", "visa"],
    ["4012888888881881", "visa"],
    ["5555555555554444", "mastercard"],
    ["5105105105105100", "mastercard"],
    ["2223003122003222", "mastercard"], // rango 2-series
    ["378282246310005", "amex"],
    ["371449635398431", "amex"],
    ["6011111111111117", "discover"],
    ["6011000990139424", "discover"],
    ["30569309025904", "diners"],
    ["38520000023237", "diners"],
    ["3530111333300000", "jcb"],
    ["6200000000000005", "unionpay"],
    ["6759649826438453", "maestro"],
    ["5018000000000009", "maestro"],
    ["9999999999999999", "generic"],
    ["", "generic"],
  ];

  it.each(CASES)("%s -> %s", (number, brand) => {
    expect(detectCardBrand(number).brand).toBe(brand);
  });

  /**
   * El caso que rompe una implementación ingenua: 34/37 son Amex, pero
   * 30/36/38 son Diners. Si Diners se probara primero, todo Amex caería mal.
   */
  it("no confunde Amex (34/37) con Diners (30/36/38)", () => {
    expect(detectCardBrand("3400000000000").brand).toBe("amex");
    expect(detectCardBrand("3700000000000").brand).toBe("amex");
    expect(detectCardBrand("3000000000000").brand).toBe("diners");
    expect(detectCardBrand("3600000000000").brand).toBe("diners");
    expect(detectCardBrand("3800000000000").brand).toBe("diners");
  });

  it("no confunde Maestro (5018/5020/5038) con Mastercard (51-55)", () => {
    expect(detectCardBrand("5018000000000").brand).toBe("maestro");
    expect(detectCardBrand("5100000000000").brand).toBe("mastercard");
  });

  it("Amex pide CVV de 4 dígitos; el resto, 3", () => {
    expect(detectCardBrand("378282246310005").cvvLength).toBe(4);
    expect(detectCardBrand("4111111111111111").cvvLength).toBe(3);
    expect(detectCardBrand("5555555555554444").cvvLength).toBe(3);
  });

  it("ignora espacios y guiones al detectar", () => {
    expect(detectCardBrand("4111-1111-1111-1111").brand).toBe("visa");
    expect(detectCardBrand("  3782 8224 63100 05 ").brand).toBe("amex");
  });

  it("toda marca trae colores y etiqueta utilizables", () => {
    for (const [number] of CASES) {
      const info = detectCardBrand(number);
      expect(info.from).toMatch(/^#[0-9a-f]{6}$/);
      expect(info.to).toMatch(/^#[0-9a-f]{6}$/);
      expect(info.lengths.length).toBeGreaterThan(0);
    }
  });
});

describe("formatCardNumber", () => {
  it("agrupa 4-4-4-4 por defecto", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
  });

  it("agrupa Amex como 4-6-5", () => {
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });

  it("agrupa Diners como 4-6-4", () => {
    expect(formatCardNumber("30569309025904")).toBe("3056 930902 5904");
  });

  it("es idempotente: reformatear no duplica espacios", () => {
    const once = formatCardNumber("4111111111111111");
    expect(formatCardNumber(once)).toBe(once);
  });

  it("no pierde dígitos que excedan la agrupación", () => {
    const long = "6759649826438453123"; // Maestro de 19
    expect(formatCardNumber(long).replace(/\s/g, "")).toBe(long);
  });

  it("formatea parcialmente mientras se escribe", () => {
    expect(formatCardNumber("4111")).toBe("4111");
    expect(formatCardNumber("41111")).toBe("4111 1");
  });
});

describe("maskCardNumber", () => {
  it("solo deja ver los últimos 4", () => {
    const masked = maskCardNumber("4111111111111111");
    expect(masked).toBe("•••• •••• •••• 1111");
    expect(masked).not.toContain("4111 1111 1111");
  });

  it("respeta la agrupación de Amex", () => {
    // Amex son 15 dígitos: 11 enmascarados + los 4 visibles caen así en 4-6-5.
    expect(maskCardNumber("378282246310005")).toBe("•••• •••••• •0005");
  });

  it("no enmascara números de 4 dígitos o menos", () => {
    expect(maskCardNumber("123")).toBe("123");
  });
});

describe("cardLast4", () => {
  it("devuelve los últimos cuatro", () => {
    expect(cardLast4("4111 1111 1111 1234")).toBe("1234");
  });

  it("devuelve lo que haya si son menos de cuatro", () => {
    expect(cardLast4("12")).toBe("12");
  });
});

describe("isValidLuhn", () => {
  const VALID = [
    "4111111111111111",
    "5555555555554444",
    "378282246310005",
    "6011111111111117",
    "30569309025904",
    "3530111333300000",
  ];

  it.each(VALID)("acepta %s", (n) => expect(isValidLuhn(n)).toBe(true));

  it("rechaza un dígito cambiado", () => {
    expect(isValidLuhn("4111111111111112")).toBe(false);
  });

  /** El error de captura más común: dos dígitos contiguos intercambiados. */
  it("detecta una transposición", () => {
    expect(isValidLuhn("4111111111111111")).toBe(true);
    expect(isValidLuhn("4111111111111611")).toBe(false);
  });

  it("rechaza números demasiado cortos", () => {
    expect(isValidLuhn("41111")).toBe(false);
    expect(isValidLuhn("")).toBe(false);
  });

  it("ignora el formato", () => {
    expect(isValidLuhn("4111 1111 1111 1111")).toBe(true);
  });
});

describe("hasValidLength", () => {
  it("Amex son 15, no 16", () => {
    expect(hasValidLength("378282246310005")).toBe(true);
    expect(hasValidLength("3782822463100051")).toBe(false);
  });

  it("Visa acepta 13, 16 y 19", () => {
    expect(hasValidLength("4111111111111")).toBe(true);
    expect(hasValidLength("4111111111111111")).toBe(true);
    expect(hasValidLength("4111111111111111111")).toBe(true);
    expect(hasValidLength("41111111111111")).toBe(false);
  });

  it("maxCardDigits acota el input por marca", () => {
    expect(maxCardDigits("378282246310005")).toBe(15);
    expect(maxCardDigits("4111111111111111")).toBe(19);
  });
});

describe("formatExpiry", () => {
  it("inserta la barra tras el mes", () => {
    expect(formatExpiry("12")).toBe("12/");
    expect(formatExpiry("1230")).toBe("12/30");
  });

  it("autocompleta el cero de meses 2-9", () => {
    // Un primer dígito de 2..9 solo puede ser 02..09: evita teclear el cero.
    expect(formatExpiry("4")).toBe("04/");
    expect(formatExpiry("9")).toBe("09/");
  });

  it("no autocompleta con 0 ni 1 (pueden ser 01..09 o 10..12)", () => {
    expect(formatExpiry("0")).toBe("0");
    expect(formatExpiry("1")).toBe("1");
  });

  it("descarta lo que pase de 4 dígitos", () => {
    expect(formatExpiry("123456")).toBe("12/34");
  });

  it("ignora caracteres no numéricos", () => {
    expect(formatExpiry("12/30")).toBe("12/30");
    expect(formatExpiry("ab12cd30")).toBe("12/30");
  });
});

describe("isExpiryValid", () => {
  const now = new Date(2026, 8, 3); // 3 de septiembre de 2026

  it("acepta un mes futuro", () => {
    expect(isExpiryValid("12/30", now)).toBe(true);
  });

  /** Una tarjeta vence al FINAL de su mes: el mes en curso sigue siendo válido. */
  it("acepta el mes en curso", () => {
    expect(isExpiryValid("09/26", now)).toBe(true);
  });

  it("rechaza el mes anterior", () => {
    expect(isExpiryValid("08/26", now)).toBe(false);
  });

  it("rechaza meses imposibles", () => {
    expect(isExpiryValid("00/30", now)).toBe(false);
    expect(isExpiryValid("13/30", now)).toBe(false);
  });

  it("rechaza formatos incompletos", () => {
    expect(isExpiryValid("12/", now)).toBe(false);
    expect(isExpiryValid("1230", now)).toBe(false);
    expect(isExpiryValid("", now)).toBe(false);
  });
});
