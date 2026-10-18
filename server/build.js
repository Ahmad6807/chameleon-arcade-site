import {mkdir,copyFile,rm} from 'node:fs/promises';
const files=['index.html','games.js','games.css','app.js','app.css'];
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const file of files)await copyFile(file,`dist/${file}`);
console.log('Built allowlisted static assets in dist/');
