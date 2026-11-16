use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use postgres::{Config as PostgresDriverConfig, NoTls};
use rand::{distributions::Alphanumeric, Rng};
use rusqlite::types::{FromSql, Value, ValueRef};
use rusqlite::{params_from_iter, Connection, OptionalExtension, ToSql, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub struct Client {
    connection: Connection,
}

pub struct DbTransaction<'a> {
    transaction: Option<Transaction<'a>>,
}

pub struct Database {
    client: Mutex<Option<Client>>,
}

impl Database {
    pub fn new() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }

    pub fn init_if_configured(&self, app: &AppHandle) -> AppResult<()> {
        let path = database_path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let connection = open_connection(&path)?;
        create_schema(&connection)?;
        migrate_postgres_if_needed(app, &connection)?;
        seed_admin(&connection)?;
        let mut guard = self
            .client
            .lock()
            .map_err(|_| AppError::Message("Base de donnees verrouillee".into()))?;
        *guard = Some(Client { connection });
        Ok(())
    }

    pub fn is_configured(&self) -> AppResult<bool> {
        let guard = self
            .client
            .lock()
            .map_err(|_| AppError::Message("Base de donnees verrouillee".into()))?;
        Ok(guard.is_some())
    }

    pub fn configure(&self, app: &AppHandle) -> AppResult<()> {
        let path = database_path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let connection = open_connection(&path)?;
        create_schema(&connection)?;
        migrate_postgres_if_needed(app, &connection)?;
        seed_admin(&connection)?;
        let mut guard = self
            .client
            .lock()
            .map_err(|_| AppError::Message("Base de donnees verrouillee".into()))?;
        *guard = Some(Client { connection });
        Ok(())
    }

    pub fn with_client<T>(&self, f: impl FnOnce(&mut Client) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self
            .client
            .lock()
            .map_err(|_| AppError::Message("Base de donnees verrouillee".into()))?;
        let client = guard
            .as_mut()
            .ok_or_else(|| AppError::Message("Base de donnees non configuree".into()))?;
        f(client)
    }

    pub fn save_now(&self) -> AppResult<()> {
        self.with_client(|client| {
            client.batch_execute("PRAGMA wal_checkpoint(FULL);")?;
            Ok(())
        })
    }
}

fn migrate_postgres_if_needed(app: &AppHandle, sqlite: &Connection) -> AppResult<()> {
    let migrated = sqlite
        .query_row(
            "SELECT 1 FROM app_meta WHERE key = 'postgres_migration_complete'",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if migrated {
        return Ok(());
    }

    let legacy_config_path = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Message(error.to_string()))?
        .join("postgres-config.json");
    if !legacy_config_path.exists() {
        return Ok(());
    }

    let legacy_config: LegacyPostgresConfig =
        serde_json::from_slice(&fs::read(&legacy_config_path)?)?;
    let mut pg_config = PostgresDriverConfig::new();
    pg_config
        .host(&legacy_config.host)
        .port(legacy_config.port)
        .dbname(&legacy_config.database)
        .user(&legacy_config.user)
        .password(&legacy_config.password);
    let mut postgres = pg_config.connect(NoTls)?;

    let tables = [
        "users",
        "product_categories",
        "products",
        "clients",
        "suppliers",
        "cash_shifts",
        "purchase_orders",
        "expenses",
        "sales",
        "sale_items",
        "purchase_order_items",
        "credit_payments",
        "stock_movements",
        "flacons",
        "perfumes",
        "perfume_prices",
        "perfume_sale_items",
        "perfume_purchases",
        "supplier_payments",
        "app_meta",
    ];
    let transaction = sqlite.unchecked_transaction()?;
    for table in tables {
        let exists = postgres
            .query_one(
                "SELECT to_regclass($1)::text",
                &[&format!("public.{table}")],
            )?
            .get::<_, Option<String>>(0)
            .is_some();
        if !exists {
            continue;
        }
        let records = postgres.query(
            &format!("SELECT to_jsonb(t)::text FROM public.{table} AS t"),
            &[],
        )?;
        let mut statement = transaction.prepare(&format!("PRAGMA table_info({table})"))?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        for record in records {
            let serialized: String = record.get(0);
            let object: serde_json::Map<String, serde_json::Value> =
                serde_json::from_str(&serialized)?;
            let mut names = Vec::new();
            let mut values = Vec::new();
            for column in &columns {
                if let Some(value) = object.get(column) {
                    names.push(format!("\"{}\"", column.replace('"', "\"\"")));
                    values.push(json_to_sqlite(value));
                }
            }
            if names.is_empty() {
                continue;
            }
            let placeholders = std::iter::repeat_n("?", names.len())
                .collect::<Vec<_>>()
                .join(", ");
            transaction.execute(
                &format!(
                    "INSERT INTO {table} ({}) VALUES ({placeholders})",
                    names.join(", ")
                ),
                params_from_iter(values.iter()),
            )?;
        }
    }
    transaction.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('postgres_migration_complete', 'true')",
        [],
    )?;
    transaction.commit()?;

    let retained_path = legacy_config_path.with_extension("json.migrated");
    if !retained_path.exists() {
        fs::rename(legacy_config_path, retained_path)?;
    }
    Ok(())
}

fn json_to_sqlite(value: &serde_json::Value) -> Value {
    match value {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(value) => Value::Integer(i64::from(*value)),
        serde_json::Value::Number(value) => value
            .as_i64()
            .map(Value::Integer)
            .or_else(|| value.as_f64().map(Value::Real))
            .unwrap_or(Value::Null),
        serde_json::Value::String(value) => Value::Text(value.clone()),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            Value::Text(value.to_string())
        }
    }
}

fn database_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Message(error.to_string()))?;
    Ok(dir.join("opensoft.sqlite3"))
}

fn open_connection(path: &std::path::Path) -> AppResult<Connection> {
    let connection = Connection::open(path)?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         PRAGMA temp_store = MEMORY;",
    )?;
    Ok(connection)
}

fn create_schema(client: &Connection) -> AppResult<()> {
    client.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          barcode TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          size TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT '',
          quantity INTEGER NOT NULL DEFAULT 0,
          low_stock_threshold INTEGER NOT NULL DEFAULT 3,
          purchase_price REAL NOT NULL DEFAULT 0,
          sale_price REAL NOT NULL DEFAULT 0,
          image_data TEXT NOT NULL DEFAULT '',
          custom_type TEXT NOT NULL DEFAULT 'standard',
          custom_config TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS product_categories (
          name TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO product_categories (name)
          SELECT DISTINCT trim(category) FROM products WHERE trim(category) <> '';

        CREATE TABLE IF NOT EXISTS stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          movement_type TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          before_quantity INTEGER NOT NULL,
          after_quantity INTEGER NOT NULL,
          unit_purchase_price REAL NOT NULL DEFAULT 0,
          note TEXT NOT NULL DEFAULT '',
          reference_type TEXT NOT NULL DEFAULT '',
          reference_id INTEGER,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cash_shifts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          opening_amount REAL NOT NULL DEFAULT 0,
          closing_amount REAL NOT NULL DEFAULT 0,
          auto_close_at TEXT NOT NULL,
          opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          closed_at TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          cashier TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS purchase_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bon_no TEXT NOT NULL UNIQUE,
          supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
          subtotal REAL NOT NULL DEFAULT 0,
          paid_amount REAL NOT NULL DEFAULT 0,
          remaining_amount REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'draft',
          note TEXT NOT NULL DEFAULT '',
          cashier TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          confirmed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shift_id INTEGER REFERENCES cash_shifts(id),
          label TEXT NOT NULL,
          category TEXT NOT NULL,
          amount REAL NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          expense_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shift_id INTEGER REFERENCES cash_shifts(id),
          receipt_no TEXT NOT NULL UNIQUE,
          subtotal REAL NOT NULL,
          discount REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL,
          profit REAL NOT NULL,
          payment_method TEXT NOT NULL,
          sale_type TEXT NOT NULL DEFAULT 'cash',
          customer_name TEXT NOT NULL DEFAULT '',
          customer_phone TEXT NOT NULL DEFAULT '',
          paid_amount REAL NOT NULL DEFAULT 0,
          remaining_amount REAL NOT NULL DEFAULT 0,
          due_date TEXT NOT NULL DEFAULT '',
          credit_note TEXT NOT NULL DEFAULT '',
          credit_status TEXT NOT NULL DEFAULT 'paid',
          cashier TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          collected_at TEXT
        );

        CREATE TABLE IF NOT EXISTS clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
          product_id INTEGER REFERENCES products(id),
          product_name TEXT NOT NULL,
          barcode TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          purchase_price REAL NOT NULL,
          line_total REAL NOT NULL,
          stock_quantity INTEGER NOT NULL DEFAULT 0,
          display_name TEXT NOT NULL DEFAULT '',
          custom_option TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS purchase_order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL REFERENCES products(id),
          product_name TEXT NOT NULL,
          barcode TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_purchase_price REAL NOT NULL,
          line_total REAL NOT NULL,
          stock_quantity INTEGER NOT NULL DEFAULT 0,
          display_name TEXT NOT NULL DEFAULT '',
          custom_option TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS credit_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shift_id INTEGER REFERENCES cash_shifts(id),
          sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
          amount REAL NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          cashier TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS flacons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          flacon_type TEXT NOT NULL DEFAULT 'x1',
          volume_ml REAL NOT NULL,
          sale_price REAL NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS perfumes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          family TEXT NOT NULL DEFAULT '',
          total_volume_ml REAL NOT NULL DEFAULT 0,
          remaining_volume_ml REAL NOT NULL DEFAULT 0,
          total_purchase_price REAL NOT NULL DEFAULT 0,
          cost_per_ml REAL NOT NULL DEFAULT 0,
          low_stock_ml REAL NOT NULL DEFAULT 30,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS perfume_prices (
          perfume_id INTEGER NOT NULL REFERENCES perfumes(id) ON DELETE CASCADE,
          flacon_id INTEGER NOT NULL REFERENCES flacons(id),
          sale_price REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (perfume_id, flacon_id)
        );

        CREATE TABLE IF NOT EXISTS perfume_sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
          perfume_id INTEGER NOT NULL REFERENCES perfumes(id),
          flacon_id INTEGER NOT NULL REFERENCES flacons(id),
          perfume_name TEXT NOT NULL,
          flacon_name TEXT NOT NULL,
          volume_ml REAL NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          cost_per_ml REAL NOT NULL,
          line_total REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS perfume_purchases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          perfume_id INTEGER REFERENCES perfumes(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          amount REAL NOT NULL DEFAULT 0,
          volume_ml REAL NOT NULL DEFAULT 0,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS supplier_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
          purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
          shift_id INTEGER REFERENCES cash_shifts(id),
          amount REAL NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          cashier TEXT NOT NULL,
          paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
        CREATE INDEX IF NOT EXISTS idx_sales_customer_phone ON sales(customer_phone);
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON stock_movements(product_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id, created_at);
        ",
    )?;
    Ok(())
}

fn seed_admin(client: &Connection) -> AppResult<()> {
    let count: i64 = client.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
    if count == 0 {
        let salt = random_salt();
        let hash = hash_password("admin123", &salt);
        client.execute(
            "INSERT INTO users (username, display_name, role, password_hash, password_salt)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            (&"admin", &"Administrateur", &"Super Admin", &hash, &salt),
        )?;
    }
    Ok(())
}

pub trait RowValue: Sized {
    fn from_value(value: ValueRef<'_>) -> Self;
}

macro_rules! impl_row_value {
    ($type:ty) => {
        impl RowValue for $type {
            fn from_value(value: ValueRef<'_>) -> Self {
                <$type as FromSql>::column_result(value)
                    .unwrap_or_else(|error| panic!("Invalid SQLite value: {error}"))
            }
        }
    };
}

impl_row_value!(i64);
impl_row_value!(i32);
impl_row_value!(f64);
impl_row_value!(String);
impl_row_value!(bool);

impl<T: FromSql> RowValue for Option<T> {
    fn from_value(value: ValueRef<'_>) -> Self {
        T::column_result(value).ok()
    }
}

impl RowValue for serde_json::Value {
    fn from_value(value: ValueRef<'_>) -> Self {
        match value {
            ValueRef::Text(text) => serde_json::from_slice(text).unwrap_or(serde_json::Value::Null),
            ValueRef::Null => serde_json::Value::Null,
            _ => serde_json::Value::Null,
        }
    }
}

pub struct Row {
    values: Vec<Value>,
    columns: Vec<String>,
}

pub trait RowIndex {
    fn column(&self, columns: &[String]) -> usize;
}

impl RowIndex for usize {
    fn column(&self, _columns: &[String]) -> usize {
        *self
    }
}

impl RowIndex for &str {
    fn column(&self, columns: &[String]) -> usize {
        columns
            .iter()
            .position(|column| column == self)
            .expect("Unknown SQLite column")
    }
}

impl Row {
    pub fn get<I: RowIndex, T: RowValue>(&self, index: I) -> T {
        let value = &self.values[index.column(&self.columns)];
        let value_ref = match value {
            Value::Null => ValueRef::Null,
            Value::Integer(value) => ValueRef::Integer(*value),
            Value::Real(value) => ValueRef::Real(*value),
            Value::Text(value) => ValueRef::Text(value.as_bytes()),
            Value::Blob(value) => ValueRef::Blob(value),
        };
        T::from_value(value_ref)
    }
}

pub trait SqliteClientExt {
    fn raw_connection(&self) -> &Connection;
    fn query(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Vec<Row>>;
    fn query_one(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Row>;
    fn query_opt(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Option<Row>>;
    fn execute(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<usize>;
    fn batch_execute(&mut self, sql: &str) -> AppResult<()>;
}

fn query_rows(connection: &Connection, sql: &str, params: &[&dyn ToSql]) -> AppResult<Vec<Row>> {
    let mut statement = connection.prepare(sql)?;
    let columns: Vec<String> = statement
        .column_names()
        .iter()
        .map(|name| (*name).to_string())
        .collect();
    let mut rows = statement.query(params_from_iter(params.iter().copied()))?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        let values = (0..columns.len())
            .map(|index| row.get::<_, Value>(index))
            .collect::<Result<Vec<_>, _>>()?;
        result.push(Row {
            values,
            columns: columns.clone(),
        });
    }
    Ok(result)
}

macro_rules! impl_client_ext {
    ($type:ty, $this:ident, $connection:expr) => {
        impl SqliteClientExt for $type {
            fn raw_connection(&self) -> &Connection {
                let $this = self;
                $connection
            }

            fn query(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Vec<Row>> {
                query_rows(self.raw_connection(), sql, params)
            }

            fn query_one(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Row> {
                self.query(sql, params)?
                    .into_iter()
                    .next()
                    .ok_or_else(|| AppError::Sqlite(rusqlite::Error::QueryReturnedNoRows))
            }

            fn query_opt(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Option<Row>> {
                Ok(self.query(sql, params)?.into_iter().next())
            }

            fn execute(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<usize> {
                Ok(self
                    .raw_connection()
                    .execute(sql, params_from_iter(params.iter().copied()))?)
            }

            fn batch_execute(&mut self, sql: &str) -> AppResult<()> {
                self.raw_connection().execute_batch(sql)?;
                Ok(())
            }
        }
    };
}

impl_client_ext!(Client, this, &this.connection);
impl_client_ext!(
    DbTransaction<'_>,
    this,
    this.transaction
        .as_deref()
        .expect("SQLite transaction is active")
);

impl Client {
    pub fn query(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Vec<Row>> {
        SqliteClientExt::query(self, sql, params)
    }

    pub fn query_one(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Row> {
        SqliteClientExt::query_one(self, sql, params)
    }

    pub fn query_opt(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Option<Row>> {
        SqliteClientExt::query_opt(self, sql, params)
    }

    pub fn execute(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<usize> {
        SqliteClientExt::execute(self, sql, params)
    }

    pub fn batch_execute(&mut self, sql: &str) -> AppResult<()> {
        SqliteClientExt::batch_execute(self, sql)
    }

    pub fn transaction(&mut self) -> AppResult<DbTransaction<'_>> {
        Ok(DbTransaction {
            transaction: Some(self.connection.transaction()?),
        })
    }
}

impl DbTransaction<'_> {
    pub fn query(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Vec<Row>> {
        SqliteClientExt::query(self, sql, params)
    }

    pub fn query_one(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Row> {
        SqliteClientExt::query_one(self, sql, params)
    }

    pub fn query_opt(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<Option<Row>> {
        SqliteClientExt::query_opt(self, sql, params)
    }

    pub fn execute(&mut self, sql: &str, params: &[&dyn ToSql]) -> AppResult<usize> {
        SqliteClientExt::execute(self, sql, params)
    }

    pub fn commit(mut self) -> AppResult<()> {
        self.transaction
            .take()
            .expect("SQLite transaction is active")
            .commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_schema_seeds_admin_and_persists_records() {
        let connection = Connection::open_in_memory().expect("open in-memory SQLite");
        create_schema(&connection).expect("create schema");
        seed_admin(&connection).expect("seed admin");

        let user_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
            .expect("count users");
        assert_eq!(user_count, 1);

        connection
            .execute(
                "INSERT INTO products (name, barcode, category, quantity, sale_price) VALUES (?1, ?2, ?3, ?4, ?5)",
                ("Test", "TEST-001", "Products", 8, 125.0),
            )
            .expect("insert product");
        let product: (String, i64, f64) = connection
            .query_row(
                "SELECT name, quantity, sale_price FROM products WHERE barcode = ?1",
                ["TEST-001"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read product");
        assert_eq!(product, ("Test".into(), 8, 125.0));
    }
}

pub fn random_salt() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

pub fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LegacyPostgresConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
}
