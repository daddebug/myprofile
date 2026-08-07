import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { RouteScrollReset } from "./components/RouteScrollReset";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <RouteScrollReset />
      <App />
    </BrowserRouter>
  </StrictMode>,
);
