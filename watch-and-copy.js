// Simple file watcher for development: copies plugin files to Obsidian folder on change
const fs = require('fs');
const { exec } = require('child_process');

const filesToWatch = [
  './dist/main.js',
  './manifest.json',
  './styles.css',
  './README.md',
];

console.log('Watching for changes to plugin files...');

filesToWatch.forEach((file) => {
  fs.watchFile(file, { interval: 500 }, () => {
    exec('bash ./copy-to-obsidian.sh', (err, stdout, stderr) => {
      if (err) {
        console.error('Copy failed:', err);
      } else {
        console.log('Copied plugin files to Obsidian.');
      }
    });
  });
});
