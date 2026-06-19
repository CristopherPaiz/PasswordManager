// Estimación ligera de fuerza de contraseña (sin dependencias). Suficiente para
// guiar al usuario al elegir la maestra; NO es un análisis tipo zxcvbn.
export interface StrengthResult {
  score: number; // 0..4
  labelKey: string;
}

export const estimateStrength = (pw: string): StrengthResult => {
  if (!pw) return { score: 0, labelKey: "register.strength.weak" };

  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 16) score++;

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) score++;
  if (classes === 4 && pw.length >= 12) score++;

  if (pw.length < 8) score = 0; // demasiado corta = débil sí o sí
  score = Math.min(score, 4);

  const labels = ["weak", "weak", "fair", "good", "strong"];
  return { score, labelKey: `register.strength.${labels[score]}` };
};
