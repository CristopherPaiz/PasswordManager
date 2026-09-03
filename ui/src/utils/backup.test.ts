import { describe, expect, it } from "vitest";
import { VaultExportFile, VaultExportItem, buildExport, parseCsv, parseExport } from "./backup";
import { fromBase64, toBase64 } from "./crypto";

/**
 * Tests del respaldo. Un export es el único artefacto del baúl que sale del
 * navegador como archivo: si se cifra mal, el usuario publica sus contraseñas
 * sin saberlo; si se descifra mal, pierde el respaldo justo cuando lo necesita.
 *
 * `buildExport` usa los parámetros Argon2id de producción (64 MiB) y no los
 * recibe por parámetro, así que estos tests son lentos a propósito.
 */
const items: VaultExportItem[] = [
  {
    tipo: "password",
    title: "GitHub",
    username: "choper",
    password: "p4ssw0rd-#$%",
    url: "https://github.com",
    notes: "línea 1\nlínea 2",
    tags: ["dev"],
    favorite: true,
  },
  {
    tipo: "card",
    title: "Visa",
    username: "",
    password: "",
    url: "",
    notes: "",
    cardHolder: "CRISTOPHER PAIZ",
    cardNumber: "4111111111111111",
    cardExpiry: "12/30",
    cardCvv: "123",
  },
];

const EXPORT_PASSWORD = "clave-de-exportación-larga";

describe("respaldo cifrado", () => {
  it("hace round-trip conservando tipo y campos", async () => {
    const file = await buildExport(items, EXPORT_PASSWORD);
    expect(await parseExport(file, EXPORT_PASSWORD)).toEqual(items);
  }, 60000);

  it("marca formato y versión para poder migrar después", async () => {
    const file = await buildExport(items, EXPORT_PASSWORD);
    expect(file.format).toBe("passwordmanager-vault");
    expect(file.version).toBe(1);
    expect(fromBase64(file.salt)).toHaveLength(16);
    expect(file.kdf.algo).toBe("argon2id");
  }, 60000);

  it("el archivo no contiene ningún dato en claro", async () => {
    const file = await buildExport(items, EXPORT_PASSWORD);
    const json = JSON.stringify(file);
    expect(json).not.toContain("GitHub");
    expect(json).not.toContain("choper");
    expect(json).not.toContain("4111111111111111");
  }, 60000);

  it("falla con la contraseña de exportación equivocada", async () => {
    const file = await buildExport(items, EXPORT_PASSWORD);
    await expect(parseExport(file, "clave-equivocada")).rejects.toThrow();
  }, 60000);

  it("rechaza un archivo de otro formato antes de derivar la llave", async () => {
    const ajeno = { format: "otra-cosa" } as unknown as VaultExportFile;
    await expect(parseExport(ajeno, EXPORT_PASSWORD)).rejects.toThrow("BAD_FORMAT");
  });

  it("falla si el archivo fue manipulado (integridad del tag GCM)", async () => {
    const file = await buildExport(items, EXPORT_PASSWORD);
    const ct = fromBase64(file.data.ct);
    ct[0] ^= 0xff;
    const alterado = { ...file, data: { ...file.data, ct: toBase64(ct) } };
    await expect(parseExport(alterado, EXPORT_PASSWORD)).rejects.toThrow();
  }, 60000);

  it("falla si le cambian el salt (no se puede re-derivar la llave)", async () => {
    const file = await buildExport(items, EXPORT_PASSWORD);
    const alterado = { ...file, salt: toBase64(new Uint8Array(16)) };
    await expect(parseExport(alterado, EXPORT_PASSWORD)).rejects.toThrow();
  }, 60000);

  it("dos exports de lo mismo usan salt distinto y dan ciphertext distinto", async () => {
    const a = await buildExport(items, EXPORT_PASSWORD);
    const b = await buildExport(items, EXPORT_PASSWORD);
    expect(a.salt).not.toBe(b.salt);
    expect(a.data.ct).not.toBe(b.data.ct);
  }, 60000);

  it("soporta un baúl vacío", async () => {
    const file = await buildExport([], EXPORT_PASSWORD);
    expect(await parseExport(file, EXPORT_PASSWORD)).toEqual([]);
  }, 60000);
});

describe("parseCsv", () => {
  it("mapea el formato de Chrome", () => {
    const csv = ["name,url,username,password", "GitHub,https://github.com,choper,secreto"].join(
      "\n",
    );
    expect(parseCsv(csv)).toEqual([
      {
        title: "GitHub",
        username: "choper",
        password: "secreto",
        url: "https://github.com",
        notes: "",
      },
    ]);
  });

  it("mapea el formato de Bitwarden (login_*)", () => {
    const csv = [
      "folder,favorite,type,name,notes,login_uri,login_username,login_password",
      "Trabajo,1,login,GitHub,mis notas,https://github.com,choper,secreto",
    ].join("\n");
    expect(parseCsv(csv)[0]).toMatchObject({
      title: "GitHub",
      username: "choper",
      password: "secreto",
      url: "https://github.com",
      notes: "mis notas",
    });
  });

  it("acepta encabezados en español", () => {
    const csv = "nombre,sitio,usuario,contraseña,notas\nBanco,https://b.com,juan,1234,nota";
    expect(parseCsv(csv)[0]).toMatchObject({
      title: "Banco",
      username: "juan",
      password: "1234",
      url: "https://b.com",
      notes: "nota",
    });
  });

  it("cae a email cuando no hay columna username", () => {
    const csv = "name,email,password\nSitio,juan@ejemplo.com,1234";
    expect(parseCsv(csv)[0].username).toBe("juan@ejemplo.com");
  });

  it("normaliza encabezados con mayúsculas y espacios", () => {
    const csv = " Name , URL , Username , Password \nGitHub,https://github.com,choper,secreto";
    expect(parseCsv(csv)[0].title).toBe("GitHub");
  });

  it("respeta comas dentro de campos entrecomillados", () => {
    const csv = 'name,url,username,password\n"Banco, S.A.",https://b.com,juan,1234';
    expect(parseCsv(csv)[0].title).toBe("Banco, S.A.");
  });

  it("respeta saltos de línea dentro de campos entrecomillados", () => {
    const csv = 'name,notes,username,password\nSitio,"nota\ncon salto",juan,1234';
    expect(parseCsv(csv)).toHaveLength(1);
    expect(parseCsv(csv)[0].notes).toBe("nota\ncon salto");
  });

  it("desescapa las comillas dobles ('' -> ')", () => {
    const csv = 'name,url,username,password\n"Dice ""hola""",https://b.com,juan,1234';
    expect(parseCsv(csv)[0].title).toBe('Dice "hola"');
  });

  it("soporta saltos CRLF", () => {
    const csv = "name,url,username,password\r\nGitHub,https://github.com,choper,secreto\r\n";
    expect(parseCsv(csv)).toHaveLength(1);
    expect(parseCsv(csv)[0].title).toBe("GitHub");
  });

  it("lee la última fila aunque no termine en salto de línea", () => {
    const csv = "name,url,username,password\nA,,,1\nB,,,2";
    expect(parseCsv(csv).map((i) => i.title)).toEqual(["A", "B"]);
  });

  it("ignora filas completamente vacías", () => {
    const csv = "name,url,username,password\nGitHub,,choper,secreto\n\n,,,\n";
    expect(parseCsv(csv)).toHaveLength(1);
  });

  it("devuelve [] para un CSV vacío o con solo encabezados", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("name,url,username,password")).toEqual([]);
  });

  it("rellena con cadena vacía las columnas que falten", () => {
    const csv = "name,password\nSitio,1234";
    expect(parseCsv(csv)[0]).toEqual({
      title: "Sitio",
      username: "",
      password: "1234",
      url: "",
      notes: "",
    });
  });
});
