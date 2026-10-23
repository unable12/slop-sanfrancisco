// Local release package only. No network, deployment or source mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'dist');
await fs.mkdir(out,{recursive:true});
for(const name of ['index.html','css','js','LICENSE','NOTICE.md'])await fs.cp(path.join(root,name),path.join(out,name),{recursive:true});
// Raw inputs and obsolete development-box binaries are never shipped.
await fs.mkdir(path.join(out,'data'),{recursive:true});
for(const name of ['terrain-core.bin','buildings-core.bin','groundmask-core.bin','terrain-region.bin','region'])await fs.cp(path.join(root,'data',name),path.join(out,'data',name),{recursive:true});
console.log(`Static package: ${out}. Serve over HTTPS or localhost; Three.js still loads from the pinned CDN.`);
