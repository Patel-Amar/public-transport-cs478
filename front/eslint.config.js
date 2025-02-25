import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        rules: {

        }
    },
    {
        ignores: ["node_modules/", "dist/", "tests/", "font/", "src/components/ui/"]
    }
);