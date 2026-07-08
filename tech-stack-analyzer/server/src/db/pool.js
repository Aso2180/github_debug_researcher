import Database from 'better-sqlite3';
import pg from 'pg';

let _client = null;

function initClient() {
  const url = process.env.DATABASE_URL || 'sqlite:///../collector/tech_stack.db';
  if (url.startsWith('postgres')) {
    return { type: 'pg', pool: new pg.Pool({ connectionString: url }) };
  }
  const filePath = url.replace(/^sqlite:\/\/\//, '');
  return { type: 'sqlite', db: new Database(filePath, { readonly: true }) };
}

/** $1, $2... 形式の SQL を SQLite/PostgreSQL 両対応で実行する */
export async function query(sql, params = []) {
  if (!_client) _client = initClient();
  if (_client.type === 'pg') {
    const { rows } = await _client.pool.query(sql, params);
    return rows;
  }
  const sqliteSql = sql.replace(/\$\d+/g, '?');
  return _client.db.prepare(sqliteSql).all(...params);
}

/** テスト用: 接続キャッシュをリセットして env 変更を反映できるようにする */
export function _resetClient() {
  _client = null;
}
