import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Publica from "./Publica.jsx";

// QR code das caixas abre /?q=TOKEN — página pública, sem login
const token = new URLSearchParams(window.location.search).get("q");
createRoot(document.getElementById("root")).render(token ? <Publica token={token} /> : <App />);
