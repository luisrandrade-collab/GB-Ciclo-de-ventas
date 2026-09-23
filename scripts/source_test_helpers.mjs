// v7.9.24: ejecutar funciones de la fuente real, sin cargar app ni Firebase.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const source=file=>readFileSync(resolve(root,file),'utf8');
const drift=source('scripts/check_drift.mjs');
const extractor=vm.createContext({});
vm.runInContext(drift.slice(drift.indexOf('function extractFn('),drift.indexOf('// Normaliza:')),extractor);
export function functionSource(file,name){
  const src=source(file);
  let body;
  const match=new RegExp('function\\s+'+name+'\\s*\\(').exec(src);
  if(match){
    // Saltar parámetros balanceados: pueden contener defaults/destructuring con {}.
    let i=match.index+match[0].length,depth=1,quote=null;
    for(;i<src.length&&depth;i++){
      const ch=src[i];
      if(quote){if(ch==='\\'){i++;continue}if(ch===quote)quote=null;continue}
      if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}
      if(ch==='(')depth++;if(ch===')')depth--;
    }
    const opening=src.indexOf('{',i);
    const simplified=extractor.extractFn('function '+name+'()'+src.slice(opening),name);
    body=src.slice(match.index,opening)+simplified.slice(simplified.indexOf('{'));
  }else body=extractor.extractFn(src,name);
  if(!body)throw new Error('No existe '+name+' en '+file);
  const index=src.indexOf(body);
  return (src.slice(Math.max(0,index-6),index)==='async '?'async ':'')+body;
}
export function loadSourceFunctions(entries,globals={}){
  const context=vm.createContext(globals);
  for(const [file,name] of entries)vm.runInContext(functionSource(file,name),context,{filename:file});
  return context;
}
