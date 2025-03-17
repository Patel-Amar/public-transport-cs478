import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "./components/ui/provider";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { createSystem, defaultConfig, defineConfig, SystemContext } from "@chakra-ui/react";
import Layout from "./components/layout";
import Login from "./components/Login";
import App from "./App";
import Favorites from "./components/Favorites";
import FindRoute from "./components/FindRoute";


const customConfig = defineConfig({
    globalCss: {
        "html, body": {
            backgroundColor: "#171923",
            margin: 0,
            padding: 0
        }
    },
})


export const system: SystemContext = createSystem(defaultConfig, customConfig)

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <Provider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route element={<Layout />}>
                        <Route path="/" element={<App />} />
                        <Route path="/home" element={<FindRoute />} />
                        <Route path="/favorites" element={<Favorites />} />
                        <Route path="*" element={<FindRoute />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </Provider>
    </React.StrictMode>,
);
