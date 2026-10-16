import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = fileURLToPath(new URL('.', import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 9247);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function resolvePublicFile(requestUrl) {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
  } catch {
    return null;
  }

  if (pathname === '/') pathname = '/index.html';

  const pathSegments = pathname.split('/').filter(Boolean);
  if (pathSegments.some((segment) => segment.startsWith('.'))) return null;

  const filePath = resolve(projectDirectory, `.${pathname}`);
  const pathFromProject = relative(projectDirectory, filePath);
  if (pathFromProject.startsWith(`..${sep}`) || pathFromProject === '..' || pathFromProject.startsWith(sep)) {
    return null;
  }

  return filePath;
}

function sendText(response, statusCode, message, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(message);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  const filePath = resolvePublicFile(request.url || '/');
  if (!filePath) {
    sendText(response, 404, 'Not found');
    return;
  }

  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) {
      sendText(response, 404, 'Not found');
      return;
    }

    const contentType = contentTypes.get(extname(filePath).toLowerCase());
    if (!contentType) {
      sendText(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Length': fileInfo.size,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      sendText(response, 404, 'Not found');
      return;
    }

    console.error(`Could not serve ${request.url}:`, error);
    sendText(response, 500, 'Internal server error');
  }
});

server.listen(port, host, () => {
  console.log(`LearnMap is running at http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error(`LearnMap server could not start: ${error.message}`);
  process.exitCode = 1;
});
