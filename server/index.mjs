import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SessionAuth } from './session-auth.mjs';
import { syncRequestSchema, WorkspaceStore } from './workspace-store.mjs';

const MAX_AUTH_BODY_BYTES = 10 * 1024;
const MAX_SYNC_BODY_BYTES = 50 * 1024 * 1024;

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

const jsonResponse = (response, status, body) => {
    response.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(body));
};

const runtimeConfigResponse = (response) => {
    const runtimeConfig = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
        OPENAI_API_ENDPOINT: process.env.OPENAI_API_ENDPOINT ?? '',
        LLM_MODEL_NAME: process.env.LLM_MODEL_NAME ?? '',
        HIDE_CHARTDB_CLOUD: process.env.HIDE_CHARTDB_CLOUD ?? '',
        DISABLE_ANALYTICS: process.env.DISABLE_ANALYTICS ?? '',
    };
    response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/javascript; charset=utf-8',
    });
    response.end(`window.env = ${JSON.stringify(runtimeConfig)};`);
};

const readJsonBody = async (request, maximumBytes) => {
    const chunks = [];
    let size = 0;

    for await (const chunk of request) {
        size += chunk.length;
        if (size > maximumBytes) {
            const error = new Error('Request body is too large');
            error.status = 413;
            throw error;
        }
        chunks.push(chunk);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        const error = new Error('Request body is not valid JSON');
        error.status = 400;
        throw error;
    }
};

const requestAddress = (request) => {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return request.socket.remoteAddress ?? 'unknown';
};

const parseInteger = (name, fallback, minimum) => {
    const rawValue = process.env[name];
    const value = rawValue === undefined ? fallback : Number(rawValue);
    if (!Number.isInteger(value) || value < minimum) {
        throw new Error(`${name} must be an integer of at least ${minimum}`);
    }
    return value;
};

export const loadServerConfig = () => {
    if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
        process.loadEnvFile('.env');
    }

    const password = process.env.CHARTDB_SYNC_PASSWORD;
    if (!password) {
        throw new Error('CHARTDB_SYNC_PASSWORD is required');
    }

    return {
        password,
        intervalMs: parseInteger('CHARTDB_SYNC_INTERVAL_MS', 10_000, 1_000),
        filePath: process.env.CHARTDB_SYNC_FILE ?? './data/chartdb-sync.json',
        host: process.env.HOST ?? '127.0.0.1',
        port: parseInteger('PORT', 5173, 1),
    };
};

const serveFile = async (request, response, filePath) => {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
        return false;
    }

    response.writeHead(200, {
        'Content-Length': fileStats.size,
        'Content-Type':
            mimeTypes[extname(filePath)] ?? 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
        response.end();
    } else {
        createReadStream(filePath).pipe(response);
    }
    return true;
};

const serveProductionAsset = async (request, response) => {
    const distributionDirectory = resolve('dist');
    const url = new URL(request.url, 'http://localhost');
    const decodedPath = decodeURIComponent(url.pathname);
    const requestedPath = resolve(
        distributionDirectory,
        `.${decodedPath === '/' ? '/index.html' : decodedPath}`
    );

    if (
        requestedPath !== distributionDirectory &&
        !requestedPath.startsWith(`${distributionDirectory}${sep}`)
    ) {
        jsonResponse(response, 400, { error: 'Invalid path' });
        return;
    }

    try {
        if (await serveFile(request, response, requestedPath)) {
            return;
        }
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            throw error;
        }
    }

    await serveFile(
        request,
        response,
        resolve(distributionDirectory, 'index.html')
    );
};

const isAuthorized = (request, auth) =>
    auth.verify(request.headers.authorization);

export const startServer = async ({
    config = loadServerConfig(),
    development = process.argv.includes('--dev'),
} = {}) => {
    const store = new WorkspaceStore(config.filePath);
    await store.initialize();
    const auth = new SessionAuth(config.password);
    const vite = development
        ? await (
              await import('vite')
          ).createServer({
              appType: 'spa',
              server: { middlewareMode: true },
          })
        : null;

    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://localhost');

            if (
                request.method === 'GET' &&
                url.pathname === '/api/sync/health'
            ) {
                jsonResponse(response, 200, { ok: true });
                return;
            }

            if (request.method === 'GET' && url.pathname === '/config.js') {
                runtimeConfigResponse(response);
                return;
            }

            if (
                request.method === 'POST' &&
                url.pathname === '/api/sync/session'
            ) {
                const body = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
                const result = auth.login(
                    typeof body.password === 'string' ? body.password : '',
                    requestAddress(request)
                );

                if (!result.ok) {
                    jsonResponse(response, result.status, {
                        error:
                            result.status === 429
                                ? 'Too many attempts'
                                : 'Authentication failed',
                    });
                    return;
                }

                jsonResponse(response, 200, {
                    token: result.token,
                    expiresAt: result.expiresAt,
                    intervalMs: config.intervalMs,
                    ...store.getStatus(),
                });
                return;
            }

            if (url.pathname.startsWith('/api/sync')) {
                if (!isAuthorized(request, auth)) {
                    jsonResponse(response, 401, {
                        error: 'Authentication required',
                    });
                    return;
                }

                if (request.method === 'POST' && url.pathname === '/api/sync') {
                    const body = await readJsonBody(
                        request,
                        MAX_SYNC_BODY_BYTES
                    );
                    const syncRequest = syncRequestSchema.parse(body);
                    const result = await store.synchronize(syncRequest);
                    jsonResponse(response, 200, {
                        ...result,
                        intervalMs: config.intervalMs,
                        serverTime: new Date().toISOString(),
                    });
                    return;
                }

                if (
                    request.method === 'POST' &&
                    url.pathname === '/api/sync/recover'
                ) {
                    const workspace = await store.recover();
                    jsonResponse(response, 200, {
                        status: 'ok',
                        workspace,
                        conflicts: [],
                        intervalMs: config.intervalMs,
                        serverTime: new Date().toISOString(),
                    });
                    return;
                }

                jsonResponse(response, 404, { error: 'Not found' });
                return;
            }

            if (vite) {
                vite.middlewares(request, response, (error) => {
                    if (error) {
                        jsonResponse(response, 500, {
                            error: 'Development server error',
                        });
                    }
                });
                return;
            }

            await serveProductionAsset(request, response);
        } catch (error) {
            const status =
                Number.isInteger(error?.status) && error.status >= 400
                    ? error.status
                    : error?.name === 'ZodError'
                      ? 400
                      : 500;
            jsonResponse(response, status, {
                error:
                    status < 500
                        ? error.message
                        : 'The sync service could not complete the request',
            });
        }
    });

    await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(config.port, config.host, () => {
            server.off('error', rejectListen);
            resolveListen();
        });
    });

    return {
        server,
        store,
        url: `http://${config.host}:${config.port}`,
        close: async () => {
            await vite?.close();
            await new Promise((resolveClose, rejectClose) => {
                server.close((error) =>
                    error ? rejectClose(error) : resolveClose()
                );
            });
        },
    };
};

const isMainModule =
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
    startServer()
        .then(({ url }) => {
            console.log(`ChartDB is running at ${url}`);
        })
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
