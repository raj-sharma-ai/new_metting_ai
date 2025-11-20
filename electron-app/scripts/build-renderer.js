const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');

const sharedConfig = {
  entryPoints: [path.join(__dirname, '../src/renderer/index.jsx')],
  bundle: true,
  outfile: path.join(__dirname, '../src/renderer/dist/renderer.js'),
  platform: 'browser',
  format: 'esm',
  sourcemap: true,
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.css': 'text'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(sharedConfig);
    await ctx.watch();
    console.log('👀 esbuild watching renderer files...');
  } else {
    await esbuild.build(sharedConfig);
    console.log('✅ Renderer bundle created');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

