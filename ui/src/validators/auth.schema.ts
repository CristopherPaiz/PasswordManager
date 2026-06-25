import { z } from "zod";
import type { TFunction } from "i18next";
import { isMasterAcceptable } from "@utils/password-strength";

export interface LoginForm {
  username: string;
  password: string;
}

export interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface RecoveryForm {
  username: string;
  recoveryKey: string;
  password: string;
  confirmPassword: string;
}

// Schema con mensajes traducidos. Espeja la validación del backend (api/src/validators).
export const createLoginSchema = (t: TFunction) =>
  z.object({
    username: z.string().trim().min(1, t("login.errors.usernameRequired")),
    password: z.string().min(1, t("login.errors.passwordRequired")),
  });

export const createRegisterSchema = (t: TFunction) =>
  z
    .object({
      username: z
        .string()
        .trim()
        .min(3, t("register.errors.usernameShort"))
        .max(30, t("register.errors.usernameLong"))
        .regex(/^[a-z0-9_]+$/i, t("register.errors.usernameInvalid")),
      email: z.email(t("register.errors.emailInvalid")),
      // La contraseña maestra es la ÚNICA llave del baúl: exigimos longitud real
      // y bloqueamos las débiles. No se puede validar en el server (nunca recibe
      // la maestra, solo el authHash derivado) → la regla vive aquí.
      password: z
        .string()
        .min(12, t("register.errors.passwordShort"))
        .refine(isMasterAcceptable, { message: t("register.errors.passwordWeak") }),
      confirmPassword: z.string().min(1, t("register.errors.confirmRequired")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("register.errors.passwordMismatch"),
      path: ["confirmPassword"],
    });

export const createRecoverySchema = (t: TFunction) =>
  z
    .object({
      username: z.string().trim().min(1, t("register.errors.usernameShort")),
      recoveryKey: z.string().trim().min(1, t("recovery.errors.keyRequired")),
      password: z
        .string()
        .min(12, t("register.errors.passwordShort"))
        .refine(isMasterAcceptable, { message: t("register.errors.passwordWeak") }),
      confirmPassword: z.string().min(1, t("register.errors.confirmRequired")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("register.errors.passwordMismatch"),
      path: ["confirmPassword"],
    });
