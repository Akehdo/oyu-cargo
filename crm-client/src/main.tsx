import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./features/auth/context/AuthContext";
import { RouterProvider } from "./shared/router";
import { initMiniApp } from "./shared/telegram/miniApp";
import "./styles.css";

initMiniApp();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </RouterProvider>
  </React.StrictMode>,
);
