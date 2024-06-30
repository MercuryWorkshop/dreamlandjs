import strip from '@rollup/plugin-strip'
import terser from '@rollup/plugin-terser'
import stripCode from 'rollup-plugin-strip-code'
import { readFile } from 'node:fs/promises'

const packagemeta = JSON.parse(await readFile('package.json'))

export default (args) => {
    const plugins = []

    const stripfunctions = []

    if (!args.dev) {
        stripfunctions.push('console.log', 'assert.*', 'panic', 'log')
    }

    plugins.push(
        strip({
            functions: stripfunctions,
            sourceMap: true,
        })
    )

    if (!args.dev) {
        plugins.push(
            stripCode({
                start_comment: 'DEV.START',
                end_comment: 'DEV.END',
            })
        )
    }

    const features = {
        css: true,
        jsxLiterals: false,
        usestring: false,
        stores: false,
    }
    const polyfills = {
        scope: true,
    }

    for (const arg in args) {
        if (arg.startsWith('disable-')) {
            const feature = arg.slice(8)
            features[feature] = false
        }
        if (arg.startsWith('enable-')) {
            const feature = arg.slice(7)
            features[feature] = true
        }
        if (arg.startsWith('polyfill-')) {
            const feature = arg.slice(9)
            polyfills[feature] = true
        }
        if (arg.startsWith('dont-polyfill-')) {
            const feature = arg.slice(14)
            polyfills[feature] = false
        }
    }

    for (const [feature, enabled] of Object.entries(features)) {
        if (!enabled) {
            plugins.push(
                stripCode({
                    start_comment: `FEATURE.${feature.toUpperCase()}.START`,
                    end_comment: `FEATURE.${feature.toUpperCase()}.END`,
                })
            )
        }
    }
    for (const [fill, enabled] of Object.entries(polyfills)) {
        if (enabled) {
            plugins.push(
                stripCode({
                    start_comment: `NOT.POLYFILL.${fill.toUpperCase()}.START`,
                    end_comment: `NOT.POLYFILL.${fill.toUpperCase()}.END`,
                })
            )
        } else {
            plugins.push(
                stripCode({
                    start_comment: `POLYFILL.${fill.toUpperCase()}.START`,
                    end_comment: `POLYFILL.${fill.toUpperCase()}.END`,
                })
            )
        }
    }

    const dlbanner = `// dreamland.js, MIT license\nconst DLFEATURES = [${Object.entries(
        features
    )
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => `'${feature}'`)
        .join(', ')}]; const DLVERSION = '${packagemeta.version}';`
    if (args.dev || args.nominify) {
        plugins.push({
            banner() {
                return dlbanner
            },
        })
    } else {
        plugins.push(
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
                    preamble: dlbanner,
                },
            })
        )
    }

    const sharedOutput = {
        format: 'iife',
        name: 'window',
        extend: true,
        strict: false,
        plugins: [
            {
                name: 'iife-plus',
                renderChunk(code) {
                    // iife output doesn't support globals, and the name:"window" hack they told me to use on github doesn't work with a bundler
                    // regex is good enough
                    return code.replace(
                        /\(this\.window.?=.?this\.window.?\|\|.?\{\}\);/,
                        '(window)'
                    )
                },
            },
        ],
    }

    const iifeOutput = {
        sourcemap: true,
        ...sharedOutput,
    }

    const devOutput = {
        sourcemap: true,
        ...sharedOutput,
    }

    const output = args.dev ? devOutput : iifeOutput

    return [
        {
            input: 'src/main.js',
            external: ['window'],
            output,
            plugins: plugins,
        },
    ]
}
