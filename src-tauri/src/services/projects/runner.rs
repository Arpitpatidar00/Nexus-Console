// Project runner: what a project is (from its own config files), what it can
// run, and whether it's ready to — tools, versions, dependencies, .env, ports.
// `detect` only reads files; `profile` adds the probes (tool versions, who is
// listening). The terminal runs a task by id: the frontend never sends a
// command, Rust re-detects and resolves the steps (services::pty).

use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskKind {
    Install,
    Dev,
    Start,
    Build,
    Test,
    Lint,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub label: String,
    pub kind: TaskKind,
    /// Each step is one argv, run in order in the project folder.
    pub steps: Vec<Vec<String>>,
    /// Where it came from: "package.json", "Makefile", "Django"…
    pub source: String,
    /// Keeps running (a server, a watcher) rather than finishing.
    pub long_running: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Deps {
    Installed,
    Missing,
    /// The lockfile changed after the last install.
    Stale,
    /// The toolchain fetches them itself (Go, Maven, Gradle, Cargo…).
    NotNeeded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    pub name: String,
    /// Shown to the user: "Node.js", "pnpm".
    pub label: String,
    pub needed_for: String,
    pub install: String,
    pub found: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Level {
    Ok,
    Warn,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Fix {
    #[serde(rename_all = "camelCase")]
    RunTask { task_id: String },
    #[serde(rename_all = "camelCase")]
    CreateEnv { from: String },
    /// A command for the user to run (copyable), e.g. `brew install node`.
    #[serde(rename_all = "camelCase")]
    Command { text: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: String,
    pub level: Level,
    pub title: String,
    pub detail: Option<String>,
    pub fix: Option<Fix>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listener {
    pub pid: u32,
    pub command: String,
    pub port: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectProfile {
    pub path: String,
    pub name: String,
    pub stacks: Vec<String>,
    pub frameworks: Vec<String>,
    pub package_manager: Option<String>,
    pub tasks: Vec<Task>,
    /// The task "Run" starts.
    pub primary: Option<String>,
    /// The task that installs dependencies for the primary stack.
    pub install: Option<String>,
    pub deps: Deps,
    pub has_env: bool,
    /// Whether .env was read (consent given): missing keys are only known then.
    pub env_read: bool,
    pub env_template: Option<String>,
    /// Keys the template has and .env doesn't (names only, never values).
    pub env_missing_keys: Vec<String>,
    pub expected_port: Option<u16>,
    pub tools: Vec<Tool>,
    /// Processes listening from inside this project folder.
    pub running: Vec<Listener>,
    pub checks: Vec<Check>,
}

/// What files alone say. `profile` turns it into a ProjectProfile.
#[derive(Debug, Default)]
pub struct Detected {
    pub stacks: Vec<String>,
    pub frameworks: Vec<String>,
    pub package_manager: Option<String>,
    pub tasks: Vec<Task>,
    pub primary: Option<String>,
    pub install: Option<String>,
    pub deps: Option<Deps>,
    pub expected_port: Option<u16>,
    /// (tool, label, needed for, install hint).
    pub tools: Vec<(String, String, String, String)>,
    pub node_wanted: Option<(String, String)>,
}

fn s(v: &[&str]) -> Vec<String> {
    v.iter().map(|x| x.to_string()).collect()
}

fn read(p: &Path) -> Option<String> {
    std::fs::read_to_string(p).ok()
}

fn mtime(p: &Path) -> Option<SystemTime> {
    std::fs::metadata(p).and_then(|m| m.modified()).ok()
}

fn kind_of(name: &str) -> TaskKind {
    let n = name.to_ascii_lowercase();
    let first = n.split([':', '-', '_', '.']).next().unwrap_or(&n);
    match first {
        "dev" | "develop" | "serve" | "watch" => TaskKind::Dev,
        "start" | "run" | "server" | "up" => TaskKind::Start,
        "build" | "compile" | "package" | "dist" | "export" | "bundle" => TaskKind::Build,
        "test" | "tests" | "e2e" | "spec" | "coverage" => TaskKind::Test,
        "lint" | "format" | "fmt" | "typecheck" | "check" | "prettier" | "eslint" | "tsc" => {
            TaskKind::Lint
        }
        "install" | "setup" | "bootstrap" | "deps" => TaskKind::Install,
        _ => TaskKind::Other,
    }
}

fn long_running(name: &str, kind: TaskKind) -> bool {
    matches!(kind, TaskKind::Dev | TaskKind::Start)
        || name.contains("watch")
        || name.contains("serve")
}

fn task(id: &str, label: &str, kind: TaskKind, steps: Vec<Vec<String>>, source: &str) -> Task {
    Task {
        id: id.into(),
        label: label.into(),
        kind,
        long_running: long_running(label, kind),
        steps,
        source: source.into(),
    }
}

fn tool(d: &mut Detected, name: &str, label: &str, needed_for: &str, install: &str) {
    if !d.tools.iter().any(|t| t.0 == name) {
        d.tools
            .push((name.into(), label.into(), needed_for.into(), install.into()));
    }
}

/// The first `-p 4000`, `--port 4000`, `--port=4000` or `PORT=4000` in a command.
pub fn port_in(cmd: &str) -> Option<u16> {
    let re = regex::Regex::new(r"(?:--port[= ]|-p |PORT=)(\d{2,5})\b").ok()?;
    re.captures(cmd)?.get(1)?.as_str().parse().ok()
}

// --- Node ----------------------------------------------------------------------

fn detect_node(dir: &Path, d: &mut Detected) {
    let Some(pkg) =
        read(&dir.join("package.json")).and_then(|t| serde_json::from_str::<Value>(&t).ok())
    else {
        return;
    };
    d.stacks.push("Node".into());
    let pm = pkg
        .get("packageManager")
        .and_then(Value::as_str)
        .and_then(|v| v.split('@').next())
        .filter(|v| ["npm", "pnpm", "yarn", "bun"].contains(v))
        .map(str::to_string)
        .unwrap_or_else(|| {
            if dir.join("pnpm-lock.yaml").exists() {
                "pnpm"
            } else if dir.join("yarn.lock").exists() {
                "yarn"
            } else if dir.join("bun.lockb").exists() || dir.join("bun.lock").exists() {
                "bun"
            } else {
                "npm"
            }
            .into()
        });
    d.package_manager = Some(pm.clone());

    let deps: BTreeSet<String> = ["dependencies", "devDependencies"]
        .iter()
        .filter_map(|k| pkg.get(k).and_then(Value::as_object))
        .flat_map(|m| m.keys().cloned())
        .collect();
    let has = |n: &str| deps.contains(n) || deps.iter().any(|d| d.starts_with(&format!("{n}/")));
    const FRAMEWORKS: &[(&str, &str, Option<u16>)] = &[
        ("next", "Next.js", Some(3000)),
        ("nuxt", "Nuxt", Some(3000)),
        ("@remix-run", "Remix", Some(5173)),
        ("astro", "Astro", Some(4321)),
        ("@sveltejs/kit", "SvelteKit", Some(5173)),
        ("@angular/core", "Angular", Some(4200)),
        ("@nestjs/core", "NestJS", Some(3000)),
        ("expo", "Expo", Some(8081)),
        ("react-native", "React Native", Some(8081)),
        ("electron", "Electron", None),
        ("@tauri-apps/cli", "Tauri", None),
        ("react-scripts", "Create React App", Some(3000)),
        ("vite", "Vite", Some(5173)),
        ("express", "Express", Some(3000)),
        ("fastify", "Fastify", Some(3000)),
        ("hono", "Hono", None),
        ("react", "React", None),
        ("vue", "Vue", None),
        ("svelte", "Svelte", None),
    ];
    for (dep, name, port) in FRAMEWORKS {
        if has(dep) && d.frameworks.len() < 3 {
            d.frameworks.push((*name).into());
            if d.expected_port.is_none() {
                d.expected_port = *port;
            }
        }
    }
    if pkg.get("workspaces").is_some()
        || dir.join("pnpm-workspace.yaml").exists()
        || dir.join("turbo.json").exists()
    {
        d.frameworks.push("Monorepo".into());
    }

    let install_args: Vec<String> = s(&[&pm, "install"]);
    d.tasks.push(task(
        "install:node",
        &format!("{pm} install"),
        TaskKind::Install,
        vec![install_args],
        "package.json",
    ));
    let scripts = pkg.get("scripts").and_then(Value::as_object);
    if let Some(scripts) = scripts {
        for (name, cmd) in scripts {
            let kind = kind_of(name);
            let run = match pm.as_str() {
                "yarn" => s(&["yarn", "run", name]),
                other => s(&[other, "run", name]),
            };
            let mut t = task(
                &format!("script:{name}"),
                name,
                kind,
                vec![run],
                "package.json",
            );
            if let Some(c) = cmd.as_str() {
                t.long_running = t.long_running
                    || c.contains("--watch")
                    || c.starts_with("nodemon")
                    || c.starts_with("ts-node-dev");
            }
            d.tasks.push(t);
        }
        for want in ["dev", "start", "serve", "develop"] {
            if scripts.contains_key(want) {
                d.primary.get_or_insert(format!("script:{want}"));
                if let Some(p) = scripts.get(want).and_then(Value::as_str).and_then(port_in) {
                    d.expected_port = Some(p);
                }
                break;
            }
        }
    }
    d.install.get_or_insert("install:node".into());

    let nm = dir.join("node_modules");
    let deps_state = if deps.is_empty() {
        Deps::NotNeeded
    } else if !nm.is_dir() {
        Deps::Missing
    } else {
        let lock = [
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
            "bun.lockb",
            "bun.lock",
        ]
        .iter()
        .filter_map(|f| mtime(&dir.join(f)))
        .max();
        let installed = [
            ".package-lock.json",
            ".modules.yaml",
            ".yarn-state.yml",
            ".yarn-integrity",
        ]
        .iter()
        .filter_map(|f| mtime(&nm.join(f)))
        .max()
        .or_else(|| mtime(&nm));
        match (lock, installed) {
            // A minute's grace: installs touch the lockfile too.
            (Some(l), Some(i)) if l > i + Duration::from_secs(60) => Deps::Stale,
            _ => Deps::Installed,
        }
    };
    d.deps.get_or_insert(deps_state);

    tool(
        d,
        "node",
        "Node.js",
        "running the project",
        "brew install node",
    );
    match pm.as_str() {
        "pnpm" => tool(
            d,
            "pnpm",
            "pnpm",
            "installing dependencies",
            "corepack enable pnpm",
        ),
        "yarn" => tool(
            d,
            "yarn",
            "Yarn",
            "installing dependencies",
            "corepack enable yarn",
        ),
        "bun" => tool(
            d,
            "bun",
            "Bun",
            "installing and running",
            "brew install oven-sh/bun/bun",
        ),
        _ => {}
    }
    let wanted = read(&dir.join(".nvmrc"))
        .map(|v| (v.trim().to_string(), ".nvmrc".to_string()))
        .or_else(|| {
            read(&dir.join(".node-version"))
                .map(|v| (v.trim().to_string(), ".node-version".to_string()))
        })
        .or_else(|| {
            pkg.get("engines")
                .and_then(|e| e.get("node"))
                .and_then(Value::as_str)
                .map(|v| (v.to_string(), "package.json engines".to_string()))
        });
    d.node_wanted = wanted.filter(|(v, _)| !v.is_empty());
}

// --- Python ------------------------------------------------------------------------

/// `(module, variable)` of the first `x = FastAPI(` / `Flask(` among `files`.
fn find_app(dir: &Path, files: &[&str], ctor: &str) -> Option<(String, String, String)> {
    let re = regex::Regex::new(&format!(r"(?m)^(\w+)\s*=\s*{ctor}\(")).ok()?;
    for f in files {
        let Some(text) = read(&dir.join(f)) else {
            continue;
        };
        if let Some(c) = re.captures(&text) {
            let module = f.trim_end_matches(".py").replace('/', ".");
            return Some((module, c[1].to_string(), (*f).to_string()));
        }
    }
    None
}

fn detect_python(dir: &Path, d: &mut Detected) {
    let markers = [
        "pyproject.toml",
        "requirements.txt",
        "Pipfile",
        "setup.py",
        "manage.py",
    ];
    if !markers.iter().any(|m| dir.join(m).is_file()) {
        return;
    }
    d.stacks.push("Python".into());
    let pyproject = read(&dir.join("pyproject.toml")).unwrap_or_default();
    let reqs = read(&dir.join("requirements.txt"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    let manager = if dir.join("uv.lock").exists() {
        "uv"
    } else if dir.join("poetry.lock").exists() || pyproject.contains("[tool.poetry]") {
        "poetry"
    } else if dir.join("Pipfile").exists() {
        "pipenv"
    } else {
        "pip"
    };
    let venv = [".venv", "venv"]
        .into_iter()
        .find(|v| dir.join(v).join("bin/python").exists());
    let py: Vec<String> = match manager {
        "uv" => s(&["uv", "run", "python"]),
        "poetry" => s(&["poetry", "run", "python"]),
        "pipenv" => s(&["pipenv", "run", "python"]),
        _ => vec![venv.map_or_else(|| "python3".to_string(), |v| format!("{v}/bin/python"))],
    };
    let with = |args: &[&str]| -> Vec<String> {
        py.iter()
            .cloned()
            .chain(args.iter().map(|a| a.to_string()))
            .collect()
    };

    let install: Vec<Vec<String>> = match manager {
        "uv" => vec![s(&["uv", "sync"])],
        "poetry" => vec![s(&["poetry", "install"])],
        "pipenv" => vec![s(&["pipenv", "install"])],
        _ => {
            let mut steps = Vec::new();
            let v = venv.unwrap_or(".venv");
            if venv.is_none() {
                steps.push(s(&["python3", "-m", "venv", ".venv"]));
            }
            let pip = format!("{v}/bin/pip");
            if dir.join("requirements.txt").exists() {
                steps.push(s(&[&pip, "install", "-r", "requirements.txt"]));
            } else if !pyproject.is_empty() || dir.join("setup.py").exists() {
                steps.push(s(&[&pip, "install", "-e", "."]));
            }
            steps
        }
    };
    if !install.is_empty() {
        let label = match manager {
            "pip" => "Create .venv and install".to_string(),
            m => format!("{m} install"),
        };
        d.tasks.push(task(
            "install:python",
            &label,
            TaskKind::Install,
            install,
            manager,
        ));
        d.install.get_or_insert("install:python".into());
    }
    let deps_state = match manager {
        "pip" => match venv {
            None => Deps::Missing,
            Some(v) => match (
                mtime(&dir.join("requirements.txt")),
                mtime(&dir.join(v).join("pyvenv.cfg")),
            ) {
                (Some(r), Some(i)) if r > i + Duration::from_secs(60) => Deps::Stale,
                _ => Deps::Installed,
            },
        },
        _ => {
            if dir.join(".venv").is_dir() || manager == "pipenv" {
                Deps::Installed
            } else {
                Deps::Missing
            }
        }
    };
    d.deps.get_or_insert(deps_state);

    let lower_project = pyproject.to_ascii_lowercase();
    let mentions = |pkg: &str| reqs.contains(pkg) || lower_project.contains(pkg);
    let candidates = [
        "main.py",
        "app.py",
        "app/main.py",
        "src/main.py",
        "server.py",
        "api/main.py",
    ];
    if dir.join("manage.py").exists() {
        d.frameworks.push("Django".into());
        d.tasks.push(task(
            "django:run",
            "runserver",
            TaskKind::Dev,
            vec![with(&["manage.py", "runserver"])],
            "Django",
        ));
        d.tasks.push(task(
            "django:migrate",
            "migrate",
            TaskKind::Other,
            vec![with(&["manage.py", "migrate"])],
            "Django",
        ));
        d.tasks.push(task(
            "django:test",
            "test",
            TaskKind::Test,
            vec![with(&["manage.py", "test"])],
            "Django",
        ));
        d.primary.get_or_insert("django:run".into());
        d.expected_port.get_or_insert(8000);
    } else if let Some((module, var, _)) = find_app(dir, &candidates, "FastAPI") {
        d.frameworks.push("FastAPI".into());
        d.tasks.push(task(
            "fastapi:run",
            "uvicorn --reload",
            TaskKind::Dev,
            vec![with(&[
                "-m",
                "uvicorn",
                &format!("{module}:{var}"),
                "--reload",
            ])],
            "FastAPI",
        ));
        d.primary.get_or_insert("fastapi:run".into());
        d.expected_port.get_or_insert(8000);
    } else if let Some((module, _, _)) = find_app(dir, &candidates, "Flask") {
        d.frameworks.push("Flask".into());
        d.tasks.push(task(
            "flask:run",
            "flask run --debug",
            TaskKind::Dev,
            vec![with(&["-m", "flask", "--app", &module, "run", "--debug"])],
            "Flask",
        ));
        d.primary.get_or_insert("flask:run".into());
        d.expected_port.get_or_insert(5000);
    } else if let Some(f) = ["streamlit_app.py", "app.py", "main.py"]
        .into_iter()
        .find(|f| read(&dir.join(f)).is_some_and(|t| t.contains("import streamlit")))
    {
        d.frameworks.push("Streamlit".into());
        d.tasks.push(task(
            "streamlit:run",
            &format!("streamlit run {f}"),
            TaskKind::Dev,
            vec![with(&["-m", "streamlit", "run", f])],
            "Streamlit",
        ));
        d.primary.get_or_insert("streamlit:run".into());
        d.expected_port.get_or_insert(8501);
    } else if let Some(f) = ["main.py", "app.py", "server.py"]
        .into_iter()
        .find(|f| dir.join(f).is_file())
    {
        d.tasks.push(task(
            "python:run",
            &format!("python {f}"),
            TaskKind::Start,
            vec![with(&[f])],
            "Python",
        ));
        d.primary.get_or_insert("python:run".into());
    }
    if mentions("pytest") || dir.join("pytest.ini").exists() {
        d.tasks.push(task(
            "python:test",
            "pytest",
            TaskKind::Test,
            vec![with(&["-m", "pytest"])],
            "Python",
        ));
    }
    tool(
        d,
        "python3",
        "Python",
        "running the project",
        "brew install python",
    );
    if manager != "pip" {
        let hint = match manager {
            "uv" => "brew install uv",
            "poetry" => "brew install poetry",
            _ => "brew install pipenv",
        };
        tool(d, manager, manager, "installing dependencies", hint);
    }
}

// --- JVM -------------------------------------------------------------------------

fn detect_jvm(dir: &Path, d: &mut Detected) {
    if let Some(pom) = read(&dir.join("pom.xml")) {
        d.stacks.push("Java".into());
        let wrapper = dir.join("mvnw").is_file();
        let mvn = if wrapper { "./mvnw" } else { "mvn" };
        let spring = pom.contains("spring-boot");
        if spring {
            d.frameworks.push("Spring Boot".into());
            d.tasks.push(task(
                "mvn:run",
                "spring-boot:run",
                TaskKind::Dev,
                vec![s(&[mvn, "spring-boot:run"])],
                "Maven",
            ));
            d.primary.get_or_insert("mvn:run".into());
            d.expected_port.get_or_insert(8080);
        }
        d.tasks.push(task(
            "mvn:package",
            "package",
            TaskKind::Build,
            vec![s(&[mvn, "package", "-DskipTests"])],
            "Maven",
        ));
        d.tasks.push(task(
            "mvn:test",
            "test",
            TaskKind::Test,
            vec![s(&[mvn, "test"])],
            "Maven",
        ));
        d.deps.get_or_insert(Deps::NotNeeded);
        tool(
            d,
            "java",
            "Java (JDK)",
            "building and running",
            "brew install openjdk",
        );
        if !wrapper {
            tool(d, "mvn", "Maven", "building", "brew install maven");
        }
        return;
    }
    let build = [
        "build.gradle.kts",
        "build.gradle",
        "app/build.gradle.kts",
        "app/build.gradle",
    ]
    .iter()
    .filter_map(|f| read(&dir.join(f)))
    .collect::<Vec<_>>()
    .join("\n");
    let settings = ["settings.gradle.kts", "settings.gradle"]
        .iter()
        .any(|f| dir.join(f).exists());
    if build.is_empty() && !settings {
        return;
    }
    let wrapper = dir.join("gradlew").is_file();
    let gw = if wrapper { "./gradlew" } else { "gradle" };
    if build.contains("com.android.application") {
        d.stacks.push("Android".into());
        d.tasks.push(task(
            "gradle:assembleDebug",
            "assembleDebug",
            TaskKind::Build,
            vec![s(&[gw, "assembleDebug"])],
            "Gradle",
        ));
        d.tasks.push(task(
            "gradle:installDebug",
            "installDebug",
            TaskKind::Start,
            vec![s(&[gw, "installDebug"])],
            "Gradle",
        ));
        d.primary.get_or_insert("gradle:installDebug".into());
    } else {
        d.stacks.push("Java".into());
        if build.contains("org.springframework.boot") {
            d.frameworks.push("Spring Boot".into());
            d.tasks.push(task(
                "gradle:bootRun",
                "bootRun",
                TaskKind::Dev,
                vec![s(&[gw, "bootRun"])],
                "Gradle",
            ));
            d.primary.get_or_insert("gradle:bootRun".into());
            d.expected_port.get_or_insert(8080);
        } else if build.contains("application") {
            d.tasks.push(task(
                "gradle:run",
                "run",
                TaskKind::Start,
                vec![s(&[gw, "run"])],
                "Gradle",
            ));
            d.primary.get_or_insert("gradle:run".into());
        }
    }
    d.tasks.push(task(
        "gradle:build",
        "build",
        TaskKind::Build,
        vec![s(&[gw, "build"])],
        "Gradle",
    ));
    d.tasks.push(task(
        "gradle:test",
        "test",
        TaskKind::Test,
        vec![s(&[gw, "test"])],
        "Gradle",
    ));
    d.deps.get_or_insert(Deps::NotNeeded);
    tool(
        d,
        "java",
        "Java (JDK)",
        "building and running",
        "brew install openjdk",
    );
    if !wrapper {
        tool(d, "gradle", "Gradle", "building", "brew install gradle");
    }
}

// --- Go, Rust, Flutter, PHP, Ruby, .NET, Deno ------------------------------------------

fn has_main_go(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .any(|e| {
            e.path().extension().is_some_and(|x| x == "go")
                && read(&e.path()).is_some_and(|t| t.contains("package main"))
        })
}

fn detect_others(dir: &Path, d: &mut Detected) {
    if dir.join("go.mod").is_file() {
        d.stacks.push("Go".into());
        if has_main_go(dir) {
            d.tasks.push(task(
                "go:run",
                "go run .",
                TaskKind::Start,
                vec![s(&["go", "run", "."])],
                "Go",
            ));
            d.primary.get_or_insert("go:run".into());
        }
        if let Ok(rd) = std::fs::read_dir(dir.join("cmd")) {
            let mut cmds: Vec<String> = rd
                .flatten()
                .filter(|e| e.path().is_dir() && has_main_go(&e.path()))
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect();
            cmds.sort();
            for c in cmds {
                let id = format!("go:run:{c}");
                d.tasks.push(task(
                    &id,
                    &format!("go run ./cmd/{c}"),
                    TaskKind::Start,
                    vec![s(&["go", "run", &format!("./cmd/{c}")])],
                    "Go",
                ));
                d.primary.get_or_insert(id);
            }
        }
        d.tasks.push(task(
            "go:build",
            "go build",
            TaskKind::Build,
            vec![s(&["go", "build", "./..."])],
            "Go",
        ));
        d.tasks.push(task(
            "go:test",
            "go test",
            TaskKind::Test,
            vec![s(&["go", "test", "./..."])],
            "Go",
        ));
        d.tasks.push(task(
            "install:go",
            "go mod download",
            TaskKind::Install,
            vec![s(&["go", "mod", "download"])],
            "Go",
        ));
        d.deps.get_or_insert(Deps::NotNeeded);
        tool(d, "go", "Go", "building and running", "brew install go");
    }
    if dir.join("Cargo.toml").is_file() {
        d.stacks.push("Rust".into());
        if dir.join("src/main.rs").exists()
            || read(&dir.join("Cargo.toml")).is_some_and(|t| t.contains("[[bin]]"))
        {
            d.tasks.push(task(
                "cargo:run",
                "cargo run",
                TaskKind::Start,
                vec![s(&["cargo", "run"])],
                "Cargo",
            ));
            d.primary.get_or_insert("cargo:run".into());
        }
        d.tasks.push(task(
            "cargo:build",
            "cargo build",
            TaskKind::Build,
            vec![s(&["cargo", "build"])],
            "Cargo",
        ));
        d.tasks.push(task(
            "cargo:test",
            "cargo test",
            TaskKind::Test,
            vec![s(&["cargo", "test"])],
            "Cargo",
        ));
        d.deps.get_or_insert(Deps::NotNeeded);
        tool(
            d,
            "cargo",
            "Rust (cargo)",
            "building and running",
            "curl https://sh.rustup.rs -sSf | sh",
        );
    }
    if let Some(pubspec) = read(&dir.join("pubspec.yaml")) {
        let flutter = pubspec.contains("flutter:");
        let bin = if flutter { "flutter" } else { "dart" };
        d.stacks
            .push(if flutter { "Flutter" } else { "Dart" }.into());
        d.tasks.push(task(
            "install:dart",
            &format!("{bin} pub get"),
            TaskKind::Install,
            vec![s(&[bin, "pub", "get"])],
            "pubspec.yaml",
        ));
        d.install.get_or_insert("install:dart".into());
        let run = if flutter {
            s(&["flutter", "run"])
        } else {
            s(&["dart", "run"])
        };
        d.tasks.push(task(
            "dart:run",
            &run.join(" "),
            TaskKind::Start,
            vec![run],
            "pubspec.yaml",
        ));
        d.primary.get_or_insert("dart:run".into());
        d.tasks.push(task(
            "dart:test",
            &format!("{bin} test"),
            TaskKind::Test,
            vec![s(&[bin, "test"])],
            "pubspec.yaml",
        ));
        d.deps.get_or_insert(if dir.join(".dart_tool").is_dir() {
            Deps::Installed
        } else {
            Deps::Missing
        });
        tool(
            d,
            bin,
            if flutter { "Flutter" } else { "Dart" },
            "building and running",
            if flutter {
                "brew install --cask flutter"
            } else {
                "brew install dart-sdk"
            },
        );
    }
    if dir.join("composer.json").is_file() {
        d.stacks.push("PHP".into());
        d.tasks.push(task(
            "install:php",
            "composer install",
            TaskKind::Install,
            vec![s(&["composer", "install"])],
            "composer.json",
        ));
        d.install.get_or_insert("install:php".into());
        if dir.join("artisan").is_file() {
            d.frameworks.push("Laravel".into());
            d.tasks.push(task(
                "laravel:serve",
                "artisan serve",
                TaskKind::Dev,
                vec![s(&["php", "artisan", "serve"])],
                "Laravel",
            ));
            d.tasks.push(task(
                "laravel:migrate",
                "artisan migrate",
                TaskKind::Other,
                vec![s(&["php", "artisan", "migrate"])],
                "Laravel",
            ));
            d.primary.get_or_insert("laravel:serve".into());
            d.expected_port.get_or_insert(8000);
        }
        d.deps.get_or_insert(if dir.join("vendor").is_dir() {
            Deps::Installed
        } else {
            Deps::Missing
        });
        tool(d, "php", "PHP", "running the project", "brew install php");
        tool(
            d,
            "composer",
            "Composer",
            "installing dependencies",
            "brew install composer",
        );
    }
    if dir.join("Gemfile").is_file() {
        d.stacks.push("Ruby".into());
        d.tasks.push(task(
            "install:ruby",
            "bundle install",
            TaskKind::Install,
            vec![s(&["bundle", "install"])],
            "Gemfile",
        ));
        d.install.get_or_insert("install:ruby".into());
        if dir.join("bin/rails").is_file() {
            d.frameworks.push("Rails".into());
            d.tasks.push(task(
                "rails:server",
                "rails server",
                TaskKind::Dev,
                vec![s(&["bin/rails", "server"])],
                "Rails",
            ));
            d.primary.get_or_insert("rails:server".into());
            d.expected_port.get_or_insert(3000);
        }
        d.deps.get_or_insert(Deps::NotNeeded);
        tool(
            d,
            "ruby",
            "Ruby",
            "running the project",
            "brew install ruby",
        );
        tool(
            d,
            "bundle",
            "Bundler",
            "installing gems",
            "gem install bundler",
        );
    }
    let dotnet = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .any(|e| {
            e.path()
                .extension()
                .is_some_and(|x| x == "csproj" || x == "sln" || x == "fsproj")
        });
    if dotnet {
        d.stacks.push(".NET".into());
        d.tasks.push(task(
            "install:dotnet",
            "dotnet restore",
            TaskKind::Install,
            vec![s(&["dotnet", "restore"])],
            ".NET",
        ));
        d.tasks.push(task(
            "dotnet:run",
            "dotnet run",
            TaskKind::Start,
            vec![s(&["dotnet", "run"])],
            ".NET",
        ));
        d.tasks.push(task(
            "dotnet:build",
            "dotnet build",
            TaskKind::Build,
            vec![s(&["dotnet", "build"])],
            ".NET",
        ));
        d.tasks.push(task(
            "dotnet:test",
            "dotnet test",
            TaskKind::Test,
            vec![s(&["dotnet", "test"])],
            ".NET",
        ));
        d.primary.get_or_insert("dotnet:run".into());
        d.deps.get_or_insert(Deps::NotNeeded);
        tool(
            d,
            "dotnet",
            ".NET SDK",
            "building and running",
            "brew install --cask dotnet-sdk",
        );
    }
    for f in ["deno.json", "deno.jsonc"] {
        let Some(text) = read(&dir.join(f)) else {
            continue;
        };
        d.stacks.push("Deno".into());
        // deno.jsonc may carry comments: read the tasks block loosely.
        let cleaned: String = text
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");
        if let Some(tasks) = serde_json::from_str::<Value>(&cleaned)
            .ok()
            .and_then(|v| v.get("tasks").cloned())
            .and_then(|t| t.as_object().cloned())
        {
            for name in tasks.keys() {
                d.tasks.push(task(
                    &format!("deno:{name}"),
                    name,
                    kind_of(name),
                    vec![s(&["deno", "task", name])],
                    f,
                ));
                if name == "dev" || name == "start" {
                    d.primary.get_or_insert(format!("deno:{name}"));
                }
            }
        }
        d.deps.get_or_insert(Deps::NotNeeded);
        tool(
            d,
            "deno",
            "Deno",
            "running the project",
            "brew install deno",
        );
        break;
    }
}

// --- Compose and Make ----------------------------------------------------------------

fn detect_compose_make(dir: &Path, d: &mut Detected) {
    if [
        "compose.yaml",
        "compose.yml",
        "docker-compose.yml",
        "docker-compose.yaml",
    ]
    .iter()
    .any(|f| dir.join(f).is_file())
    {
        d.stacks.push("Docker Compose".into());
        d.tasks.push(task(
            "compose:up",
            "docker compose up",
            TaskKind::Start,
            vec![s(&["docker", "compose", "up"])],
            "Compose",
        ));
        d.tasks.push(task(
            "compose:up-build",
            "docker compose up --build",
            TaskKind::Start,
            vec![s(&["docker", "compose", "up", "--build"])],
            "Compose",
        ));
        d.tasks.push(task(
            "compose:down",
            "docker compose down",
            TaskKind::Other,
            vec![s(&["docker", "compose", "down"])],
            "Compose",
        ));
        d.primary.get_or_insert("compose:up".into());
        tool(
            d,
            "docker",
            "Docker",
            "running the containers",
            "Install Docker Desktop or OrbStack",
        );
    }
    if let Some(text) = read(&dir.join("Makefile")).or_else(|| read(&dir.join("makefile"))) {
        let re = regex::Regex::new(r"(?m)^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?:[^=]|$)")
            .expect("static regex");
        let mut seen = BTreeSet::new();
        for c in re.captures_iter(&text) {
            let t = c[1].to_string();
            if t.starts_with('.') || !seen.insert(t.clone()) || seen.len() > 30 {
                continue;
            }
            let kind = kind_of(&t);
            d.tasks.push(task(
                &format!("make:{t}"),
                &format!("make {t}"),
                kind,
                vec![s(&["make", &t])],
                "Makefile",
            ));
            if matches!(kind, TaskKind::Dev | TaskKind::Start) {
                d.primary.get_or_insert(format!("make:{t}"));
            }
        }
        if !seen.is_empty() {
            d.stacks.push("Make".into());
        }
    }
}

/// Everything the project's own files say about running it. `.env` is only
/// read (for PORT) with the user's consent to read project env files.
pub fn detect(dir: &Path, read_env: bool) -> Detected {
    let mut d = Detected::default();
    detect_node(dir, &mut d);
    detect_python(dir, &mut d);
    detect_jvm(dir, &mut d);
    detect_others(dir, &mut d);
    detect_compose_make(dir, &mut d);
    if read_env {
        if let Some(p) = read(&dir.join(".env"))
            .and_then(|t| env_value(&t, "PORT"))
            .and_then(|v| v.parse().ok())
        {
            d.expected_port = Some(p);
        }
    }
    d
}

// --- .env ---------------------------------------------------------------------------

pub const ENV_TEMPLATES: &[&str] = &[
    ".env.example",
    ".env.sample",
    ".env.template",
    ".env.dist",
    ".env.local.example",
];

fn env_keys(text: &str) -> BTreeSet<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.starts_with('#'))
        .filter_map(|l| l.trim_start_matches("export ").split_once('='))
        .map(|(k, _)| k.trim().to_string())
        .filter(|k| !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .collect()
}

fn env_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|l| {
        let (k, v) = l.trim().trim_start_matches("export ").split_once('=')?;
        (k.trim() == key).then(|| v.trim().trim_matches(['"', '\'']).to_string())
    })
}

/// (has .env, template name, keys the template has and .env lacks). Without
/// consent only existence is checked: .env is never opened.
pub fn env_state(dir: &Path, read_env: bool) -> (bool, Option<String>, Vec<String>) {
    let has = dir.join(".env").is_file();
    let env = if read_env {
        read(&dir.join(".env"))
    } else {
        None
    };
    let template = ENV_TEMPLATES
        .iter()
        .find(|t| dir.join(t).is_file())
        .map(|t| t.to_string());
    let missing = match (&env, &template) {
        (Some(env), Some(t)) => {
            let have = env_keys(env);
            env_keys(&read(&dir.join(t)).unwrap_or_default())
                .into_iter()
                .filter(|k| !have.contains(k))
                .collect()
        }
        _ => vec![],
    };
    (has, template, missing)
}

// --- probes -------------------------------------------------------------------------

/// Version-manager homes: a tool missing from Stackroost's PATH may still be on
/// the user's shell PATH (nvm, fnm, asdf, volta, pyenv, sdkman).
fn version_manager(home: &Path) -> Option<&'static str> {
    [
        (".nvm", "nvm"),
        (".fnm", "fnm"),
        (".local/share/fnm", "fnm"),
        (".asdf", "asdf"),
        (".volta", "volta"),
        (".pyenv", "pyenv"),
        (".sdkman", "sdkman"),
    ]
    .into_iter()
    .find(|(d, _)| home.join(d).is_dir())
    .map(|(_, n)| n)
}

fn probe_version(name: &str) -> Option<String> {
    let args: &[&str] = match name {
        "java" => &["-version"],
        "go" => &["version"],
        _ => &["--version"],
    };
    let opts = crate::core::exec::ExecOpts::default()
        .with_timeout(Duration::from_secs(8))
        .no_check_exit();
    let out = crate::core::exec::run(name, args, opts).ok()?;
    // Apple's /usr/bin/java stub exits non-zero when no JDK is installed.
    if !out.status.success() {
        return None;
    }
    let text = if out.stdout_str.trim().is_empty() {
        &out.stderr_str
    } else {
        &out.stdout_str
    };
    let re = regex::Regex::new(r"\d+\.\d+(?:\.\d+)?").ok()?;
    re.find(text)
        .map(|m| m.as_str().to_string())
        .or_else(|| Some("installed".into()))
}

/// Who listens on TCP, and from which folder. One `lsof` for sockets, one for
/// the listeners' working directories.
pub fn listeners_with_cwd() -> Vec<(Listener, Option<PathBuf>)> {
    let opts = || {
        crate::core::exec::ExecOpts::default()
            .with_timeout(Duration::from_secs(5))
            .no_check_exit()
    };
    let Ok(out) =
        crate::core::exec::run("lsof", &["-nP", "-iTCP", "-sTCP:LISTEN", "-FpcLtn"], opts())
    else {
        return vec![];
    };
    let mut rows = crate::core::util::lsof::parse_lsof_fields(&out.stdout_str);
    rows.sort_by_key(|r| (r.pid, r.port));
    rows.dedup_by_key(|r| (r.pid, r.port));
    let pids: BTreeSet<u32> = rows.iter().map(|r| r.pid).collect();
    let mut cwd = std::collections::HashMap::new();
    if !pids.is_empty() {
        let list = pids
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(",");
        if let Ok(o) =
            crate::core::exec::run("lsof", &["-a", "-d", "cwd", "-p", &list, "-Fpn"], opts())
        {
            let mut pid = 0u32;
            for line in o.stdout_str.lines() {
                match line.split_at_checked(1) {
                    Some(("p", v)) => pid = v.parse().unwrap_or(0),
                    Some(("n", v)) => {
                        cwd.insert(pid, PathBuf::from(v));
                    }
                    _ => {}
                }
            }
        }
    }
    rows.into_iter()
        .map(|r| {
            let c = cwd.get(&r.pid).cloned();
            (
                Listener {
                    pid: r.pid,
                    command: r.command,
                    port: r.port,
                },
                c,
            )
        })
        .collect()
}

/// Major version number at the start of a spec: `v18.2` → 18, `>=20 <23` → 20.
fn first_major(spec: &str) -> Option<u32> {
    let re = regex::Regex::new(r"(\d+)").ok()?;
    re.captures(spec)?.get(1)?.as_str().parse().ok()
}

/// Does installed Node `have` satisfy `want` (an .nvmrc or `engines.node`)?
/// Exact majors for `18`/`^18`/`~18`/`v18.2.0`; a floor for `>=18`.
pub fn node_satisfies(want: &str, have: &str) -> bool {
    let (Some(w), Some(h)) = (first_major(want), first_major(have)) else {
        return true; // `lts/*`, `node`: anything goes
    };
    if want.contains(">=") || want.contains('>') || want.contains("||") || want.contains('x') {
        h >= w
    } else {
        h == w
    }
}

pub fn checks_for(
    p: &ProjectProfile,
    node_wanted: &Option<(String, String)>,
    manager: Option<&str>,
) -> Vec<Check> {
    let mut out = Vec::new();
    for t in &p.tools {
        if !t.found {
            let (level, detail) = match manager {
                Some(m) => (
                    Level::Warn,
                    format!("Not on Stackroost's PATH. You use {m}, so the project's terminal may still find it — if Run fails, install it: {}", t.install),
                ),
                None => (Level::Error, format!("Needed for {}.", t.needed_for)),
            };
            out.push(Check {
                id: format!("tool:{}", t.name),
                level,
                title: format!("{} isn't installed", t.label),
                detail: Some(detail),
                fix: Some(Fix::Command {
                    text: t.install.clone(),
                }),
            });
        }
    }
    if let (Some((want, from)), Some(node)) = (
        node_wanted,
        p.tools.iter().find(|t| t.name == "node" && t.found),
    ) {
        let have = node.version.clone().unwrap_or_default();
        if !node_satisfies(want, &have) {
            out.push(Check {
                id: "node:version".into(),
                level: Level::Warn,
                title: format!("Project wants Node {want}, you have {have}"),
                detail: Some(format!("From {from}. Switch with nvm/fnm (`nvm use`), or try anyway — it often still works.")),
                fix: None,
            });
        }
    }
    match (p.deps, &p.install) {
        (Deps::Missing, Some(i)) => out.push(Check {
            id: "deps".into(),
            level: Level::Warn,
            title: "Dependencies aren't installed".into(),
            detail: Some("Run installs them first.".into()),
            fix: Some(Fix::RunTask { task_id: i.clone() }),
        }),
        (Deps::Stale, Some(i)) => out.push(Check {
            id: "deps".into(),
            level: Level::Warn,
            title: "Dependencies are out of date".into(),
            detail: Some("The lockfile changed after the last install. Run installs first.".into()),
            fix: Some(Fix::RunTask { task_id: i.clone() }),
        }),
        (Deps::Installed, _) => out.push(Check {
            id: "deps".into(),
            level: Level::Ok,
            title: "Dependencies installed".into(),
            detail: None,
            fix: None,
        }),
        _ => {}
    }
    match (&p.has_env, &p.env_template) {
        (false, Some(t)) => out.push(Check {
            id: "env".into(),
            level: Level::Warn,
            title: format!("No .env — {t} lists the settings it needs"),
            detail: Some("Create .env from the template, then fill in the values.".into()),
            fix: Some(Fix::CreateEnv { from: t.clone() }),
        }),
        (true, Some(t)) if !p.env_missing_keys.is_empty() => out.push(Check {
            id: "env".into(),
            level: Level::Warn,
            title: format!(
                "{} setting{} from {t} missing in .env",
                p.env_missing_keys.len(),
                if p.env_missing_keys.len() == 1 {
                    ""
                } else {
                    "s"
                }
            ),
            detail: Some(
                p.env_missing_keys
                    .iter()
                    .take(12)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", "),
            ),
            fix: None,
        }),
        (true, _) => out.push(Check {
            id: "env".into(),
            level: Level::Ok,
            title: ".env present".into(),
            detail: None,
            fix: None,
        }),
        _ => {}
    }
    if p.primary.is_none() {
        out.push(Check {
            id: "primary".into(),
            level: if p.tasks.is_empty() { Level::Error } else { Level::Warn },
            title: if p.tasks.is_empty() { "No way to run this project was found".into() } else { "No dev/start task — pick one below".into() },
            detail: Some("Stackroost reads package.json scripts, Makefile targets, framework files and build tools.".into()),
            fix: None,
        });
    }
    out
}

/// Detect, then probe tools and listeners. Tool probes run in parallel.
pub fn profile(dir: &Path, home: &Path, read_env: bool) -> ProjectProfile {
    let d = detect(dir, read_env);
    let tools: Vec<Tool> = std::thread::scope(|sc| {
        let hs: Vec<_> = d
            .tools
            .iter()
            .map(|(name, label, needed_for, install)| {
                sc.spawn(move || {
                    let version = probe_version(name);
                    Tool {
                        name: name.clone(),
                        label: label.clone(),
                        needed_for: needed_for.clone(),
                        install: install.clone(),
                        found: version.is_some(),
                        version,
                    }
                })
            })
            .collect();
        hs.into_iter().filter_map(|h| h.join().ok()).collect()
    });
    let listeners = listeners_with_cwd();
    let real = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
    let running: Vec<Listener> = listeners
        .iter()
        .filter(|(_, c)| {
            c.as_ref()
                .is_some_and(|c| c.starts_with(&real) || c.starts_with(dir))
        })
        .map(|(l, _)| l.clone())
        .collect();
    let (has_env, env_template, env_missing_keys) = env_state(dir, read_env);
    let mut p = ProjectProfile {
        path: dir.to_string_lossy().into_owned(),
        name: dir
            .file_name()
            .map_or_else(|| "project".into(), |n| n.to_string_lossy().into_owned()),
        stacks: d.stacks.clone(),
        frameworks: d.frameworks.clone(),
        package_manager: d.package_manager.clone(),
        tasks: d.tasks.clone(),
        primary: d.primary.clone(),
        install: d.install.clone(),
        deps: d.deps.unwrap_or(Deps::NotNeeded),
        has_env,
        env_read: read_env,
        env_template,
        env_missing_keys,
        expected_port: d.expected_port,
        tools,
        running,
        checks: vec![],
    };
    p.checks = checks_for(&p, &d.node_wanted, version_manager(home));
    if let Some(port) = p.expected_port {
        if !p.running.iter().any(|r| r.port == port) {
            if let Some((l, _)) = listeners.iter().find(|(l, _)| l.port == port) {
                p.checks.push(Check {
                    id: "port".into(),
                    level: Level::Warn,
                    title: format!("Port {port} is taken by {} (pid {})", l.command, l.pid),
                    detail: Some(
                        "Stop it in Ports, or the app will pick another port — or fail to start."
                            .into(),
                    ),
                    fix: None,
                });
            }
        }
    }
    if !p.running.is_empty() {
        let ports: Vec<String> = p.running.iter().map(|r| format!(":{}", r.port)).collect();
        p.checks.insert(
            0,
            Check {
                id: "running".into(),
                level: Level::Ok,
                title: format!("Running on {}", ports.join(", ")),
                detail: None,
                fix: None,
            },
        );
    }
    p
}

/// The steps to run task `id` in `dir`, with the install task first when asked
/// and dependencies aren't installed. Re-detected from the files, so the
/// frontend can only name a task the project really has.
pub fn resolve_steps(dir: &Path, id: &str, install_first: bool) -> Option<Vec<Vec<String>>> {
    let d = detect(dir, false);
    let t = d.tasks.iter().find(|t| t.id == id)?;
    let mut steps = Vec::new();
    if install_first && matches!(d.deps, Some(Deps::Missing | Deps::Stale)) {
        if let Some(i) = d
            .install
            .as_ref()
            .and_then(|i| d.tasks.iter().find(|t| &t.id == i))
        {
            if i.id != t.id {
                steps.extend(i.steps.clone());
            }
        }
    }
    steps.extend(t.steps.clone());
    Some(steps)
}

/// Is `p` a folder the runner may work in: absolute, inside home, a real dir?
pub fn check_project_dir(p: &str, home: &Path) -> Result<PathBuf, String> {
    if p.chars().any(char::is_control) || !p.starts_with('/') || p.split('/').any(|c| c == "..") {
        return Err(format!("not a project folder: {p}"));
    }
    let path = PathBuf::from(p);
    let real = path
        .canonicalize()
        .map_err(|_| format!("{p} doesn't exist"))?;
    let real_home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
    if !real.starts_with(&real_home) || real == real_home {
        return Err("projects must be inside your home folder".into());
    }
    if !real.is_dir() {
        return Err(format!("{p} isn't a folder"));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn proj(name: &str, files: &[(&str, &str)]) -> PathBuf {
        let d = std::env::temp_dir().join(format!("sr-runner-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        for (f, body) in files {
            let p = d.join(f);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, body).unwrap();
        }
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn ids(d: &Detected) -> Vec<&str> {
        d.tasks.iter().map(|t| t.id.as_str()).collect()
    }

    #[test]
    fn next_app_with_pnpm() {
        let p = proj(
            "next",
            &[
                (
                    "package.json",
                    r#"{"scripts":{"dev":"next dev -p 4000","build":"next build","lint":"next lint","test:e2e":"playwright test"},"dependencies":{"next":"15","react":"19"},"engines":{"node":">=20"}}"#,
                ),
                ("pnpm-lock.yaml", "lockfileVersion: 9"),
            ],
        );
        let d = detect(&p, false);
        assert_eq!(d.stacks, ["Node"]);
        assert_eq!(d.frameworks, ["Next.js", "React"]);
        assert_eq!(d.package_manager.as_deref(), Some("pnpm"));
        assert_eq!(d.primary.as_deref(), Some("script:dev"));
        assert_eq!(d.expected_port, Some(4000));
        assert_eq!(d.deps, Some(Deps::Missing));
        let dev = d.tasks.iter().find(|t| t.id == "script:dev").unwrap();
        assert_eq!(dev.steps, [s(&["pnpm", "run", "dev"])]);
        assert!(dev.long_running);
        assert_eq!(
            d.tasks
                .iter()
                .find(|t| t.id == "script:test:e2e")
                .unwrap()
                .kind,
            TaskKind::Test
        );
        assert_eq!(
            d.node_wanted,
            Some((">=20".into(), "package.json engines".into()))
        );
        // Install first only when dependencies are missing.
        assert_eq!(
            resolve_steps(&p, "script:dev", true).unwrap(),
            [s(&["pnpm", "install"]), s(&["pnpm", "run", "dev"])]
        );
        assert_eq!(
            resolve_steps(&p, "script:dev", false).unwrap(),
            [s(&["pnpm", "run", "dev"])]
        );
        fs::create_dir_all(p.join("node_modules")).unwrap();
        assert_eq!(
            resolve_steps(&p, "script:dev", true).unwrap(),
            [s(&["pnpm", "run", "dev"])]
        );
        // A task the project doesn't have can't be run.
        assert!(resolve_steps(&p, "script:rm -rf", true).is_none());
        let _ = fs::remove_dir_all(&p);
    }

    #[test]
    fn python_frameworks_and_venv_install() {
        let p = proj(
            "fastapi",
            &[
                ("requirements.txt", "fastapi\nuvicorn\npytest\n"),
                (
                    "app/main.py",
                    "from fastapi import FastAPI\napi = FastAPI()\n",
                ),
            ],
        );
        let d = detect(&p, false);
        assert_eq!(d.frameworks, ["FastAPI"]);
        assert_eq!(d.deps, Some(Deps::Missing));
        let install = d.tasks.iter().find(|t| t.id == "install:python").unwrap();
        assert_eq!(
            install.steps,
            [
                s(&["python3", "-m", "venv", ".venv"]),
                s(&[".venv/bin/pip", "install", "-r", "requirements.txt"])
            ]
        );
        let run = d.tasks.iter().find(|t| t.id == "fastapi:run").unwrap();
        assert_eq!(
            run.steps,
            [s(&["python3", "-m", "uvicorn", "app.main:api", "--reload"])]
        );
        assert!(ids(&d).contains(&"python:test"));
        assert_eq!(d.expected_port, Some(8000));

        let dj = proj(
            "django",
            &[
                ("manage.py", "#!"),
                ("pyproject.toml", "[tool.poetry]\nname='x'\n"),
            ],
        );
        let d = detect(&dj, false);
        assert_eq!(d.primary.as_deref(), Some("django:run"));
        assert_eq!(
            d.tasks.iter().find(|t| t.id == "django:run").unwrap().steps,
            [s(&["poetry", "run", "python", "manage.py", "runserver"])]
        );
        assert!(d.tools.iter().any(|t| t.0 == "poetry"));
        let _ = fs::remove_dir_all(&p);
        let _ = fs::remove_dir_all(&dj);
    }

    #[test]
    fn jvm_go_compose_and_make() {
        let spring = proj(
            "spring",
            &[
                (
                    "pom.xml",
                    "<artifactId>spring-boot-starter-web</artifactId>",
                ),
                ("mvnw", "#!/bin/sh"),
            ],
        );
        let d = detect(&spring, false);
        assert_eq!(d.frameworks, ["Spring Boot"]);
        assert_eq!(
            d.tasks.iter().find(|t| t.id == "mvn:run").unwrap().steps,
            [s(&["./mvnw", "spring-boot:run"])]
        );
        assert!(
            !d.tools.iter().any(|t| t.0 == "mvn"),
            "the wrapper replaces mvn"
        );

        let android = proj(
            "android",
            &[
                ("settings.gradle.kts", ""),
                (
                    "app/build.gradle.kts",
                    "plugins { id(\"com.android.application\") }",
                ),
            ],
        );
        let d = detect(&android, false);
        assert_eq!(d.stacks, ["Android"]);
        assert_eq!(d.primary.as_deref(), Some("gradle:installDebug"));

        let go = proj(
            "go",
            &[
                ("go.mod", "module x"),
                ("cmd/api/main.go", "package main\nfunc main(){}"),
                (
                    "Makefile",
                    ".PHONY: run\nrun:\n\tgo run ./cmd/api\nbuild: deps\n\tgo build\nVAR := x\n",
                ),
                ("compose.yaml", "services: {}"),
            ],
        );
        let d = detect(&go, false);
        assert_eq!(d.stacks, ["Go", "Docker Compose", "Make"]);
        assert_eq!(d.primary.as_deref(), Some("go:run:api"));
        assert!(
            ids(&d).contains(&"make:run")
                && ids(&d).contains(&"make:build")
                && !ids(&d).iter().any(|i| i.contains("VAR"))
        );
        assert!(ids(&d).contains(&"compose:up"));
        for p in [spring, android, go] {
            let _ = fs::remove_dir_all(&p);
        }
    }

    #[test]
    fn env_template_and_missing_keys() {
        let p = proj(
            "env",
            &[
                (
                    ".env.example",
                    "# comment\nDATABASE_URL=\nexport API_KEY=x\nPORT=4000\n",
                ),
                (".env", "DATABASE_URL=postgres://\nPORT=4100\n"),
            ],
        );
        let (has, t, missing) = env_state(&p, true);
        assert!(has);
        assert_eq!(t.as_deref(), Some(".env.example"));
        assert_eq!(missing, ["API_KEY"]);
        // Without consent .env is never opened: existence only.
        assert_eq!(
            env_state(&p, false),
            (true, Some(".env.example".into()), vec![])
        );
        // PORT in .env wins over a framework default — with consent.
        fs::write(
            p.join("package.json"),
            r#"{"dependencies":{"next":"15"},"scripts":{"dev":"next dev"}}"#,
        )
        .unwrap();
        assert_eq!(detect(&p, true).expected_port, Some(4100));
        assert_eq!(detect(&p, false).expected_port, Some(3000));
        let _ = fs::remove_dir_all(&p);
    }

    /// The wire format `src/features/projects/api/runner.contracts.test.ts`
    /// parses. Regenerate with `UPDATE_GOLDEN=1 cargo test golden`.
    #[test]
    fn profile_contract_golden() {
        let p = ProjectProfile {
            path: "/Users/me/Desktop/web".into(),
            name: "web".into(),
            stacks: s(&["Node", "Docker Compose"]),
            frameworks: s(&["Next.js", "React"]),
            package_manager: Some("pnpm".into()),
            tasks: vec![
                task(
                    "install:node",
                    "pnpm install",
                    TaskKind::Install,
                    vec![s(&["pnpm", "install"])],
                    "package.json",
                ),
                task(
                    "script:dev",
                    "dev",
                    TaskKind::Dev,
                    vec![s(&["pnpm", "run", "dev"])],
                    "package.json",
                ),
            ],
            primary: Some("script:dev".into()),
            install: Some("install:node".into()),
            deps: Deps::Stale,
            has_env: true,
            env_read: true,
            env_template: Some(".env.example".into()),
            env_missing_keys: s(&["API_KEY"]),
            expected_port: Some(3000),
            tools: vec![Tool {
                name: "node".into(),
                label: "Node.js".into(),
                needed_for: "running the project".into(),
                install: "brew install node".into(),
                found: true,
                version: Some("22.12.0".into()),
            }],
            running: vec![Listener {
                pid: 4242,
                command: "node".into(),
                port: 3000,
            }],
            checks: vec![
                Check {
                    id: "deps".into(),
                    level: Level::Warn,
                    title: "Dependencies are out of date".into(),
                    detail: None,
                    fix: Some(Fix::RunTask {
                        task_id: "install:node".into(),
                    }),
                },
                Check {
                    id: "env".into(),
                    level: Level::Warn,
                    title: "No .env".into(),
                    detail: None,
                    fix: Some(Fix::CreateEnv {
                        from: ".env.example".into(),
                    }),
                },
                Check {
                    id: "tool:pnpm".into(),
                    level: Level::Error,
                    title: "pnpm isn't installed".into(),
                    detail: Some("x".into()),
                    fix: Some(Fix::Command {
                        text: "corepack enable pnpm".into(),
                    }),
                },
                Check {
                    id: "running".into(),
                    level: Level::Ok,
                    title: "Running on :3000".into(),
                    detail: None,
                    fix: None,
                },
            ],
        };
        let json = serde_json::to_string_pretty(&p).unwrap() + "\n";
        let path = format!(
            "{}/../fixtures/projects/profile-contract.json",
            env!("CARGO_MANIFEST_DIR")
        );
        if std::env::var_os("UPDATE_GOLDEN").is_some() {
            std::fs::write(&path, &json).unwrap();
        }
        assert_eq!(
            json,
            std::fs::read_to_string(&path).unwrap_or_default(),
            "profile JSON changed; rerun with UPDATE_GOLDEN=1"
        );
    }

    #[test]
    fn node_versions() {
        assert!(node_satisfies("18", "18.20.1"));
        assert!(!node_satisfies("v18.2.0", "20.1.0"));
        assert!(node_satisfies(">=20", "26.12.1"));
        assert!(!node_satisfies(">=22.12", "20.0.0"));
        assert!(node_satisfies("^20.0.0 || ^22.0.0", "22.3.0"));
        assert!(node_satisfies("lts/*", "26.0.0"));
    }

    #[test]
    fn project_dirs_stay_in_home() {
        let home = std::env::temp_dir().join(format!("sr-runner-home-{}", std::process::id()));
        fs::create_dir_all(home.join("app")).unwrap();
        assert!(check_project_dir(&home.join("app").to_string_lossy(), &home).is_ok());
        assert!(check_project_dir("/etc", &home).is_err());
        assert!(check_project_dir(&home.to_string_lossy(), &home).is_err());
        assert!(check_project_dir(&format!("{}/app/../app", home.display()), &home).is_err());
        assert!(check_project_dir("relative/app", &home).is_err());
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn ports_in_commands() {
        assert_eq!(port_in("next dev -p 4000"), Some(4000));
        assert_eq!(port_in("vite --port=5174"), Some(5174));
        assert_eq!(port_in("PORT=8080 node server.js"), Some(8080));
        assert_eq!(port_in("next dev"), None);
    }
}
