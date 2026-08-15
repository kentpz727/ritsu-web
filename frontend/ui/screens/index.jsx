import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <h1>Hello, Ritsu Web!</h1>;
}

const root = document.getElementById("root");
createRoot(root).render(<App />);
