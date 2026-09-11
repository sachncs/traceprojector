import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import terser from '@rollup/plugin-terser'

const pkgName = 'traceprojector'

export default [
  {
    input: './traceprojector/traceprojector.js',
    output: {
      file: `dist/${pkgName}.esm.js`,
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      resolve(),
      commonjs()
    ]
  },
  {
    input: './traceprojector/traceprojector.js',
    output: {
      file: `dist/${pkgName}.cjs.js`,
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    plugins: [
      resolve(),
      commonjs()
    ]
  },
  {
    input: './traceprojector/traceprojector.js',
    output: {
      file: `dist/${pkgName}.umd.js`,
      format: 'umd',
      name: 'TraceProjector',
      sourcemap: true,
      outro: 'if(typeof window!=="undefined"){for(const _e of["Mesh","Whitney","Projector","Locator","Refinement","Weight","Bubble","Solver","ValidateError","ProjectError","SingularError","H1","Hcurl","Hdiv","L2"]){if(typeof TraceProjector[_e]!=="undefined"&&typeof window[_e]==="undefined"){window[_e]=TraceProjector[_e];}}}'
    },
    plugins: [
      resolve(),
      commonjs(),
      terser()
    ]
  }
]
