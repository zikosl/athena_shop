use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use postgres::{Client, Config, NoTls};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PostgresConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
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
        if let Some(config) = read_config(app)? {
            let _ = self.connect_and_prepare(&config);
        }
        Ok(())
    }

    pub fn is_configured(&self) -> AppResult<bool> {
        let guard = self
            .client
            .lock()
            .map_err(|_| AppError::Message("Base de donnees verrouillee".into()))?;
        Ok(guard.is_some())
    }

    pub fn configure(&self, app: &AppHandle, config: PostgresConfig) -> AppResult<()> {
        validate_config(&config)?;
        self.connect_and_prepare(&config)?;

        let path = config_path(app)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, serde_json::to_string_pretty(&config)?)?;
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
            client.simple_query("SELECT 1")?;
            Ok(())
        })
    }

    fn connect_and_prepare(&self, config: &PostgresConfig) -> AppResult<()> {
        ensure_database_exists(config)?;
        let mut client = connection_config(config).connect(NoTls)?;
        create_schema(&mut client)?;
        seed_admin(&mut client)?;

        let mut guard = self
            .client
            .lock()
            .map_err(|_| AppError::Message("Base de donnees verrouillee".into()))?;
        *guard = Some(client);
        Ok(())
    }
}

fn validate_config(config: &PostgresConfig) -> AppResult<()> {
    if config.host.trim().is_empty()
        || config.database.trim().is_empty()
        || config.user.trim().is_empty()
    {
        return Err(AppError::Message(
            "Serveur, base de donnees et utilisateur sont obligatoires".into(),
        ));
    }
    Ok(())
}

fn connection_config(config: &PostgresConfig) -> Config {
    let mut pg = Config::new();
    pg.host(config.host.trim());
    pg.port(config.port);
    pg.dbname(config.database.trim());
    pg.user(config.user.trim());
    pg.password(&config.password);
    pg
}

fn maintenance_config(config: &PostgresConfig) -> Config {
    let mut pg = Config::new();
    pg.host(config.host.trim());
    pg.port(config.port);
    pg.dbname("postgres");
    pg.user(config.user.trim());
    pg.password(&config.password);
    pg
}

fn ensure_database_exists(config: &PostgresConfig) -> AppResult<()> {
    if connection_config(config).connect(NoTls).is_ok() {
        return Ok(());
    }

    let mut client = maintenance_config(config).connect(NoTls)?;
    let exists = client
        .query_opt(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            &[&config.database.trim()],
        )?
        .is_some();

    if !exists {
        client.batch_execute(&format!(
            "CREATE DATABASE {}",
            quote_identifier(config.database.trim())
        ))?;
    }
    Ok(())
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn create_schema(client: &mut Client) -> AppResult<()> {
    client.batch_execute(
        "
        CREATE TABLE IF NOT EXISTS users (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS products (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          barcode TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          size TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT '',
          quantity BIGINT NOT NULL DEFAULT 0,
          low_stock_threshold BIGINT NOT NULL DEFAULT 3,
          purchase_price DOUBLE PRECISION NOT NULL DEFAULT 0,
          sale_price DOUBLE PRECISION NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS expenses (
          id BIGSERIAL PRIMARY KEY,
          label TEXT NOT NULL,
          category TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          expense_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sales (
          id BIGSERIAL PRIMARY KEY,
          receipt_no TEXT NOT NULL UNIQUE,
          subtotal DOUBLE PRECISION NOT NULL,
          discount DOUBLE PRECISION NOT NULL DEFAULT 0,
          total DOUBLE PRECISION NOT NULL,
          profit DOUBLE PRECISION NOT NULL,
          payment_method TEXT NOT NULL,
          sale_type TEXT NOT NULL DEFAULT 'cash',
          customer_name TEXT NOT NULL DEFAULT '',
          customer_phone TEXT NOT NULL DEFAULT '',
          paid_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          remaining_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          due_date TEXT NOT NULL DEFAULT '',
          credit_note TEXT NOT NULL DEFAULT '',
          credit_status TEXT NOT NULL DEFAULT 'paid',
          cashier TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sale_items (
          id BIGSERIAL PRIMARY KEY,
          sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
          product_id BIGINT NOT NULL REFERENCES products(id),
          product_name TEXT NOT NULL,
          barcode TEXT NOT NULL,
          quantity BIGINT NOT NULL,
          unit_price DOUBLE PRECISION NOT NULL,
          purchase_price DOUBLE PRECISION NOT NULL,
          line_total DOUBLE PRECISION NOT NULL
        );

        CREATE TABLE IF NOT EXISTS credit_payments (
          id BIGSERIAL PRIMARY KEY,
          sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
          amount DOUBLE PRECISION NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          cashier TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        ",
    )?;
    Ok(())
}

fn config_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Message(error.to_string()))?;
    Ok(dir.join("postgres-config.json"))
}

fn read_config(app: &AppHandle) -> AppResult<Option<PostgresConfig>> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)?;
    Ok(Some(serde_json::from_str(&content)?))
}

fn seed_admin(client: &mut Client) -> AppResult<()> {
    let count: i64 = client.query_one("SELECT COUNT(*) FROM users", &[])?.get(0);
    if count == 0 {
        let salt = random_salt();
        let hash = hash_password("admin123", &salt);
        client.execute(
            "INSERT INTO users (username, display_name, role, password_hash, password_salt)
             VALUES ($1, $2, $3, $4, $5)",
            &[&"admin", &"Administrateur", &"Super Admin", &hash, &salt],
        )?;
    }
    Ok(())
}

pub fn random_salt() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(24)
        .map(char::from)
        .collect()
}

pub fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}
