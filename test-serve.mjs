import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
export function serve(dir,port=0){return new Promise(r=>{const s=http.createServer((q,res)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(dir,p);if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);}).listen(port,()=>r(s));});}
