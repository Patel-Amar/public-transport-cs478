import React from "react";
import ReactDOM from "react-dom/client";
// import App from "./App";
// import { createBrowserRouter } from "react-router-dom";
// import Login from "./components/Login";
// import Search from "./components/Search";
// import Friends from "./components/Friends";
// import Feed from "./components/Feed";
// import Collection from "./components/Collection";
// import Wants from "./components/Wants";
// import Logout from "./components/Logout";
import { Provider } from "./components/ui/provider";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { createSystem, defaultConfig, defineConfig, SystemContext } from "@chakra-ui/react";
import Layout from "./components/layout";
import Login from "./components/Login";
import Register from "./components/Register";
import App from "./App";
import Search from "./components/Search";
import Feed from "./components/Feed";
import Friends from "./components/Friends";
import Wants from "./components/Wants";
import Collection from "./components/Collection";


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
                    <Route path="/register" element={<Register />} />
                    <Route element={<Layout />}>
                        <Route path="/" element={<App />} />
                        <Route path="/collection" element={<Collection />} />
                        <Route path="/feed" element={<Feed />} />
                        <Route path="/friends" element={<Friends />} />
                        <Route path="/search" element={<Search />} />
                        <Route path="/wants" element={<Wants />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </Provider>
    </React.StrictMode>,
);
