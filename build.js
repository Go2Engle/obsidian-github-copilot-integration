const esbuild = require('esbuild');
const fs = require('fs');

const production = process.argv.includes('--production');

const removeIdentityEnvReads = {
  name: 'remove-identity-env-reads',
  setup(build) {
    build.onLoad({ filter: /node_modules\/(@github\/copilot-sdk|vscode-jsonrpc)\// }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      return {
        contents: source
          .replace(/process\.env\[['"]XDG_RUNTIME_DIR['"]\]/g, 'undefined')
          .replace(/process\.env\.XDG_RUNTIME_DIR/g, 'undefined')
          .replace(/env:\s*options\.env\s*\?\?\s*process\.env/g, 'env: options.env'),
        loader: 'js',
      };
    });
  },
};

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
      plugins: [removeIdentityEnvReads],
      logLevel: 'info',
    });

    console.log('✓ Build complete');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
