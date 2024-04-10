import strip from '@rollup/plugin-strip'
import terser from '@rollup/plugin-terser'
import stripCode from 'rollup-plugin-strip-code'

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

    for (const arg in args) {
        if (arg.startsWith('disable-')) {
            const feature = arg.slice(8)
            features[feature] = false
        }
        if (arg.startsWith('enable-')) {
            const feature = arg.slice(7)
            features[feature] = true
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

    const dlbanner = `// dreamland.js, MIT license\nconst DLFEATURES = [${Object.entries(
        features
    )
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => `'${feature}'`)
        .join(', ')}];`
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

    const sharedOutput = {}

    const iifeOutput = {
        format: 'iife',
        name: 'window',
        extend: true,
        sourcemap: true,
        ...sharedOutput,
    }

    const devOutput = {
        format: 'cjs',
        sourcemap: true,
        ...sharedOutput,
    }

    const output = args.dev ? devOutput : iifeOutput

    return [
        {
            input: 'src/main.js',
            output: {
                file: args.dloutput,
                ...output,
            },
            plugins: plugins,
        },
    ]
}
