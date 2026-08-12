import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme, CssBaseline, Button } from "@mui/material";
import { LightMode, DarkMode } from "@mui/icons-material";

const theme = createTheme({
  palette: {
    mode: "light", // Change to "dark" for dark mode
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <h1>Hello, Material 3!</h1>
      <Button variant="contained" startIcon={<LightMode />}>Light Mode</Button>
      <Button variant="outlined" startIcon={<DarkMode />}>Dark Mode</Button>
    </ThemeProvider>
  );
}

const root = document.getElementById("root");
createRoot(root).render(<App />);
