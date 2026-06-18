import { z } from "zod";
import type { TFunction } from "i18next";

export interface LoginForm {
  username: string;
  password: string;
}

// Schema con mensajes traducidos. Espeja la validación del backend (api/src/validators).
export const createLoginSchema = (t: TFunction) =>
  z.object({
    username: z.string().trim().min(1, t("login.errors.usernameRequired")),
    password: z.string().min(1, t("login.errors.passwordRequired")),
  });
