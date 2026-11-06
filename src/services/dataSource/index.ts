import { apiDataSource } from './api';
import type { DataSource } from './types';

/**
 * DristiX has a single data source: the Node.js backend.
 *
 * There used to be a `local` implementation backed by localStorage that
 * shipped the whole exam catalog — including every answer key — inside the
 * JavaScript bundle. It also doubled the number of code paths, which is how the
 * catalog quietly ended up empty in one build and populated in another. The
 * backend is the only source now, and the catalog lives in MongoDB.
 *
 * `getDataSource()` is kept as a function so call sites read the same as before
 * and a future backend swap stays a one-file change.
 */
let instance: DataSource | null = null;

export function getDataSource(): DataSource {
  if (!instance) instance = apiDataSource;
  return instance;
}

export type {
  AiDataSource,
  AuthDataSource,
  DataSource,
  ExamDataSource,
  NotificationDataSource,
} from './types';
