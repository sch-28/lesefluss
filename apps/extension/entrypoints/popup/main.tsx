import { createRoot } from "react-dom/client";

import "../../src/assets/style.css";
import { Popup } from "./popup";

const root = document.getElementById("root");
if (!root) throw new Error("Popup root element not found.");

createRoot(root).render(<Popup />);
