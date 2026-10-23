// USGS horizon snapshot for P6. Run: node tools/fetch-horizon.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../data/raw', import.meta.url));
const url='https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/historical/n38w123/USGS_13_n38w123_20250826.tif';
const rel='horizon/USGS_13_n38w123_20250826.tif';
fs.mkdirSync(root+'/horizon',{recursive:true});
if(!fs.existsSync(root+'/'+rel)) { const r=await fetch(url);if(!r.ok)throw Error(r.status); await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(root+'/'+rel+'.part'));fs.renameSync(root+'/'+rel+'.part',root+'/'+rel); }
const hash=crypto.createHash('sha256'); for await(const c of fs.createReadStream(root+'/'+rel))hash.update(c);
// Separate manifest prevents simultaneous city downloads from overwriting this provenance entry.
fs.writeFileSync(root+'/horizon/MANIFEST.json',JSON.stringify({files:{[rel]:{url,source:'USGS 1/3 Arc Second n38w123 20250826',publicationDate:'2025-08-27',retrievedAt:new Date().toISOString(),bytes:fs.statSync(root+'/'+rel).size,sha256:hash.digest('hex'),license:'USGS 3DEP public domain',datum:'NAVD88 metres; NAD83 geographic grid'}}},null,2));
console.log(fs.statSync(root+'/'+rel).size);
