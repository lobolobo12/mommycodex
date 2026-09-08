import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/companion-features.css";
import "./components/mascot.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
