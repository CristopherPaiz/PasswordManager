import { Navigate, Outlet } from "react-router";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { ROUTES } from "@constants/app.constants";

/**
 * Rutas solo para admin (hoy: el historial de errores, que expone stack traces).
 *
 * Esto NO es la protección: la API responde 403 aunque alguien navegue a mano.
 * Es para que un usuario normal no aterrice en una pantalla rota — y para no
 * anunciarle que existe un panel al que no tiene acceso.
 *
 * Va anidado dentro de ProtectedLayout, así que aquí la sesión ya está resuelta.
 */
export const AdminLayout = () => {
  const { data } = useAuthQuery();

  if (data?.user && data.user.rol !== "admin") {
    return <Navigate to={ROUTES.VAULT} replace />;
  }

  return <Outlet />;
};
