import strip from '@rollup/plugin-strip'
import { terser } from 'rollup-plugin-terser'

const prodPlugins = [
    strip({
        functions: ['console.log', 'assert.*', 'panic', 'log'],
        labels: ['dev'],
    }),
    terser({
        mangle: {
            toplevel: true,
        },
        compress: {
            unused: true,
            collapse_vars: true,
            toplevel: true,
        },
        output: {
            comments: false,
        },
    }),
]
const devPlugins = []
export default [
    {
        input: 'src/dev.js',
        output: {
            file: 'dist/dev/index.js',
            format: 'cjs',
            sourcemap: true,
        },
        plugins: devPlugins,
    },
    {
        input: 'src/js.js',
        output: {
            file: 'dist/js.js',
            strict: false,
            format: 'cjs',
            sourcemap: true,
        },
        plugins: prodPlugins,
    },
    {
        input: 'src/css.js',
        output: {
            file: 'dist/css.js',
            strict: false,
            format: 'cjs',
            sourcemap: true,
        },
        plugins: prodPlugins,
    },
    {
        input: 'src/html.js',
        output: {
            file: 'dist/html.js',
            strict: false,
            format: 'cjs',
            sourcemap: true,
        },
        plugins: prodPlugins,
    },
    {
        input: 'src/store.js',
        output: {
            file: 'dist/store.js',
            strict: false,
            format: 'cjs',
            sourcemap: true,
        },
        plugins: prodPlugins,
    },
]
