import { hydrateRoot } from "react-dom/client";
import { App } from "..";

const root = document.getElementById("app-root");

hydrateRoot(root, <App />);
