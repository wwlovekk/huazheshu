import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installDesktopBridge } from "./desktop-bridge";
import "./style.css";
installDesktopBridge();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
