import { lazy } from "react";
import { createBrowserRouter } from "react-router";
import { ROUTES } from "@constants/app.constants";
import { RootLayout } from "@layouts/RootLayout";
import { ProtectedLayout } from "@layouts/ProtectedLayout";

// Carga diferida (code splitting): cada página es su propio chunk.
const Home = lazy(() => import("@pages/public/Home").then((m) => ({ default: m.Home })));
const Login = lazy(() => import("@pages/public/Login").then((m) => ({ default: m.Login })));
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
        element: <ProtectedLayout />,
        children: [
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
