import { Navigate } from "react-router";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useSettingsStore } from "@store/settings.store";
import { ROUTES, START_PAGE_PATHS } from "@constants/app.constants";

// Ruta raíz "/": no hay landing. Autenticado → página de inicio configurada;
// si no, → login. El logo de la app apunta aquí y se comporta igual.
export const IndexRedirect = () => {
  const { data, isLoading } = useAuthQuery();
  const startPage = useSettingsStore((s) => s.startPage);

  if (isLoading) return null;

  if (data?.user) {
    const target = START_PAGE_PATHS.includes(startPage) ? startPage : ROUTES.VAULT;
    return <Navigate to={target} replace />;
  }

  return <Navigate to={ROUTES.LOGIN} replace />;
};
