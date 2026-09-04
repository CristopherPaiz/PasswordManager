import { describe, it, expect } from "vitest";
import {
  TOTP_DEFAULTS,
  formatCode,
  generateTotpCode,
  isValidSecret,
  normalizeSecret,
  parseTotpInput,
  secondsRemaining,
} from "./totp";

/**
 * Vectores del RFC 6238 (apéndice B). El secreto de prueba es la cadena ASCII
 * "12345678901234567890"; en base32 son estos 32 caracteres. Si estos valores
 * cuadran, la implementación es compatible con Google Authenticator y con
 * cualquier servicio que siga el estándar.
 */
const RFC_SECRET_SHA1 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
// El RFC alarga el secreto según el hash: 32 bytes para SHA256 y 64 para
// SHA512, siempre con los dígitos "1234567890" repetidos y truncados. En base32
// eso deja relleno (`=`) al final, que `normalizeSecret` recorta.
const RFC_SECRET_SHA256 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA====";
const RFC_SECRET_SHA512 =
  "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA=";

describe("generateTotpCode: vectores del RFC 6238", () => {
  // El RFC publica códigos de 8 dígitos para poder comparar sin ambigüedad.
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("SHA1, epoch %i → %s", async (epochSegundos, esperado) => {
    const code = await generateTotpCode(
      { secret: RFC_SECRET_SHA1, digits: 8, period: 30, algorithm: "SHA1" },
      epochSegundos * 1000,
    );
    expect(code).toBe(esperado);
  });

  it.each([
    [59, "46119246"],
    [1111111109, "68084774"],
    [2000000000, "90698825"],
  ])("SHA256, epoch %i → %s", async (epochSegundos, esperado) => {
    const code = await generateTotpCode(
      { secret: normalizeSecret(RFC_SECRET_SHA256), digits: 8, period: 30, algorithm: "SHA256" },
      epochSegundos * 1000,
    );
    expect(code).toBe(esperado);
  });

  it.each([
    [59, "90693936"],
    [1111111109, "25091201"],
    [2000000000, "38618901"],
  ])("SHA512, epoch %i → %s", async (epochSegundos, esperado) => {
    const code = await generateTotpCode(
      { secret: normalizeSecret(RFC_SECRET_SHA512), digits: 8, period: 30, algorithm: "SHA512" },
      epochSegundos * 1000,
    );
    expect(code).toBe(esperado);
  });
});

describe("generateTotpCode: comportamiento", () => {
  const base = { secret: RFC_SECRET_SHA1, ...TOTP_DEFAULTS };

  it("devuelve 6 dígitos por defecto", async () => {
    const code = await generateTotpCode(base, 59_000);
    expect(code).toMatch(/^\d{6}$/);
    // Los 6 dígitos son la cola del vector de 8 del RFC.
    expect(code).toBe("287082");
  });

  it("el código no cambia dentro del mismo paso de 30s", async () => {
    const inicio = await generateTotpCode(base, 60_000);
    const final = await generateTotpCode(base, 89_999);
    expect(final).toBe(inicio);
  });

  it("el código cambia al cruzar al paso siguiente", async () => {
    const antes = await generateTotpCode(base, 89_999);
    const despues = await generateTotpCode(base, 90_000);
    expect(despues).not.toBe(antes);
  });

  it("respeta un periodo distinto de 30s", async () => {
    const code60 = await generateTotpCode({ ...base, period: 60 }, 59_000);
    expect(code60).not.toBe(await generateTotpCode(base, 59_000));
    // Con periodo 60, el contador de t=59s es el mismo que el de t=0.
    expect(code60).toBe(await generateTotpCode({ ...base, period: 60 }, 0));
  });

  it("rechaza un secreto con caracteres fuera del alfabeto base32", async () => {
    await expect(generateTotpCode({ ...base, secret: "NO-ES-BASE32-1890" })).rejects.toThrow(
      "TOTP_BAD_SECRET",
    );
  });
});

describe("parseTotpInput", () => {
  it("acepta el secreto pelado y aplica los valores por defecto", () => {
    expect(parseTotpInput(RFC_SECRET_SHA1)).toEqual({ secret: RFC_SECRET_SHA1, ...TOTP_DEFAULTS });
  });

  it("tolera espacios, guiones y minúsculas (como se copia de una web)", () => {
    const config = parseTotpInput("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq");
    expect(config.secret).toBe(RFC_SECRET_SHA1);
  });

  it("extrae secreto, emisor y cuenta de un URI otpauth", () => {
    const config = parseTotpInput(
      `otpauth://totp/GitHub:ana@ejemplo.com?secret=${RFC_SECRET_SHA1}&issuer=GitHub`,
    );

    expect(config.secret).toBe(RFC_SECRET_SHA1);
    expect(config.issuer).toBe("GitHub");
    expect(config.account).toBe("ana@ejemplo.com");
    expect(config.digits).toBe(6);
    expect(config.period).toBe(30);
  });

  it("respeta digits, period y algorithm del URI", () => {
    const config = parseTotpInput(
      `otpauth://totp/Banco?secret=${RFC_SECRET_SHA1}&digits=8&period=60&algorithm=SHA256`,
    );

    expect(config).toMatchObject({ digits: 8, period: 60, algorithm: "SHA256" });
  });

  it("ignora parámetros basura y cae a los valores por defecto", () => {
    const config = parseTotpInput(
      `otpauth://totp/X?secret=${RFC_SECRET_SHA1}&digits=abc&period=0&algorithm=MD5`,
    );

    expect(config).toMatchObject(TOTP_DEFAULTS);
  });

  // HOTP va por contador, no por reloj: aceptarlo daría códigos siempre malos.
  it.each([
    ["URI de HOTP", `otpauth://hotp/X?secret=${RFC_SECRET_SHA1}&counter=1`],
    ["URI sin secreto", "otpauth://totp/X?issuer=Y"],
    ["URI con secreto inválido", "otpauth://totp/X?secret=###"],
    ["secreto muy corto", "ABCDEF"],
    ["texto vacío", "   "],
  ])("rechaza %s", (_caso, entrada) => {
    expect(() => parseTotpInput(entrada)).toThrow("TOTP_BAD_SECRET");
  });
});

describe("helpers de presentación", () => {
  it("isValidSecret exige base32 y longitud mínima", () => {
    expect(isValidSecret(RFC_SECRET_SHA1)).toBe(true);
    expect(isValidSecret("gezd gnbv gy3t qojq")).toBe(true);
    expect(isValidSecret("ABCDEFGH")).toBe(false);
    expect(isValidSecret("11111111111111111")).toBe(false);
  });

  it("secondsRemaining cuenta hacia el final del paso", () => {
    expect(secondsRemaining(30, 0)).toBe(30);
    expect(secondsRemaining(30, 1_000)).toBe(29);
    expect(secondsRemaining(30, 29_000)).toBe(1);
    expect(secondsRemaining(30, 30_000)).toBe(30);
  });

  it("formatCode parte el código en dos mitades", () => {
    expect(formatCode("123456")).toBe("123 456");
    expect(formatCode("12345678")).toBe("1234 5678");
  });
});
