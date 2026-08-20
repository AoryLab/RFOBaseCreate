use odbc_api::{ConnectionOptions, Environment};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use zip::ZipArchive;

static BILLING_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/Base/BILLING_Type1_TriRozhka.sql"));
static RF_USER_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/Base/RF_User_clean_sql2014.sql"));
static RF_WORLD_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/RF_WORLD.sql"));
static RF_ODIN_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/ODIN/RF_ODIN_Create.sql"));
static AUCTION_ENABLE_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/ODIN/AUCTION_MULTICURRENCY/ENABLE_MODULE_AuctionCurrencyQueryToRFWorldDB.sql"));
static AUCTION_DISABLE_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/ODIN/AUCTION_MULTICURRENCY/DISABLE_MODULE_AuctionCurrencyQueryToRFWorldDB.sql"));
static GUILD_POINT_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/ODIN/GUILD_POINT/GuildPointQueryToRFWorldDB.sql"));
static POTION_LOGIN_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/ODIN/POTION_LOGIN/PotionLoginQueryToRFWorldDB.sql"));
static GM_SKILLS_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/funcc/4. geniral pt skils.sql"));
static ONLINE_STATUS_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/funcc/9.Online_Status.sql"));
static MAIL_REGISTRY_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/Почта/Fix_post_tbl_PostRegistry_500_.sql"));
static MAIL_STORAGE_SQL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/sql/Почта/Fix_post_tbl_PostStorage_10000_.sql"));

#[derive(Deserialize)]
struct OdbcEntry {
    dsn: String,
    database: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSettings {
    #[serde(default)]
    pub server_path: String,
    pub billing_database: String,
    pub user_database: String,
    pub world_database: String,
    pub mssql_password: String,
    pub world_name: String,
    pub max_players: i32,
    pub hbk_path: String,
    pub history_path: String,
    pub odin_enabled: bool,
    pub port_protection: bool,
    pub account_server_port: i32,
    pub launcher_port: i32,
    pub launcher_encryption: i32,
    pub login_server_port: i32,
    pub control_server_port: i32,
    pub zone_server_port: i32,
    pub check_ip_for_kick: i32,
}

fn default_server_settings() -> ServerSettings {
    ServerSettings {
        server_path: String::new(),
        billing_database: "BILLING".into(),
        user_database: "RF_USER".into(), world_database: "RF_WORLD".into(),
        mssql_password: String::new(), world_name: "Novus".into(), max_players: 2000,
        hbk_path: "C:/L/ServerName".into(), history_path: "C:/L/ServerName".into(),
        odin_enabled: false, port_protection: false, account_server_port: 27000,
        launcher_port: 10001, launcher_encryption: 0, login_server_port: 27000,
        control_server_port: 28000, zone_server_port: 29000, check_ip_for_kick: 0,
    }
}

fn exe_directory() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("Не удалось определить папку приложения: {e}"))?
        .parent().map(Path::to_path_buf).ok_or_else(|| "У приложения нет папки запуска".into())
}

fn config_file() -> Result<PathBuf, String> {
    let dir = exe_directory()?.join("config");
    fs::create_dir_all(&dir).map_err(|e| format!("Не удалось создать папку config: {e}"))?;
    Ok(dir.join("server-settings.json"))
}

fn ensure_existing_directory(path: &str) -> Result<PathBuf, String> {
    let input = PathBuf::from(path.trim());
    if input.as_os_str().is_empty() || !input.is_dir() {
        return Err(format!("Папка сервера не найдена: {}", input.display()));
    }
    fs::canonicalize(&input).map_err(|e| format!("Не удалось проверить путь сервера: {e}"))
}

fn ensure_account_login_directory(root: &Path) -> Result<PathBuf, String> {
    let root = root.join("AccountLogin");
    if !root.join("RF_Bin").join("Initialize").is_dir() {
        return Err("В AccountLogin не найдена структура RF_Bin/Initialize".into());
    }
    fs::canonicalize(root).map_err(|e| format!("Не удалось проверить путь AccountLogin: {e}"))
}

fn ensure_zone_server_directory(root: &Path) -> Result<PathBuf, String> {
    let root = root.join("ZoneServer");
    if !root.join("RF_Bin").join("Initialize").join("WorldSystem.ini").is_file()
        || !root.join("WorldInfo").join("WorldInfo.ini").is_file()
    {
        return Err("В ZoneServer не найдены RF_Bin/Initialize/WorldSystem.ini и WorldInfo/WorldInfo.ini".into());
    }
    fs::canonicalize(root).map_err(|e| format!("Не удалось проверить путь ZoneServer: {e}"))
}

fn relative_file(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.is_absolute() || rel.components().any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
        return Err("Недопустимый внутренний путь".into());
    }
    Ok(root.join(rel))
}

fn update_ini(path: &Path, updates: &[(&str, &str, String)]) -> Result<(), String> {
    let original = fs::read(path).unwrap_or_default();
    let text = String::from_utf8_lossy(&original).replace("\r\n", "\n");
    let mut lines: Vec<String> = text.split('\n').map(str::to_string).collect();
    for (section, key, value) in updates {
        let section_start = lines.iter().position(|line| line.trim().eq_ignore_ascii_case(&format!("[{section}]")));
        let mut changed = false;
        if let Some(start) = section_start {
            let end = lines[start + 1..].iter().position(|line| line.trim_start().starts_with('[')).map(|n| start + 1 + n).unwrap_or(lines.len());
            for line in &mut lines[start + 1..end] {
                if line.split_once('=').map(|(k, _)| k.trim().eq_ignore_ascii_case(key)).unwrap_or(false) {
                    *line = format!("{key}={value}"); changed = true; break;
                }
            }
            if !changed { lines.insert(end, format!("{key}={value}")); }
        } else {
            if lines.last().map(|l| !l.is_empty()).unwrap_or(false) { lines.push(String::new()); }
            lines.push(format!("[{section}]")); lines.push(format!("{key}={value}"));
        }
    }
    let mut file = fs::File::create(path).map_err(|e| format!("Не удалось записать {}: {e}", path.display()))?;
    file.write_all(lines.join("\r\n").as_bytes()).map_err(|e| format!("Не удалось записать INI: {e}"))
}

fn write_server_files(settings: &ServerSettings) -> Result<(), String> {
    let server_root = ensure_existing_directory(&settings.server_path)?;
    ensure_account_login_directory(&server_root)?;
    ensure_zone_server_directory(&server_root)?;
    let files = [
        (&server_root, "AccountLogin/RF_Bin/Initialize/AccountSystem.ini", vec![("Database", "AccountDB_Name", settings.user_database.clone()), ("DB_INFO", "DBName", settings.billing_database.clone()), ("World", "Name0", settings.world_name.clone()), ("World", "DBName0", settings.world_database.clone()), ("Service", "MaxAccountNum", settings.max_players.to_string())]),
        (&server_root, "AccountLogin/RF_Bin/Initialize/BillingSystem.ini", vec![("BILLING", "SERVER_NAME", settings.billing_database.clone())]),
        (&server_root, "AccountLogin/RF_Bin/Initialize/LoginSystem.ini", vec![("BILL_RU", "DBName", settings.billing_database.clone())]),
        (&server_root, "AccountLogin/RF_Bin/rfacc.ini", vec![("Options", "DBSTR", format!("Provider=MSDASQL;DSN={};UID=sa;PWD={};", settings.billing_database, settings.mssql_password))]),
        (&server_root, "ZoneServer/WorldInfo/WorldInfo.ini", vec![("System", "WorldName", settings.world_name.clone()), ("System", "HBKPath", settings.hbk_path.clone()), ("System", "HistoryPath", settings.history_path.clone())]),
        (&server_root, "ZoneServer/RF_Bin/Initialize/WorldSystem.ini", vec![("System", "LimUserNum", settings.max_players.to_string())]),
        (&server_root, "ZoneServer/RF_Bin/rfacc.ini", vec![("Options", "DBSTR", format!("Provider=SQLOLEDB;Source=1337n;UID=sa;PWD={};Initial Catalog={};", settings.mssql_password, settings.billing_database))]),
    ];
    for (root, relative, updates) in files {
        let path = relative_file(root, relative)?;
        if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| format!("Не удалось создать папку INI: {e}"))?; }
        let refs: Vec<(&str, &str, String)> = updates.into_iter().map(|(s, k, v)| (s, k, v)).collect();
        update_ini(&path, &refs)?;
    }
    if settings.odin_enabled {
        let odin = relative_file(&server_root, "AccountLogin/Odin/Odin.ini")?;
        if let Some(parent) = odin.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        update_ini(&odin, &[("General", "PortProtection", settings.port_protection.to_string()), ("LOGIN_SERVER", "AccountServerPort", settings.account_server_port.to_string()), ("LOGIN_SERVER", "LauncherPort", settings.launcher_port.to_string()), ("LOGIN_SERVER", "LauncherEncryption", settings.launcher_encryption.to_string()), ("ACCOUNT_SERVER", "LoginServerPort", settings.login_server_port.to_string()), ("ACCOUNT_SERVER", "ControlServerPort", settings.control_server_port.to_string()), ("ACCOUNT_SERVER", "ZoneServerPort", settings.zone_server_port.to_string()), ("ACCOUNT_SERVER", "CheckIPForKick", settings.check_ip_for_kick.to_string())])?;
        let db = relative_file(&server_root, "ZoneServer/RF_Bin/Odin/DataBaseConnect.ini")?;
        if let Some(parent) = db.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        update_ini(&db, &[("General", "DBNameWorld", settings.world_database.clone()), ("General", "DBNameBilling", settings.billing_database.clone()), ("General", "DBNameOdin", "RF_ODIN".into()), ("General", "Password", "123456".into())])?;
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
async fn load_server_settings(server_path: String) -> Result<ServerSettings, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let server_root = ensure_existing_directory(&server_path)?;
        ensure_account_login_directory(&server_root)?;
        ensure_zone_server_directory(&server_root)?;
        let key = server_root.to_string_lossy().to_string();
        let file = config_file()?;
        let mut all: std::collections::HashMap<String, ServerSettings> = if file.exists() { serde_json::from_slice(&fs::read(&file).map_err(|e| e.to_string())?).map_err(|e| format!("Некорректный JSON настроек: {e}"))? } else { std::collections::HashMap::new() };
        let mut settings = all.get(&key).cloned().unwrap_or_else(default_server_settings);
        settings.server_path = key.clone();
        all.insert(key, settings.clone());
        fs::write(&file, serde_json::to_vec_pretty(&all).map_err(|e| e.to_string())?).map_err(|e| format!("Не удалось создать конфиг: {e}"))?;
        Ok(settings)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_server_settings(settings: ServerSettings) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let server_root = ensure_existing_directory(&settings.server_path)?;
        ensure_account_login_directory(&server_root)?;
        ensure_zone_server_directory(&server_root)?;
        let key = server_root.to_string_lossy().to_string();
        let file = config_file()?;
        let mut all: std::collections::HashMap<String, ServerSettings> = if file.exists() { serde_json::from_slice(&fs::read(&file).map_err(|e| e.to_string())?).map_err(|e| format!("Некорректный JSON настроек: {e}"))? } else { std::collections::HashMap::new() };
        let mut saved = settings;
        saved.server_path = key.clone();
        write_server_files(&saved)?;
        all.insert(key, saved);
        fs::write(file, serde_json::to_vec_pretty(&all).map_err(|e| e.to_string())?).map_err(|e| format!("Не удалось сохранить конфиг: {e}"))?;
        Ok("Настройки сервера сохранены".into())
    }).await.map_err(|e| e.to_string())?
}

fn resource_path(relative: &str) -> Result<PathBuf, String> {
    let beside_exe = relative_file(&exe_directory()?, relative)?;
    if beside_exe.exists() {
        return Ok(beside_exe);
    }
    let development_path = PathBuf::from(r"D:\Programs\System\Desktop").join(relative);
    if development_path.exists() {
        return Ok(development_path);
    }
    Err(format!("Ресурс не найден рядом с exe или в папке разработки: {relative}"))
}

#[tauri::command]
async fn run_driver(driver: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let relative = match driver.as_str() { "account" => "arch/Driver/Account.msi", "depend" => "arch/Driver/RFDepend.msi", "sql" => "arch/Driver/sqlncli.msi", "vcredist" => "arch/Driver/vcredist/install_all_vcredist.bat", _ => return Err("Неизвестный драйвер".into()) };
        let path = resource_path(relative)?;
        if !path.is_file() { return Err(format!("Файл драйвера не найден рядом с exe: {}", path.display())); }
        let output = if relative.ends_with(".bat") { Command::new("cmd").args(["/C", path.to_string_lossy().as_ref()]).output() } else { Command::new("msiexec").args(["/i", path.to_string_lossy().as_ref()]).output() }.map_err(|e| format!("Не удалось запустить драйвер: {e}"))?;
        if !output.status.success() { return Err(format!("Установка завершилась с кодом {}", output.status)); }
        Ok("Драйвер успешно запущен".into())
    }).await.map_err(|e| e.to_string())?
}

fn extract_archive(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(|e| format!("Не удалось открыть архив {}: {e}", archive.display()))?;
    let mut zip = ZipArchive::new(file).map_err(|e| format!("Некорректный ZIP: {e}"))?;
    fs::create_dir_all(destination).map_err(|e| format!("Не удалось создать папку назначения: {e}"))?;
    let root = fs::canonicalize(destination).map_err(|e| e.to_string())?;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        let target = relative_file(&root, &name)?;
        if entry.is_dir() { fs::create_dir_all(&target).map_err(|e| e.to_string())?; continue; }
        if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        let mut out = fs::File::create(target).map_err(|e| e.to_string())?;
        let mut data = Vec::new(); entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
        out.write_all(&data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn extract_server(server_path: String) -> Result<String, String> { tauri::async_runtime::spawn_blocking(move || { let dest = PathBuf::from(server_path.trim()); if dest.as_os_str().is_empty() { return Err("Укажите путь распаковки".into()); } extract_archive(&resource_path("arch/RFClearServer.zip")?, &dest)?; Ok("Сервер распакован".into()) }).await.map_err(|e| e.to_string())? }

#[tauri::command]
async fn apply_server_patch(server_path: String) -> Result<String, String> { tauri::async_runtime::spawn_blocking(move || { let dest = ensure_existing_directory(&server_path)?; extract_archive(&resource_path("arch/RFOdinPatch.zip")?, &dest)?; Ok("Патч ODIN применен".into()) }).await.map_err(|e| e.to_string())? }

fn decode_sql_file(bytes: &[u8]) -> Result<String, String> {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let wide: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        return String::from_utf16(&wide).map_err(|error| format!("Некорректная кодировка SQL-файла: {error}"));
    }

    Ok(String::from_utf8_lossy(bytes).into_owned())
}

fn split_batches(script: &str) -> Vec<String> {
    let mut batches = Vec::new();
    let mut current = Vec::new();

    for line in script.lines() {
        if line.trim().eq_ignore_ascii_case("GO") {
            if !current.join("\n").trim().is_empty() {
                batches.push(current.join("\n"));
            }
            current.clear();
        } else {
            current.push(line);
        }
    }

    if !current.join("\n").trim().is_empty() {
        batches.push(current.join("\n"));
    }

    batches
}

fn sql_file_for(database_type: &str) -> Result<&'static [u8], String> {
    match database_type {
        "billing" => Ok(BILLING_SQL),
        "user" => Ok(RF_USER_SQL),
        "world" => Ok(RF_WORLD_SQL),
        "odin" => Ok(RF_ODIN_SQL),
        _ => Err("Неизвестный тип базы данных".to_string()),
    }
}

fn odin_feature_script(feature: &str) -> Result<&'static [u8], String> {
    match feature {
        "auction_enable" => Ok(AUCTION_ENABLE_SQL),
        "auction_disable" => Ok(AUCTION_DISABLE_SQL),
        "guild_point" => Ok(GUILD_POINT_SQL),
        "potion_login" => Ok(POTION_LOGIN_SQL),
        "gm_skills" => Ok(GM_SKILLS_SQL),
        "online_status" => Ok(ONLINE_STATUS_SQL),
        _ => Err("Неизвестная функция ODIN".to_string()),
    }
}

fn execute_script_on_database(database_name: &str, script: String) -> Result<(), String> {
    let environment = Environment::new().map_err(|error| format!("Не удалось открыть ODBC: {error}"))?;
    let connection = environment
        .connect_with_connection_string("Driver={SQL Server};Server=localhost;Trusted_Connection=Yes;", ConnectionOptions::default())
        .map_err(|error| format!("Не удалось подключиться к локальному SQL Server: {error}"))?;
    let use_statement = format!("USE [{database_name}]");
    connection.execute(&use_statement, ()).map_err(|error| format!("Не удалось выбрать базу: {error}"))?;
    for batch in split_batches(&script) {
        connection.execute(&batch, ()).map_err(|error| format!("Ошибка выполнения SQL: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn execute_odin_feature(database_name: String, feature: String) -> Result<String, String> {
    validate_database_name(&database_name)?;
    let script = decode_sql_file(odin_feature_script(&feature)?)?
        .replace("[ARF_World]", &format!("[{database_name}]"))
        .replace("[RF_World]", &format!("[{database_name}]"))
        .replace("[RF_WORLD]", &format!("[{database_name}]"));
    let script = if feature == "gm_skills" {
        format!("IF OBJECT_ID(N'[dbo].[tbl_general]', N'U') IS NOT NULL DROP TABLE [dbo].[tbl_general]\nGO\n{script}")
    } else {
        script
    };
    tauri::async_runtime::spawn_blocking(move || execute_script_on_database(&database_name, script))
        .await
        .map_err(|error| format!("Поток выполнения завершился с ошибкой: {error}"))??;
    Ok("Функция ODIN применена".to_string())
}

#[tauri::command]
async fn apply_mail_patch(database_name: String, registry_count: i32, storage_count: i32) -> Result<String, String> {
    validate_database_name(&database_name)?;
    if registry_count < 500 {
        return Err("Количество записей PostRegistry не может быть меньше 500".to_string());
    }
    if storage_count < 10000 {
        return Err("Количество записей PostStorage не может быть меньше 10000".to_string());
    }
    let registry_script = decode_sql_file(MAIL_REGISTRY_SQL)?.replace("while (@count < 500)", &format!("while (@count < {registry_count})"));
    let storage_script = decode_sql_file(MAIL_STORAGE_SQL)?.replace("while (@count < 10000)", &format!("while (@count < {storage_count})"));
    let script = format!("{registry_script}\nGO\n{storage_script}");
    tauri::async_runtime::spawn_blocking(move || execute_script_on_database(&database_name, script))
        .await
        .map_err(|error| format!("Поток выполнения завершился с ошибкой: {error}"))??;
    Ok("Почтовый патч применен".to_string())
}

fn validate_database_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 128 || !name.chars().all(|character| character.is_ascii_alphanumeric() || character == '_') {
        return Err("Имя базы может содержать только латинские буквы, цифры и символ _".to_string());
    }
    Ok(())
}

fn validate_credential(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 12 || !value.chars().all(|character| character.is_ascii_alphanumeric() || "_!@#$%^&*.-".contains(character)) {
        return Err(format!("{label} должен содержать до 12 допустимых символов"));
    }
    Ok(())
}

fn escape_sql_string(value: &str) -> String {
    value.replace('\'', "''")
}

#[tauri::command]
async fn create_gm_account(database_name: String, login: String, password: String, grade: i32, subgrade: i32) -> Result<String, String> {
    validate_database_name(&database_name)?;
    validate_credential(&login, "Логин")?;
    validate_credential(&password, "Пароль")?;
    if !(0..=9).contains(&grade) || !(0..=9).contains(&subgrade) {
        return Err("Grade и Subgrade должны быть в диапазоне от 0 до 9".to_string());
    }
    let login = escape_sql_string(&login);
    let password = escape_sql_string(&password);
    let script = format!(
        "DECLARE @RC int\nEXEC @RC = [{database_name}].[dbo].[pInsert_Staff] '{login}', '{password}', 'none', 'GM', 'GM', 'None', {grade}, {subgrade}\nIF @RC <> 0 THROW 51000, 'pInsert_Staff завершилась с ошибкой', 1"
    );
    tauri::async_runtime::spawn_blocking(move || execute_script_on_database(&database_name, script))
        .await
        .map_err(|error| format!("Поток выполнения завершился с ошибкой: {error}"))??;
    Ok("GM-аккаунт создан".to_string())
}

#[tauri::command]
async fn grant_shop(world_database: String, billing_database: String, mode: String, amount: i64, guild_name: String, guild_level: i32, player: String) -> Result<String, String> {
    validate_database_name(&world_database)?;
    validate_database_name(&billing_database)?;
    if amount <= 0 || amount > 2_000_000_000 {
        return Err("Количество шопа должно быть от 1 до 2 000 000 000".to_string());
    }
    if guild_level < 0 || guild_level > 255 {
        return Err("Минимальный уровень гильдии должен быть от 0 до 255".to_string());
    }
    let guild_name = escape_sql_string(&guild_name);
    let player = escape_sql_string(&player);
    let script = match mode.as_str() {
        "all" => format!("UPDATE [{billing_database}].[dbo].[tbl_user] SET Cash = Cash + {amount}"),
        "player" => format!("DECLARE @UserID varchar(64)\nSELECT TOP 1 @UserID = Account FROM [{world_database}].[dbo].[tbl_base] WHERE Name = '{player}' OR Account = '{player}'\nIF @UserID IS NULL THROW 51000, 'Игрок не найден', 1\nUPDATE [{billing_database}].[dbo].[tbl_user] SET Cash = Cash + {amount} WHERE UserID = @UserID"),
        "guild" => format!("UPDATE user_account SET Cash = Cash + {amount} FROM [{billing_database}].[dbo].[tbl_user] user_account INNER JOIN [{world_database}].[dbo].[tbl_base] base_player ON base_player.Account = user_account.UserID INNER JOIN [{world_database}].[dbo].[tbl_general] general_data ON general_data.Serial = base_player.Serial INNER JOIN [{world_database}].[dbo].[tbl_Guild] guild_data ON guild_data.Serial = general_data.GuildSerial WHERE guild_data.id = '{guild_name}' AND base_player.Lv >= {guild_level}"),
        _ => return Err("Неизвестный режим выдачи шопа".to_string()),
    };
    tauri::async_runtime::spawn_blocking(move || execute_script_on_database(&world_database, script))
        .await
        .map_err(|error| format!("Поток выполнения завершился с ошибкой: {error}"))??;
    Ok("Шоп успешно выдан".to_string())
}

fn configure_odbc_blocking(entries: Vec<OdbcEntry>) -> Result<String, String> {
    let odbcconf = std::env::var("WINDIR")
        .map(|windows| format!(r"{windows}\System32\odbcconf.exe"))
        .map_err(|_| "Не удалось определить папку Windows".to_string())?;

    for entry in entries {
        validate_database_name(&entry.database)?;
        validate_database_name(&entry.dsn)?;
        let configuration = format!(
            "DSN={}|Description=|SERVER=(local)|Trusted_Connection=Yes|Database={}",
            entry.dsn, entry.database
        );
        let result = Command::new(&odbcconf)
            .args(["CONFIGDSN", "SQL Server", &configuration])
            .output()
            .map_err(|error| format!("Не удалось запустить odbcconf.exe: {error}"))?;
        if !result.status.success() {
            return Err(format!("Не удалось записать ODBC DSN {}", entry.dsn));
        }
    }

    Ok("ODBC-записи успешно сохранены".to_string())
}

#[tauri::command]
async fn configure_odbc(entries: Vec<OdbcEntry>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || configure_odbc_blocking(entries))
        .await
        .map_err(|error| format!("Поток выполнения завершился с ошибкой: {error}"))?
}

fn create_database_blocking(database_name: String, database_type: String, write_odbc: bool) -> Result<String, String> {
    validate_database_name(&database_name)?;
    let script = decode_sql_file(sql_file_for(&database_type)?)?;
    let script = script
        .replace("[BILLING]", &format!("[{database_name}]"))
        .replace("[RF_User]", &format!("[{database_name}]"))
        .replace("[RF_USER]", &format!("[{database_name}]"))
        .replace("[RF_World]", &format!("[{database_name}]"))
        .replace("[RF_WORLD]", &format!("[{database_name}]"))
        .replace("[ARF_World]", &format!("[{database_name}]"));

    let environment = Environment::new().map_err(|error| format!("Не удалось открыть ODBC: {error}"))?;
    let connection_string = "Driver={SQL Server};Server=localhost;Trusted_Connection=Yes;";
    let connection = environment
        .connect_with_connection_string(connection_string, ConnectionOptions::default())
        .map_err(|error| format!("Не удалось подключиться к локальному SQL Server: {error}"))?;

    let create_statement = format!(
        "IF DB_ID(N'{database_name}') IS NULL CREATE DATABASE [{database_name}]"
    );
    connection
        .execute(&create_statement, ())
        .map_err(|error| format!("Не удалось создать базу: {error}"))?;

    for batch in split_batches(&script) {
        connection
            .execute(&batch, ())
            .map_err(|error| format!("Ошибка выполнения SQL: {error}"))?;
    }

    if write_odbc {
        configure_odbc_blocking(vec![OdbcEntry { dsn: database_name.clone(), database: database_name.clone() }])?;
    }

    Ok(format!("База {database_name} создана и заполнена"))
}

#[tauri::command]
async fn create_database(database_name: String, database_type: String, write_odbc: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || create_database_blocking(database_name, database_type, write_odbc))
        .await
        .map_err(|error| format!("Поток выполнения завершился с ошибкой: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![create_database, configure_odbc, execute_odin_feature, apply_mail_patch, create_gm_account, grant_shop, run_driver, extract_server, apply_server_patch, load_server_settings, save_server_settings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
