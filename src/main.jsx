import React from "react";
import { createRoot } from "react-dom/client";
import PlayerWeb from "./PlayerWeb";
const App = () => (
    <div style={{ height:"100vh" }}>
        <PlayerWeb/>
    </div>
)
createRoot(document.getElementById("root")).render(<App/>);