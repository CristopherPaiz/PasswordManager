import { lazy } from "react";
import { createBrowserRouter } from "react-router";
import { ROUTES } from "@constants/app.constants";
import { RootLayout } from "@layouts/RootLayout";
import { ProtectedLayout } from "@layouts/ProtectedLayout";

// Carga diferida (code splitting): cada página es su propio chunk.
const Home = lazy(() => import("@pages/public/Home").then((m) => ({ default: m.Home })));
const Login = lazy(() => import("@pages/public/Login").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("@pages/public/Register").then((m) => ({ default: m.Register })));
const Vault = lazy(() => import("@pages/protected/Vault").then((m) => ({ default: m.Vault })));
const Dashboard = lazy(() => import("@pages/protected/Dashboard").then((m) => ({ default: m.Dashboard })));
const Errors = lazy(() => import("@pages/protected/Errors").then((m) => ({ default: m.Errors })));
const NotFound = lazy(() => import("@pages/public/NotFound").then((m) => ({ default: m.NotFound })));

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: ROUTES.HOME,
        element: <Home />,
      },
      {
        path: ROUTES.LOGIN,
        element: <Login />,
      },
      {
        path: ROUTES.REGISTER,
        element: <Register />,
      },
      {
        element: <ProtectedLayout />,
        children: [
          {
            path: ROUTES.VAULT,
            element: <Vault />,
          },
          {
            path: ROUTES.DASHBOARD,
            element: <Dashboard />,
          },
          {
            path: ROUTES.ERRORS,
            element: <Errors />,
          },
        ],
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
]);
