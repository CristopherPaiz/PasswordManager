// Estimación ligera de fuerza de contraseña (sin dependencias). Suficiente para
// guiar al usuario al elegir la maestra; NO es un análisis tipo zxcvbn.
//
// Diseño passphrase-friendly: premia la LONGITUD, no solo la variedad de
// caracteres. Así una frase larga ("caballo correcto batería grapa") puntúa
// alto aunque sea toda en minúsculas — que es justo lo que recomendamos.
export interface StrengthResult {
  score: number; // 0..4
  labelKey: string;
}

const countClasses = (pw: string): number =>
  [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;

export const estimateStrength = (pw: string): StrengthResult => {
  if (!pw) return { score: 0, labelKey: "register.strength.weak" };

  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (pw.length >= 24) score++; // frase larga sube por longitud sola
  if (countClasses(pw) >= 3) score++; // o por variedad de caracteres

  if (pw.length < 10) score = 0; // demasiado corta = débil sí o sí
  score = Math.min(score, 4);

  const labels = ["weak", "weak", "fair", "good", "strong"];
  return { score, labelKey: `register.strength.${labels[score]}` };
};

// Piso mínimo ACEPTABLE para la contraseña maestra (la única llave del baúl).
// Se cumple con una frase larga (≥16) o con una contraseña más corta (≥12) que
// mezcle al menos 3 tipos de caracteres. Bloquea lo verdaderamente débil.
export const MIN_MASTER_SCORE = 2;

export const isMasterAcceptable = (pw: string): boolean =>
  estimateStrength(pw).score >= MIN_MASTER_SCORE;
