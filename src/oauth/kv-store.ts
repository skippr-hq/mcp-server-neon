import { KeyvPostgres, KeyvPostgresOptions } from '@keyv/postgres';
import { logger } from '../utils/logger.js';
import { AuthorizationCode, Client, Token } from 'oauth2-server';
import Keyv from 'keyv';

const SCHEMA = 'mcpauth';

// Detect if running in API key auth mode (i.e., if Bearer token is expected)
// Since we can't check headers at module load, use an env var or default to Postgres if OAUTH_DATABASE_URL is set
const usePostgres = Boolean(process.env.OAUTH_DATABASE_URL);

const createKeyv = <T>(options: KeyvPostgresOptions) =>
  usePostgres
    ? new Keyv<T>({ store: new KeyvPostgres(options) })
    : new Keyv<T>();

export const clients = createKeyv<Client>({
  connectionString: process.env.OAUTH_DATABASE_URL,
  schema: SCHEMA,
  table: 'clients',
});

export const tokens = createKeyv<Token>({
  connectionString: process.env.OAUTH_DATABASE_URL,
  schema: SCHEMA,
  table: 'tokens',
});

export type RefreshToken = {
  refreshToken: string;
  refreshTokenExpiresAt?: Date | undefined;
  accessToken: string;
};

export const refreshTokens = createKeyv<RefreshToken>({
  connectionString: process.env.OAUTH_DATABASE_URL,
  schema: SCHEMA,
  table: 'refresh_tokens',
});

export const authorizationCodes = createKeyv<AuthorizationCode>({
  connectionString: process.env.OAUTH_DATABASE_URL,
  schema: SCHEMA,
  table: 'authorization_codes',
});

// Only attach error listeners if using Postgres (OAuth mode)
if (usePostgres) {
  clients.on('error', (err) => {
    logger.error('Clients keyv error:', { err });
  });
  tokens.on('error', (err) => {
    logger.error('Tokens keyv error:', { err });
  });
  refreshTokens.on('error', (err) => {
    logger.error('Refresh tokens keyv error:', { err });
  });
  authorizationCodes.on('error', (err) => {
    logger.error('Authorization codes keyv error:', { err });
  });
}
