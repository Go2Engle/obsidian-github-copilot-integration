const esbuild = require('esbuild');
const fs = require('fs');

const production = process.argv.includes('--production');

async function build() {
  try {
    await esbuild.build({
      entryPoints: ['src/main.ts'],
      bundle: true,
      external: ['obsidian', 'electron', '@codemirror/state', '@codemirror/view'],
      format: 'cjs',
      target: 'es2018',
      platform: 'node',
      outfile: 'dist/main.js',
      sourcemap: production ? false : 'inline',
      minify: production,
      logLevel: 'info',
    });

    console.log('✓ Build complete');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
