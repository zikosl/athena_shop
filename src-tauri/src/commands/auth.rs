use serde::Deserialize;
use tauri::State;

use crate::db::{hash_password, random_salt, Database};
use crate::error::{AppError, AppResult};
use crate::models::{ProfileInput, UserSession};

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

#[tauri::command]
pub fn update_profile(db: State<Database>, input: ProfileInput) -> AppResult<UserSession> {
    if input.username.trim().is_empty() || input.display_name.trim().is_empty() {
        return Err(AppError::Message(
            "Utilisateur et nom affiché obligatoires".into(),
        ));
    }

    db.with_client(|client| {
        if input.password.trim().is_empty() {
            client.execute(
                "UPDATE users SET username = $1, display_name = $2 WHERE id = $3",
                &[
                    &input.username.trim(),
                    &input.display_name.trim(),
                    &input.id,
                ],
            )?;
        } else {
            let salt = random_salt();
            let hash = hash_password(&input.password, &salt);
            client.execute(
                "UPDATE users
                 SET username = $1, display_name = $2, password_hash = $3, password_salt = $4
                 WHERE id = $5",
                &[
                    &input.username.trim(),
                    &input.display_name.trim(),
                    &hash,
                    &salt,
                    &input.id,
                ],
            )?;
        }

        let row = client.query_one(
            "SELECT id, username, display_name, role FROM users WHERE id = $1",
            &[&input.id],
        )?;
        Ok(UserSession {
            id: row.get(0),
            username: row.get(1),
            display_name: row.get(2),
            role: row.get(3),
        })
    })
}
