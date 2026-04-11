import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { resolve, dirname } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import type { RequestRecord, Statistics, DailyStat } from './models.js';

export class SQLiteStore {
  private db: Database;
  private sql: SqlJsStatic;
  private dbPath: string;

  private constructor(sql: SqlJsStatic, db: Database, dbPath: string) {
    this.sql = sql;
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(dbPath: string): Promise<SQLiteStore> {
    const dir = dirname(resolve(dbPath));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const sql = await initSqlJs();
    let db: Database;
    if (existsSync(resolve(dbPath))) {
      const buffer = readFileSync(resolve(dbPath));
      db = new sql.Database(buffer);
    } else {
      db = new sql.Database();
    }

    const store = new SQLiteStore(sql, db, dbPath);
    store.initSchema();
    return store;
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        model TEXT NOT NULL,
        provider TEXT,
        routed_model TEXT,
        raw_request TEXT NOT NULL,
        raw_response TEXT,
        messages_json TEXT,
        system_json TEXT,
        tools_json TEXT,
        max_tokens INTEGER,
        temperature REAL,
        thinking_json TEXT,
        response_content TEXT,
        stop_reason TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        client_ip TEXT,
        error TEXT
      )
    `);

    try {
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests(provider)`);
    } catch {}

    this.save();
  }

  private save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  saveRequest(record: RequestRecord): void {
    this.db.run(`
      INSERT INTO requests (
        id, timestamp, model, provider, routed_model,
        raw_request, raw_response,
        messages_json, system_json, tools_json,
        max_tokens, temperature, thinking_json,
        response_content, stop_reason,
        input_tokens, output_tokens, duration_ms,
        client_ip, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      record.id, record.timestamp.toISOString(), record.model, record.provider, record.routed_model,
      record.raw_request, record.raw_response,
      record.messages_json, record.system_json, record.tools_json,
      record.max_tokens, record.temperature, record.thinking_json,
      record.response_content, record.stop_reason,
      record.input_tokens, record.output_tokens, record.duration_ms,
      record.client_ip, record.error,
    ]);
    this.save();
  }

  getRequestById(id: string): RequestRecord | null {
    const result = this.db.exec(`SELECT * FROM requests WHERE id = ?`, [id]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowToRecord(result[0].values[0], result[0].columns);
  }

  listRequests(options: {
    limit?: number;
    offset?: number;
    model?: string;
    provider?: string;
    startDate?: Date;
    endDate?: Date;
  }): RequestRecord[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.model) { conditions.push('model = ?'); params.push(options.model); }
    if (options.provider) { conditions.push('provider = ?'); params.push(options.provider); }
    if (options.startDate) { conditions.push('timestamp >= ?'); params.push(options.startDate.toISOString()); }
    if (options.endDate) { conditions.push('timestamp <= ?'); params.push(options.endDate.toISOString()); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const result = this.db.exec(
      `SELECT * FROM requests ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => this.rowToRecord(row, result[0].columns));
  }

  getStats(startDate?: Date, endDate?: Date): Statistics {
    const conditions: string[] = [];
    const params: any[] = [];

    if (startDate) { conditions.push('timestamp >= ?'); params.push(startDate.toISOString()); }
    if (endDate) { conditions.push('timestamp <= ?'); params.push(endDate.toISOString()); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalResult = this.db.exec(`SELECT COUNT(*) as count FROM requests ${whereClause}`, params);
    const total_requests = totalResult.length > 0 ? (totalResult[0].values[0][0] as number) : 0;

    const tokensResult = this.db.exec(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total FROM requests ${whereClause}`,
      params
    );
    const total_tokens = tokensResult.length > 0 ? (tokensResult[0].values[0][0] as number) : 0;

    const latencyResult = this.db.exec(
      `SELECT COALESCE(AVG(duration_ms), 0) as avg FROM requests ${whereClause}`,
      params
    );
    const avg_latency_ms = latencyResult.length > 0 ? Math.round(latencyResult[0].values[0][0] as number) : 0;

    const modelResult = this.db.exec(
      `SELECT model, COUNT(*) as count FROM requests ${whereClause} GROUP BY model`,
      params
    );
    const model_breakdown: Record<string, number> = {};
    if (modelResult.length > 0) {
      for (const row of modelResult[0].values) {
        model_breakdown[row[0] as string] = row[1] as number;
      }
    }

    const providerResult = this.db.exec(
      `SELECT provider, COUNT(*) as count FROM requests ${whereClause} GROUP BY provider`,
      params
    );
    const provider_breakdown: Record<string, number> = {};
    if (providerResult.length > 0) {
      for (const row of providerResult[0].values) {
        if (row[0]) provider_breakdown[row[0] as string] = row[1] as number;
      }
    }

    const dailyResult = this.db.exec(`
      SELECT DATE(timestamp) as date, COUNT(*) as requests, SUM(input_tokens + output_tokens) as tokens
      FROM requests ${whereClause}
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
      LIMIT 30
    `, params);

    const daily_requests: DailyStat[] = [];
    if (dailyResult.length > 0) {
      for (const row of dailyResult[0].values) {
        daily_requests.push({
          date: row[0] as string,
          requests: row[1] as number,
          tokens: (row[2] as number) || 0,
        });
      }
    }

    return { total_requests, total_tokens, avg_latency_ms, model_breakdown, provider_breakdown, daily_requests };
  }

  clearAll(): void {
    this.db.run('DELETE FROM requests');
    this.save();
  }

  private rowToRecord(row: any[], columns: string[]): RequestRecord {
    const obj: Record<string, any> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return {
      id: obj.id,
      timestamp: new Date(obj.timestamp),
      model: obj.model,
      provider: obj.provider,
      routed_model: obj.routed_model,
      raw_request: obj.raw_request,
      raw_response: obj.raw_response,
      messages_json: obj.messages_json,
      system_json: obj.system_json,
      tools_json: obj.tools_json,
      max_tokens: obj.max_tokens,
      temperature: obj.temperature,
      thinking_json: obj.thinking_json,
      response_content: obj.response_content,
      stop_reason: obj.stop_reason,
      input_tokens: obj.input_tokens || 0,
      output_tokens: obj.output_tokens || 0,
      duration_ms: obj.duration_ms || 0,
      client_ip: obj.client_ip,
      error: obj.error,
    };
  }

  close(): void {
    this.save();
    this.db.close();
  }
}
