// A small static file server for the browser tests. Python's http.server accepts only five
// queued connections, which is too few once two test pages each fetch the page's modules.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2] || 'site'), port = Number(process.argv[3] || 8765);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml' };
http.createServer((request, response) => {
  let file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  if (file.endsWith(path.sep) || file === root) file = path.join(file, 'index.html');
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  });
}).listen(port, '127.0.0.1');
