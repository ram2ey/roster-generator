import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Latin-only subsets: staff names and UI copy are English, and shipping
// every Cyrillic/Greek/Vietnamese subset fontsource bundles by default would
// needlessly bloat the deployed build.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";

import "./index.css";
import App from "./App";
import AdminApp from "./AdminApp";

const RootApp = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/") ? AdminApp : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
