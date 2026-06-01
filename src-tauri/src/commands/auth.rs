use serde::Deserialize;
use tauri::State;

use crate::db::{hash_password, Database};
use crate::error::{AppError, AppResult};
use crate::models::UserSession;

#[derive(Debug, Deserialize)]
pub struct LoginInput {
    pub username: String,
    pub password: String,
}

#[tauri::command]
pub fn login(db: State<Database>, input: LoginInput) -> AppResult<UserSession> {
    db.with_client(|client| {
        let user = client.query_opt(
            "SELECT id, username, display_name, role, password_hash, password_salt
             FROM users WHERE username = $1",
            &[&input.username.trim()],
        )?;

        let row = user.ok_or_else(|| AppError::Message("Identifiants invalides".into()))?;
        let id: i64 = row.get(0);
        let username: String = row.get(1);
        let display_name: String = row.get(2);
        let role: String = row.get(3);
        let password_hash: String = row.get(4);
        let salt: String = row.get(5);

        if hash_password(&input.password, &salt) != password_hash {
            return Err(AppError::Message("Identifiants invalides".into()));
        }

        Ok(UserSession {
            id,
            username,
            display_name,
            role,
        })
    })
}
