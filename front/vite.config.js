import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import eslint from "vite-plugin-eslint";
import tsconfigPaths from "vite-tsconfig-paths";
// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), eslint({ lintOnStart: true }), tsconfigPaths()],
    server: {
        proxy: {
            "/api": "http://localhost:3002",
        },
    },
});
