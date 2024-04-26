import js from '@eslint/js'
import globals from 'globals'

import prettier from 'eslint-plugin-prettier/recommended'

export default [
    {
        files: ['src/**/*.js'],
        ...prettier,
    },
    {
        ...prettier,
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',

            globals: {
                use: 'readonly',
                DLFEATURES: 'readonly',
                ...globals.browser,
            },
        },
        files: ['src/**/*.js'],
        rules: {
            ...js.configs.recommended.rules,
            semi: ['error', 'never'],
            'no-self-assign': 'off',
        },
    },
]
