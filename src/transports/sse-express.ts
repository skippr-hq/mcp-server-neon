import express, { Request, Response, RequestHandler } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from '../server/index.js';
import { createNeonClient } from '../server/api.js';
import { logger, morganConfig, errorHandler } from '../utils/logger.js';
import { authRouter } from '../oauth/server.js';
import { SERVER_PORT, SERVER_HOST } from '../constants.js';
import {
  ensureCorsHeaders,
  extractBearerToken,
  requiresAuth,
} from '../oauth/utils.js';
import bodyParser from 'body-parser';

// API Key authentication middleware
function apiKeyAuthMiddleware(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    // Accept any non-empty Bearer token for now (or add your own validation logic)
    next();
    return;
  }
  // No Authorization header, pass to next middleware (OAuth)
  next();
}

export const createSseTransport = () => {
  const app = express();

  app.use(morganConfig);
  app.use(errorHandler);
  app.use(ensureCorsHeaders());

  // Use API key auth if Authorization header is present, otherwise use OAuth
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      // API key auth: skip OAuth routes
      apiKeyAuthMiddleware(req, res, next);
    } else {
      // OAuth: use authRouter
      void authRouter(req, res, next);
    }
  });

  // to support multiple simultaneous connections we have a lookup object from
  // sessionId to transport
  const transports = new Map<string, SSEServerTransport>();

  app.get('/', (async (req: Request, res: Response) => {
    const access_token = extractBearerToken(
      req.headers.authorization as string,
    );
    const neonClient = createNeonClient(access_token);
    const user = await neonClient.getCurrentUserInfo();
    res.send({
      hello: `${user.data.name} ${user.data.last_name}`.trim(),
    });
  }) as RequestHandler);

  app.get('/health-check', (req: Request, res: Response) => {
    res.send({
      status: 'healthy',
      message: 'Neon MCP Server is running',
      timestamp: new Date().toISOString(),
    });
  });

  app.get(
    '/sse',
    bodyParser.raw(),
    (req, res, next) => {
      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        // API key auth: allow
        next();
      } else {
        // OAuth: require authentication
        void requiresAuth()(req, res, next);
      }
    },
    async (req: Request, res: Response) => {
      const access_token = extractBearerToken(
        req.headers.authorization as string,
      );
      const transport = new SSEServerTransport('/messages', res);
      transports.set(transport.sessionId, transport);
      logger.info('new sse connection', {
        sessionId: transport.sessionId,
      });

      res.on('close', () => {
        logger.info('SSE connection closed', {
          sessionId: transport.sessionId,
        });
        transports.delete(transport.sessionId);
      });

      try {
        const server = createMcpServer(access_token);
        await server.connect(transport);
      } catch (error: unknown) {
        logger.error('Failed to connect to MCP server:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          error,
        });
      }
    },
  );

  app.post('/messages', bodyParser.raw(), (async (
    request: Request,
    response: Response,
  ) => {
    const sessionId = request.query.sessionId as string;
    const transport = transports.get(sessionId);
    logger.info('Received message', {
      sessionId,
      hasTransport: Boolean(transport),
    });

    try {
      if (transport) {
        await transport.handlePostMessage(request, response);
      } else {
        logger.warn('No transport found for sessionId', { sessionId });
        response.status(400).send('No transport found for sessionId');
      }
    } catch (error: unknown) {
      logger.error('Failed to handle post message:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error,
      });
    }
  }) as RequestHandler);

  try {
    app.listen({ port: SERVER_PORT });
    logger.info(`Server started on ${SERVER_HOST}`);
  } catch (err: unknown) {
    logger.error('Failed to start server:', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    process.exit(1);
  }
};
