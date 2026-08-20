import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const databases = [
  {
    key: "billing",
    label: "Billing",
    name: "BILLING",
    description: "Платежи и биллинг",
  },
  {
    key: "user",
    label: "RF User",
    name: "RF_USER",
    description: "Пользователи и авторизация",
  },
  {
    key: "world",
    label: "RF World",
    name: "RF_WORLD",
    description: "Игровой мир и данные",
  },
] as const;
type DatabaseKey = (typeof databases)[number]["key"];
type Feature = "auction" | "guild" | "potion" | "gm" | "online";
type Page = "home" | "databases" | "server" | "sql";
type ShopMode = "all" | "guild" | "player";

function App() {
  const window = getCurrentWindow();
  const [page, setPage] = useState<Page>("home");
  const [names, setNames] = useState<Record<DatabaseKey, string>>(
    Object.fromEntries(
      databases.map((item) => [item.key, item.name]),
    ) as Record<DatabaseKey, string>,
  );
  const [created, setCreated] = useState<DatabaseKey[]>([]);
  const [odbc, setOdbc] = useState<Record<DatabaseKey, boolean>>({
    billing: false,
    user: false,
    world: false,
  });
  const [odinName, setOdinName] = useState("RF_ODIN");
  const [odinOdbc, setOdinOdbc] = useState(false);
  const [features, setFeatures] = useState<Record<Feature, boolean>>({
    auction: false,
    guild: false,
    potion: false,
    gm: false,
    online: false,
  });
  const [mailRegistry, setMailRegistry] = useState("500");
  const [mailStorage, setMailStorage] = useState("10000");
  const [gmDatabase, setGmDatabase] = useState("RF_USER");
  const [gmLogin, setGmLogin] = useState("");
  const [gmPassword, setGmPassword] = useState("");
  const [gmGrade, setGmGrade] = useState("4");
  const [gmSubgrade, setGmSubgrade] = useState("3");
  const [shopMode, setShopMode] = useState<ShopMode>("all");
  const [shopAmount, setShopAmount] = useState("21000");
  const [shopGuildName, setShopGuildName] = useState("");
  const [shopGuildLevel, setShopGuildLevel] = useState("0");
  const [shopPlayer, setShopPlayer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(task: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const create = (key: DatabaseKey) =>
    run(async () => {
      await invoke("create_database", {
        databaseName: names[key].trim(),
        databaseType: key,
        writeOdbc: odbc[key],
      });
      setCreated((current) =>
        current.includes(key) ? current : [...current, key],
      );
    });
  const createOdin = () =>
    run(() =>
      invoke("create_database", {
        databaseName: odinName.trim(),
        databaseType: "odin",
        writeOdbc: odinOdbc,
      }).then(() => undefined),
    );
  const feature = (name: string, key: Feature) =>
    run(async () => {
      await invoke("execute_odin_feature", {
        databaseName: names.world,
        feature: name,
      });
      setFeatures((current) => ({ ...current, [key]: true }));
    });
  const mail = () => {
    const registry = Number(mailRegistry);
    const storage = Number(mailStorage);
    if (
      !Number.isInteger(registry) ||
      !Number.isInteger(storage) ||
      registry < 500 ||
      storage < 10000
    ) {
      setError("Минимальные значения: PostRegistry — 500, PostStorage — 10000");
      return;
    }
    return run(() =>
      invoke("apply_mail_patch", {
        databaseName: names.world,
        registryCount: registry,
        storageCount: storage,
      }).then(() => undefined),
    );
  };
  const createGm = () => {
    if (!gmLogin.trim() || !gmPassword.trim()) {
      setError("Введите логин и пароль GM-аккаунта");
      return;
    }
    return run(() =>
      invoke("create_gm_account", {
        databaseName: gmDatabase.trim(),
        login: gmLogin.trim(),
        password: gmPassword,
        grade: Number(gmGrade),
        subgrade: Number(gmSubgrade),
      }).then(() => undefined),
    );
  };
  const grantShop = () => {
    if (shopMode === "guild" && !shopGuildName.trim()) {
      setError("Введите название гильдии");
      return;
    }
    if (shopMode === "player" && !shopPlayer.trim()) {
      setError("Введите имя или логин игрока");
      return;
    }
    return run(() =>
      invoke("grant_shop", {
        worldDatabase: names.world.trim(),
        billingDatabase: names.billing.trim(),
        mode: shopMode,
        amount: Number(shopAmount),
        guildName: shopGuildName.trim(),
        guildLevel: Number(shopGuildLevel),
        player: shopPlayer.trim(),
      }).then(() => undefined),
    );
  };
  return (
    <main className="app-shell">
      <header
        className="topbar"
        onMouseDown={(e) => {
          if (e.button === 0) void window.startDragging();
        }}
      >
        <div className="brand-lockup">
          <div className="brand-mark">RF</div>
          <div>
            <p className="eyebrow">LOCAL ENVIRONMENT TOOL</p>
            <p className="brand-name">RFO Setup Studio</p>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="connection-state">
            <span className="state-dot" />
            Локальный режим
          </div>
          <div
            className="window-controls"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="window-button minimize"
              type="button"
              disabled={busy}
              onClick={() => void window.minimize()}
            >
              <span>−</span>
            </button>
            <button
              className="window-button close"
              type="button"
              disabled={busy}
              onClick={() => void window.close()}
            >
              <span>×</span>
            </button>
          </div>
        </div>
      </header>
      {page === "home" && <Home onSelect={setPage} />}
      {page === "databases" && (
        <DatabasePage
          names={names}
          setNames={setNames}
          created={created}
          odbc={odbc}
          setOdbc={setOdbc}
          odinName={odinName}
          setOdinName={setOdinName}
          odinOdbc={odinOdbc}
          setOdinOdbc={setOdinOdbc}
          features={features}
          mailRegistry={mailRegistry}
          mailStorage={mailStorage}
          setMailRegistry={setMailRegistry}
          setMailStorage={setMailStorage}
          busy={busy}
          error={error}
          onBack={() => setPage("home")}
          onCreate={create}
          onCreateOdin={createOdin}
          onFeature={feature}
          onMail={mail}
        />
      )}
      {page === "server" && (
        <ServerPage onBack={() => setPage("home")} />
      )}
      {page === "sql" && (
        <SqlPage
          database={gmDatabase}
          login={gmLogin}
          password={gmPassword}
          grade={gmGrade}
          subgrade={gmSubgrade}
          busy={busy}
          error={error}
          onBack={() => setPage("home")}
          onDatabase={setGmDatabase}
          onLogin={setGmLogin}
          onPassword={setGmPassword}
          onGrade={setGmGrade}
          onSubgrade={setGmSubgrade}
          onCreate={createGm}
          shopMode={shopMode}
          shopAmount={shopAmount}
          shopGuildName={shopGuildName}
          shopGuildLevel={shopGuildLevel}
          shopPlayer={shopPlayer}
          onShopMode={setShopMode}
          onShopAmount={setShopAmount}
          onShopGuildName={setShopGuildName}
          onShopGuildLevel={setShopGuildLevel}
          onShopPlayer={setShopPlayer}
          onGrantShop={grantShop}
        />
      )}
    </main>
  );
}
function Home({ onSelect }: { onSelect: (page: Page) => void }) {
  return (
    <div className="content home-content">
      <section className="hero home-hero">
        <div>
          <p className="section-kicker">RFO / Утилиты</p>
          <h1>Что будем делать?</h1>
          <p className="hero-copy">
            Выберите рабочий режим. Все операции выполняются локально на этом
            компьютере.
          </p>
        </div>
      </section>
      <section className="mode-grid">
        <Mode
          title="Создание базы данных"
          text="Создание и заполнение стандартных баз MSSQL."
          onClick={() => onSelect("databases")}
        />
        <Mode
          title="Создание сервера"
          text="Папки, файлы и структура игрового сервера."
          onClick={() => onSelect("server")}
        />
        <Mode
          title="Скрипты SQL"
          text="Выполнение SQL-запросов в нужных базах."
          onClick={() => onSelect("sql")}
        />
      </section>
      <Footer />
    </div>
  );
}
function Mode({
  title,
  text,
  onClick,
}: {
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className="mode-card" type="button" onClick={onClick}>
      <span className="mode-title">{title}</span>
      <span className="mode-description">{text}</span>
      <span className="mode-action">
        Открыть раздел <b>→</b>
      </span>
    </button>
  );
}

function DatabasePage({
  names,
  setNames,
  created,
  odbc,
  setOdbc,
  odinName,
  setOdinName,
  odinOdbc,
  setOdinOdbc,
  features,
  mailRegistry,
  mailStorage,
  setMailRegistry,
  setMailStorage,
  busy,
  error,
  onBack,
  onCreate,
  onCreateOdin,
  onFeature,
  onMail,
}: {
  names: Record<DatabaseKey, string>;
  setNames: React.Dispatch<React.SetStateAction<Record<DatabaseKey, string>>>;
  created: DatabaseKey[];
  odbc: Record<DatabaseKey, boolean>;
  setOdbc: React.Dispatch<React.SetStateAction<Record<DatabaseKey, boolean>>>;
  odinName: string;
  setOdinName: React.Dispatch<React.SetStateAction<string>>;
  odinOdbc: boolean;
  setOdinOdbc: React.Dispatch<React.SetStateAction<boolean>>;
  features: Record<Feature, boolean>;
  mailRegistry: string;
  mailStorage: string;
  setMailRegistry: React.Dispatch<React.SetStateAction<string>>;
  setMailStorage: React.Dispatch<React.SetStateAction<string>>;
  busy: boolean;
  error: string;
  onBack: () => void;
  onCreate: (key: DatabaseKey) => Promise<void>;
  onCreateOdin: () => Promise<void>;
  onFeature: (name: string, key: Feature) => Promise<void>;
  onMail: () => Promise<void> | undefined;
}) {
  return (
    <div className="content">
      <Heading busy={busy} onBack={onBack} />
      <p className="hero-copy page-description">
        Укажите имена локальных баз MSSQL. Каждая база будет создана и заполнена
        стандартной структурой.
      </p>
      {error && <div className="operation-error">{error}</div>}
      <section className="database-grid">
        {databases.map((item, index) => (
          <DatabaseCard
            key={item.key}
            item={item}
            index={index}
            name={names[item.key]}
            isCreated={created.includes(item.key)}
            odbc={odbc[item.key]}
            busy={busy}
            onName={(value) =>
              setNames((current) => ({ ...current, [item.key]: value }))
            }
            onOdbc={(value) =>
              setOdbc((current) => ({ ...current, [item.key]: value }))
            }
            onCreate={() => void onCreate(item.key)}
          />
        ))}
      </section>
      <WorldFunctions
        features={features}
        busy={busy}
        onFeature={onFeature}
        mailRegistry={mailRegistry}
        mailStorage={mailStorage}
        setMailRegistry={setMailRegistry}
        setMailStorage={setMailStorage}
        onMail={onMail}
      />
      <section className="odin-columns">
        <OdinCreate
          name={odinName}
          odbc={odinOdbc}
          busy={busy}
          onName={setOdinName}
          onOdbc={setOdinOdbc}
          onCreate={onCreateOdin}
        />
        <OdinModules features={features} busy={busy} onFeature={onFeature} />
      </section>
      <Footer />
    </div>
  );
}
function DatabaseCard({
  item,
  name,
  odbc,
  busy,
  onName,
  onOdbc,
  onCreate,
}: {
  item: (typeof databases)[number];
  index: number;
  name: string;
  isCreated?: boolean;
  odbc: boolean;
  busy: boolean;
  onName: (value: string) => void;
  onOdbc: (value: boolean) => void;
  onCreate: () => void;
}) {
  return (
    <article className="database-card">
      <div className="database-heading">
        <h2>{item.label}</h2>
        <p>{item.description}</p>
      </div>
      <label>Имя базы</label>
      <input
        value={name}
        disabled={busy}
        onChange={(e) => onName(e.currentTarget.value)}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={odbc}
          disabled={busy}
          onChange={(e) => onOdbc(e.currentTarget.checked)}
        />{" "}
        Записать в ODBC
      </label>
      <button
        className="create-button"
        type="button"
        disabled={busy || !name.trim()}
        onClick={onCreate}
      >
        <span>{busy ? "Выполняется..." : "Создать базу"}</span>
        <span>↗</span>
      </button>
    </article>
  );
}

function FeatureButton({
  name,
  feature,
  label,
  busy,
  onFeature,
  features: _features,
}: {
  name: string;
  feature: Feature;
  label: string;
  features?: Record<Feature, boolean>;
  busy: boolean;
  onFeature: (name: string, feature: Feature) => Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onFeature(name, feature)}
    >
      {label}
    </button>
  );
}
function WorldFunctions({
  features: _features,
  busy,
  onFeature,
  mailRegistry,
  mailStorage,
  setMailRegistry,
  setMailStorage,
  onMail,
}: {
  features: Record<Feature, boolean>;
  busy: boolean;
  onFeature: (name: string, feature: Feature) => Promise<void>;
  mailRegistry: string;
  mailStorage: string;
  setMailRegistry: React.Dispatch<React.SetStateAction<string>>;
  setMailStorage: React.Dispatch<React.SetStateAction<string>>;
  onMail: () => Promise<void> | undefined;
}) {
  return (
    <section className="world-functions">
      <div className="odbc-heading">
        <div>
          <h2>Дополнительные функции</h2>
          <p>
            GM-модули, онлайн-триггер и почтовый патч устанавливаются отдельно
            от ODIN.
          </p>
        </div>
      </div>
      <div className="feature-list">
        <div className="feature-row">
          <span>
            <strong>GM ПТ / Магия / Скиллы</strong>
            <small>Таблица пересоздается перед установкой</small>
          </span>
          <FeatureButton
            name="gm_skills"
            feature="gm"
            label="Удалить и установить"
            busy={busy}
            onFeature={onFeature}
          />
        </div>
        <div className="feature-row">
          <span>
            <strong>Онлайн триггер</strong>
            <small>Запись статуса игрока в tbl_general</small>
          </span>
          <FeatureButton
            name="online_status"
            feature="online"
            label="Установить"
            busy={busy}
            onFeature={onFeature}
          />
        </div>
      </div>
      <div className="mail-patch">
        <div>
          <strong>Почтовый патч</strong>
          <small>Заполнение tbl_PostRegistry и tbl_PostStorage</small>
        </div>
        <label>
          PostRegistry
          <input
            type="number"
            min="500"
            value={mailRegistry}
            disabled={busy}
            onChange={(e) => setMailRegistry(e.currentTarget.value)}
          />
          <small>Минимум 500</small>
        </label>
        <label>
          PostStorage
          <input
            type="number"
            min="10000"
            value={mailStorage}
            disabled={busy}
            onChange={(e) => setMailStorage(e.currentTarget.value)}
          />
          <small>Минимум 10000</small>
        </label>
        <button type="button" disabled={busy} onClick={() => void onMail()}>
          Применить патч
        </button>
      </div>
    </section>
  );
}
function OdinCreate({
  name,
  odbc,
  busy,
  onName,
  onOdbc,
  onCreate,
}: {
  name: string;
  odbc: boolean;
  busy: boolean;
  onName: React.Dispatch<React.SetStateAction<string>>;
  onOdbc: React.Dispatch<React.SetStateAction<boolean>>;
  onCreate: () => Promise<void>;
}) {
  return (
    <article className="database-card">
      <div className="database-heading">
        <h2>RF ODIN</h2>
        <p>Дополнительная база и ODBC-подключение</p>
      </div>
      <label>Имя базы</label>
      <input
        value={name}
        disabled={busy}
        onChange={(e) => onName(e.currentTarget.value)}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={odbc}
          disabled={busy}
          onChange={(e) => onOdbc(e.currentTarget.checked)}
        />{" "}
        Записать в ODBC
      </label>
      <button
        className="create-button"
        type="button"
        disabled={busy || !name.trim()}
        onClick={() => void onCreate()}
      >
        <span>{busy ? "Выполняется..." : "Создать базу"}</span>
        <span>↗</span>
      </button>
    </article>
  );
}
function OdinModules({
  features: _features,
  busy,
  onFeature,
}: {
  features: Record<Feature, boolean>;
  busy: boolean;
  onFeature: (name: string, feature: Feature) => Promise<void>;
}) {
  return (
    <section className="odin-panel">
      <div className="odbc-heading">
        <div>
          <h2>Функции ODIN</h2>
          <p>Дополнительные модули для RF WORLD.</p>
        </div>
      </div>
      <div className="feature-list">
        <div className="feature-row">
          <span>
            <strong>Auction Currency Query</strong>
            <small>Мультивалютный аукцион</small>
          </span>
          <div className="feature-actions">
            <FeatureButton
              name="auction_enable"
              feature="auction"
              label="Включить"
              features={_features}
              busy={busy}
              onFeature={onFeature}
            />
            <FeatureButton
              name="auction_disable"
              feature="auction"
              label="Выключить"
              features={_features}
              busy={busy}
              onFeature={onFeature}
            />
          </div>
        </div>
        <div className="feature-row">
          <span>
            <strong>Guild Point</strong>
            <small>Добавление очков гильдии</small>
          </span>
          <FeatureButton
            name="guild_point"
            feature="guild"
            label="Установить"
            features={_features}
            busy={busy}
            onFeature={onFeature}
          />
        </div>
        <div className="feature-row">
          <span>
            <strong>Potion Login</strong>
            <small>Авторизация через зелья</small>
          </span>
          <FeatureButton
            name="potion_login"
            feature="potion"
            label="Установить"
            features={_features}
            busy={busy}
            onFeature={onFeature}
          />
        </div>
      </div>
    </section>
  );
}
function SqlPage({
  database,
  login,
  password,
  grade,
  subgrade,
  busy,
  error,
  onBack,
  onDatabase,
  onLogin,
  onPassword,
  onGrade,
  onSubgrade,
  onCreate,
  shopMode,
  shopAmount,
  shopGuildName,
  shopGuildLevel,
  shopPlayer,
  onShopMode,
  onShopAmount,
  onShopGuildName,
  onShopGuildLevel,
  onShopPlayer,
  onGrantShop,
}: {
  database: string;
  login: string;
  password: string;
  grade: string;
  subgrade: string;
  busy: boolean;
  error: string;
  onBack: () => void;
  onDatabase: React.Dispatch<React.SetStateAction<string>>;
  onLogin: React.Dispatch<React.SetStateAction<string>>;
  onPassword: React.Dispatch<React.SetStateAction<string>>;
  onGrade: React.Dispatch<React.SetStateAction<string>>;
  onSubgrade: React.Dispatch<React.SetStateAction<string>>;
  onCreate: () => void;
  shopMode: ShopMode;
  shopAmount: string;
  shopGuildName: string;
  shopGuildLevel: string;
  shopPlayer: string;
  onShopMode: React.Dispatch<React.SetStateAction<ShopMode>>;
  onShopAmount: React.Dispatch<React.SetStateAction<string>>;
  onShopGuildName: React.Dispatch<React.SetStateAction<string>>;
  onShopGuildLevel: React.Dispatch<React.SetStateAction<string>>;
  onShopPlayer: React.Dispatch<React.SetStateAction<string>>;
  onGrantShop: () => Promise<void> | undefined;
}) {
  return (
    <div className="content">
      <div className="heading-actions">
        <button
          className="back-button"
          type="button"
          disabled={busy}
          onClick={onBack}
        >
          ← Главная
        </button>
        <StatusBar busy={busy} />
      </div>
      <section className="hero page-hero">
        <div className="page-heading-content">
          <h1>Скрипты SQL</h1>
          <p className="hero-copy">
            Выполнение подготовленных SQL-операций в выбранной локальной базе.
          </p>
        </div>
      </section>
      {error && <div className="operation-error">{error}</div>}
      <section className="sql-card">
        <div className="odbc-heading">
          <div>
            <h2>Создание GM аккаунта</h2>
            <p>Вызов процедуры pInsert_Staff в базе RF_USER.</p>
          </div>
        </div>
        <div className="sql-form">
          <label>
            Имя базы
            <input
              value={database}
              disabled={busy}
              onChange={(event) => onDatabase(event.currentTarget.value)}
            />
          </label>
          <label>
            Логин
            <input
              maxLength={12}
              value={login}
              disabled={busy}
              onChange={(event) => onLogin(event.currentTarget.value)}
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              maxLength={12}
              value={password}
              disabled={busy}
              onChange={(event) => onPassword(event.currentTarget.value)}
            />
          </label>
          <label>
            Grade
            <select
              value={grade}
              disabled={busy}
              onChange={(event) => onGrade(event.currentTarget.value)}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Subgrade
            <select
              value={subgrade}
              disabled={busy}
              onChange={(event) => onSubgrade(event.currentTarget.value)}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="create-button sql-submit"
          type="button"
          disabled={
            busy || !database.trim() || !login.trim() || !password.trim()
          }
          onClick={onCreate}
        >
          {busy ? "Выполняется..." : "Создать GM аккаунт"}
          <span>↗</span>
        </button>
      </section>
      <section className="sql-card shop-card">
        <div className="odbc-heading">
          <div>
            <h2>Выдача шопа</h2>
            <p>Пополнение Cash для всех игроков, гильдии или одного игрока.</p>
          </div>
        </div>
        <div className="shop-modes" role="group" aria-label="Режим выдачи шопа">
          {(["all", "guild", "player"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={shopMode === mode ? "is-selected" : ""}
              disabled={busy}
              onClick={() => onShopMode(mode)}
            >
              {mode === "all" ? "Всем" : mode === "guild" ? "Гильдии" : "Игроку"}
            </button>
          ))}
        </div>
        <div className="shop-form">
          {shopMode === "guild" && <>
            <label>Название гильдии<input value={shopGuildName} disabled={busy} onChange={(event) => onShopGuildName(event.currentTarget.value)} /></label>
            <label>Минимальный уровень<input type="number" min="0" max="255" value={shopGuildLevel} disabled={busy} onChange={(event) => onShopGuildLevel(event.currentTarget.value)} /></label>
          </>}
          {shopMode === "player" && <label>Имя или логин игрока<input value={shopPlayer} disabled={busy} onChange={(event) => onShopPlayer(event.currentTarget.value)} /></label>}
          <label>Количество<input type="number" min="1" value={shopAmount} disabled={busy} onChange={(event) => onShopAmount(event.currentTarget.value)} /></label>
        </div>
        <button className="create-button sql-submit" type="button" disabled={busy || !shopAmount.trim()} onClick={() => void onGrantShop()}>
          {busy ? "Выполняется..." : "Выдать шоп"}<span>↗</span>
        </button>
      </section>
      <Footer />
    </div>
  );
}
function Heading({ busy, onBack }: { busy?: boolean; onBack: () => void }) {
  return (
    <>
      <div className="heading-actions">
        <button
          className="back-button"
          type="button"
          disabled={busy}
          onClick={onBack}
        >
          ← Главная
        </button>
        <StatusBar busy={!!busy} />
      </div>
      <section className="hero page-hero">
        <div className="page-heading-content">
          <p className="section-kicker">01 / Инициализация</p>
          <h1>Создание баз данных</h1>
        </div>
      </section>
    </>
  );
}
function StatusBar({ busy }: { busy: boolean }) {
  return (
    <div className={`status-bar ${busy ? "is-busy" : ""}`} role="status">
      <span className="status-indicator" />
      {busy ? "Выполняется..." : "Готово"}
      {busy && <span className="status-loader" />}
    </div>
  );
}
type ServerSettings = {
  serverPath: string;
  billingDatabase: string; userDatabase: string; worldDatabase: string;
  mssqlPassword: string; worldName: string; maxPlayers: number; hbkPath: string;
  historyPath: string; odinEnabled: boolean; portProtection: boolean;
  accountServerPort: number; launcherPort: number; launcherEncryption: number;
  loginServerPort: number; controlServerPort: number; zoneServerPort: number;
  checkIpForKick: number;
};

const emptyServerSettings: ServerSettings = {
  serverPath: "", billingDatabase: "BILLING", userDatabase: "RF_USER", worldDatabase: "RF_WORLD",
  mssqlPassword: "", worldName: "Novus", maxPlayers: 2000, hbkPath: "C:/L/ServerName",
  historyPath: "C:/L/ServerName", odinEnabled: false, portProtection: false, accountServerPort: 27000,
  launcherPort: 10001, launcherEncryption: 0, loginServerPort: 27000, controlServerPort: 28000,
  zoneServerPort: 29000, checkIpForKick: 0,
};

function ServerPage({ onBack }: { onBack: () => void }) {
  const [serverPath, setServerPath] = useState("");
  const [patchPath, setPatchPath] = useState("");
  const [settings, setSettings] = useState<ServerSettings>(emptyServerSettings);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function action(task: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await task(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  const update = (key: keyof ServerSettings, value: string | number | boolean) =>
    setSettings((current) => ({ ...current, [key]: value } as ServerSettings));
  const load = () => {
    if (!settings.serverPath.trim()) { setError("Укажите путь к папке сервера"); return; }
    void action(async () => {
      const loaded = await invoke<ServerSettings>("load_server_settings", { serverPath: settings.serverPath });
      setSettings(loaded); setPatchPath(loaded.serverPath);
    });
  };
  const save = () => {
    if (!settings.serverPath.trim()) { setError("Сначала укажите путь к папке сервера"); return; }
    void action(() => invoke("save_server_settings", { settings }));
  };
  const driver = (name: string) => void action(() => invoke("run_driver", { driver: name }));
  return (
    <div className="content server-content">
      <HeadingServer busy={busy} onBack={onBack} />
      <section className="hero page-hero"><div className="page-heading-content"><p className="section-kicker">Создание сервера</p><h1>Подготовка файлов</h1><p className="hero-copy">Драйверы и архивы берутся из папки <code>arch</code> рядом с exe. В разработке отсутствие файлов показывается как ошибка.</p></div></section>
      {error && <div className="operation-error">{error}</div>}
      <section className="driver-panel"><div><h2>Установка драйверов</h2><p>MSI запускаются через msiexec, BAT через cmd.</p></div><div className="driver-actions">{[["account", "Account.msi"], ["depend", "RFDepend.msi"], ["sql", "sqlncli.msi"], ["vcredist", "VCRedist"]].map(([name, label]) => <button key={name} type="button" disabled={busy} onClick={() => driver(name)}>{label} <span>↗</span></button>)}</div></section>
      <section className="server-grid"><article className="server-card"><span className="server-card-label">01</span><h2>Распаковка сервера</h2><p>Архив RFClearServer распаковывается в выбранную папку.</p><label>Путь распаковки<input value={serverPath} disabled={busy} placeholder="C:/Games/RF" onChange={(e) => { setServerPath(e.currentTarget.value); update("serverPath", e.currentTarget.value); }} /></label><div className="server-actions"><button className="primary-server-button" type="button" disabled={busy || !serverPath.trim()} onClick={() => void action(() => invoke("extract_server", { serverPath }))}>Распаковать сервер <span>↗</span></button></div></article><article className="server-card"><span className="server-card-label">02</span><h2>Патч ODIN</h2><p>RFOdinPatch заменяет файлы в выбранной папке.</p><label>Путь к серверу<input value={patchPath} disabled={busy} placeholder="C:/Games/RF" onChange={(e) => setPatchPath(e.currentTarget.value)} /></label><div className="server-actions"><button className="primary-server-button" type="button" disabled={busy || !patchPath.trim()} onClick={() => void action(() => invoke("apply_server_patch", { serverPath: patchPath }))}>Применить патч <span>↗</span></button></div></article></section>
        <section className="sql-card server-settings"><div className="odbc-heading"><div><h2>Настройки сервера</h2><p>В папке сервера должны находиться AccountLogin и ZoneServer. Конфиг хранится в config/server-settings.json.</p></div><button className="odbc-button" type="button" disabled={busy || !settings.serverPath.trim()} onClick={load}>Загрузить настройки</button></div>
          <div className="sql-form"><label>Путь к папке сервера<input value={settings.serverPath} disabled={busy} placeholder="C:/Games/RF" onChange={(e) => update("serverPath", e.currentTarget.value)} /></label></div>
         <div className="sql-form"><label>Billing DB<input value={settings.billingDatabase} disabled={busy} onChange={(e) => update("billingDatabase", e.currentTarget.value)} /></label><label>RF User DB<input value={settings.userDatabase} disabled={busy} onChange={(e) => update("userDatabase", e.currentTarget.value)} /></label><label>RF World DB<input value={settings.worldDatabase} disabled={busy} onChange={(e) => update("worldDatabase", e.currentTarget.value)} /></label><label>World name<input value={settings.worldName} disabled={busy} onChange={(e) => update("worldName", e.currentTarget.value)} /></label><label>Максимум игроков<input type="number" value={settings.maxPlayers} disabled={busy} onChange={(e) => update("maxPlayers", Number(e.currentTarget.value))} /></label><label>MSSQL password<div className="password-field"><input type={showPassword ? "text" : "password"} value={settings.mssqlPassword} disabled={busy} onChange={(e) => update("mssqlPassword", e.currentTarget.value)} /><button type="button" disabled={busy} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Скрыть" : "Показать"}</button></div></label><label>HBK path<input value={settings.hbkPath} disabled={busy} onChange={(e) => update("hbkPath", e.currentTarget.value)} /></label><label>History path<input value={settings.historyPath} disabled={busy} onChange={(e) => update("historyPath", e.currentTarget.value)} /></label></div>
        <label className="checkbox-label"><input type="checkbox" checked={settings.odinEnabled} disabled={busy} onChange={(e) => update("odinEnabled", e.currentTarget.checked)} /> RF ODIN</label>
         {settings.odinEnabled && <div className="sql-form odin-settings"><label className="checkbox-label"><input type="checkbox" checked={settings.portProtection} disabled={busy} onChange={(e) => update("portProtection", e.currentTarget.checked)} /> PortProtection (общий для Login/Zone)</label>{([ ["accountServerPort", "AccountServerPort"], ["launcherPort", "LauncherPort"], ["loginServerPort", "LoginServerPort"], ["controlServerPort", "ControlServerPort"], ["zoneServerPort", "ZoneServerPort"] ] as [keyof ServerSettings, string][]).map(([key, label]) => <label key={label}>{label}<input type="number" value={settings[key] as number} disabled={busy} onChange={(e) => update(key, Number(e.currentTarget.value))} /></label>)}<label className="checkbox-label"><input type="checkbox" checked={settings.launcherEncryption === 1} disabled={busy} onChange={(e) => update("launcherEncryption", e.currentTarget.checked ? 1 : 0)} /> Использовать ODIN лаунчер</label><label className="checkbox-label"><input type="checkbox" checked={settings.checkIpForKick === 1} disabled={busy} onChange={(e) => update("checkIpForKick", e.currentTarget.checked ? 1 : 0)} /> Кик персонажа с любого IP</label></div>}
          <button className="create-button sql-submit" type="button" disabled={busy || !settings.serverPath.trim()} onClick={save}>{busy ? "Выполняется..." : "Сохранить настройки и INI"}<span>↗</span></button>
      </section><Footer />
    </div>
  );
}

function HeadingServer({ busy, onBack }: { busy: boolean; onBack: () => void }) { return <div className="heading-actions"><button className="back-button" type="button" disabled={busy} onClick={onBack}>← Главная</button><StatusBar busy={busy} /></div>; }

function LegacyServerPage({ onBack }: { onBack: () => void }) {
  const [serverPath, setServerPath] = useState("");
  const [patchPath, setPatchPath] = useState("");
  useEffect(() => {
    const actions = document.querySelector<HTMLElement>(".driver-actions");
    if (!actions) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "sqlncli.msi ↗";
    actions.append(button);
    return () => button.remove();
  }, []);
  return <div className="content server-content"><div className="heading-actions"><button className="back-button" type="button" onClick={onBack}>← Главная</button><StatusBar busy={false} /></div><section className="hero page-hero"><div className="page-heading-content"><p className="section-kicker">Создание сервера</p><h1>Подготовка файлов</h1><p className="hero-copy">Установите зависимости, распакуйте чистый сервер, при необходимости примените патч ODIN, а затем настройте файлы.</p></div></section><section className="driver-panel"><div><h2>Установка драйверов</h2><p>Необходимые компоненты для запуска сервера.</p></div><div className="driver-actions"><button type="button">Acccount.msi <span>↗</span></button><button type="button">RFDepend.msi <span>↗</span></button><button type="button">VCRedist <span>↗</span></button></div></section><section className="server-grid"><article className="server-card"><span className="server-card-label">01</span><h2>Распаковка сервера</h2><p>Архив <code>RFClearServer</code> будет распакован в выбранную папку.</p><label>Путь распаковки<input value={serverPath} placeholder="Выберите папку сервера" onChange={(event) => setServerPath(event.currentTarget.value)} /></label><div className="server-actions"><button type="button">Выбрать папку</button><button className="primary-server-button" type="button" disabled={!serverPath.trim()}>Распаковать сервер <span>↗</span></button></div></article><article className="server-card"><span className="server-card-label">02</span><h2>Патч ODIN</h2><p>Файлы из архива <code>RFOdinPatch</code> будут заменены в выбранной папке.</p><label>Путь к серверу<input value={patchPath} placeholder="Выберите папку сервера" onChange={(event) => setPatchPath(event.currentTarget.value)} /></label><div className="server-actions"><button type="button">Выбрать папку</button><button className="primary-server-button" type="button" disabled={!patchPath.trim()}>Применить патч <span>↗</span></button></div></article></section><section className="server-settings-placeholder"><div><span className="server-card-label">03</span><h2>Настройка сервера</h2><p>Настройка конфигурационных файлов будет добавлена следующим этапом.</p></div><span className="coming-soon">Скоро</span></section><Footer /></div>;
}
void LegacyServerPage;
function Footer() {
  return (
    <footer>
      <span>
        RFO Setup Studio <b>v0.1.0</b>
      </span>
      <span>Только локальное подключение · Без удаленного доступа</span>
    </footer>
  );
}
export default App;
