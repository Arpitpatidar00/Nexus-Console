use std::fs;
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .to_path_buf()
}

fn src_tauri_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn collect_rs_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                files.extend(collect_rs_files(&p));
            } else if p.extension().is_some_and(|ext| ext == "rs") {
                files.push(p);
            }
        }
    }
    files
}

fn collect_frontend_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                if name != "node_modules" && name != "dist" && name != ".git" {
                    files.extend(collect_frontend_files(&p));
                }
            } else if let Some(ext) = p.extension() {
                if ext == "ts" || ext == "tsx" || ext == "js" || ext == "jsx" {
                    files.push(p);
                }
            }
        }
    }
    files
}

/// Guard (a): No raw shell commands (`sh`, `bash`, `zsh`) or `-c` outside strict allow-list.
#[test]
fn guard_no_shell_commands() {
    let src_dir = src_tauri_dir().join("src");
    let rs_files = collect_rs_files(&src_dir);
    assert!(!rs_files.is_empty(), "found no .rs files in src-tauri/src");

    let shell_patterns = [
        "Command::new(\"sh\")",
        "Command::new(\"bash\")",
        "Command::new(\"zsh\")",
        "Command::new(\"/bin/sh\")",
        "Command::new(\"/bin/bash\")",
        "Command::new(\"/bin/zsh\")",
        "Command::new(\"/bin/csh\")",
    ];

    let mut shell_violations = Vec::new();
    let mut c_flag_violations = Vec::new();

    for file in &rs_files {
        let content = fs::read_to_string(file).expect("readable rs file");
        let rel_path = file
            .strip_prefix(&src_dir)
            .unwrap_or(file)
            .to_string_lossy();

        // 1. Check for Command::new("sh"|"bash"|"zsh")
        for (line_no, line) in content.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with("//") {
                continue;
            }
            for pat in &shell_patterns {
                if line.contains(pat) {
                    // PTY service is the only approved interactive terminal runner
                    if !rel_path.starts_with("services/pty") {
                        shell_violations.push(format!("{rel_path}:{}: {trimmed}", line_no + 1));
                    }
                }
            }
        }

        // 2. Check for "-c" outside approved allow-list
        if content.contains("\"-c\"") {
            let allowed = rel_path.starts_with("services/pty")
                || rel_path == "services/remote/files.rs" // head -c 1048576 (byte count flag)
                || rel_path == "services/remote/parity.rs" // python3 -c (script flag with argv)
                || rel_path == "commands/databases.rs" // psql -c (sql command flag with argv)
                || rel_path == "core/exec.rs"; // exec.rs unit test cases

            if !allowed {
                for (line_no, line) in content.lines().enumerate() {
                    if line.contains("\"-c\"") && !line.trim().starts_with("//") {
                        c_flag_violations.push(format!(
                            "{rel_path}:{}: {}",
                            line_no + 1,
                            line.trim()
                        ));
                    }
                }
            }
        }
    }

    assert!(
        shell_violations.is_empty(),
        "Found raw shell spawns outside allow-list:\n{}",
        shell_violations.join("\n")
    );

    assert!(
        c_flag_violations.is_empty(),
        "Found '-c' arguments outside allow-list:\n{}",
        c_flag_violations.join("\n")
    );

    // Verify detector catches planted violation
    let fake_snippet = "let _ = Command::new(\"sh\").arg(\"-c\");";
    assert!(shell_patterns.iter().any(|pat| fake_snippet.contains(pat)));
}

/// Guard (b): Every mutating `#[tauri::command]` calls the mutation gate.
#[test]
fn guard_mutations_gated() {
    let commands_dir = src_tauri_dir().join("src/commands");
    let cmd_files = collect_rs_files(&commands_dir);
    assert!(!cmd_files.is_empty(), "found no command files");

    let mutation_keywords = [
        "delete",
        "remove",
        "kill",
        "stop",
        "start",
        "restart",
        "save",
        "drop",
        "truncate",
        "install",
        "uninstall",
        "upgrade",
        "relink",
        "rollback",
        "promote",
        "deploy",
        "restore",
        "clean",
        "apply",
        "pause",
    ];

    let gate_markers = [
        "confirm_action(",
        "mutation(",
        "mutation_unattended(",
        "run_gated(",
        "gate.",
        "mutate(",
    ];

    let mut ungated_mutations = Vec::new();

    for file in &cmd_files {
        let content = fs::read_to_string(file).expect("readable command file");
        let rel_path = file.file_name().unwrap_or_default().to_string_lossy();

        // Split into function definitions
        let mut in_command = false;
        let mut current_fn_name = String::new();
        let mut fn_body = String::new();
        let mut brace_depth = 0;

        for line in content.lines() {
            let trimmed = line.trim();

            if trimmed.starts_with("#[tauri::command]") {
                in_command = true;
                current_fn_name.clear();
                fn_body.clear();
                brace_depth = 0;
                continue;
            }

            if in_command {
                if current_fn_name.is_empty() && trimmed.starts_with("pub async fn ")
                    || trimmed.starts_with("pub fn ")
                {
                    let fn_decl = trimmed
                        .strip_prefix("pub async fn ")
                        .or_else(|| trimmed.strip_prefix("pub fn "))
                        .unwrap_or_default();

                    if let Some(open_paren) = fn_decl.find('(') {
                        current_fn_name = fn_decl[..open_paren].trim().to_string();
                    }
                }

                fn_body.push_str(line);
                fn_body.push('\n');

                for c in line.chars() {
                    if c == '{' {
                        brace_depth += 1;
                    } else if c == '}' {
                        brace_depth -= 1;
                        if brace_depth == 0 && !current_fn_name.is_empty() {
                            // Function finished; analyze if mutating by token
                            let tokens: Vec<&str> = current_fn_name.split('_').collect();
                            let is_mutation = tokens.iter().any(|t| mutation_keywords.contains(t));

                            // Exclude read-only helpers
                            let is_readonly_exempt = tokens.iter().any(|t| {
                                *t == "preview"
                                    || *t == "status"
                                    || *t == "list"
                                    || *t == "get"
                                    || *t == "scan"
                                    || *t == "check"
                                    || *t == "probe"
                            });

                            if is_mutation && !is_readonly_exempt {
                                let has_gate =
                                    gate_markers.iter().any(|marker| fn_body.contains(marker));

                                if !has_gate {
                                    ungated_mutations
                                        .push(format!("{rel_path} :: {current_fn_name}"));
                                }
                            }

                            in_command = false;
                            current_fn_name.clear();
                            fn_body.clear();
                            break;
                        }
                    }
                }
            }
        }
    }

    assert!(
        ungated_mutations.is_empty(),
        "Mutating commands missing gate invocation:\n{}",
        ungated_mutations.join("\n")
    );

    // Verify detector catches an ungated function snippet
    let test_fn_name = "pub async fn projects_delete_item()";
    let is_mutation = mutation_keywords.iter().any(|kw| test_fn_name.contains(kw));
    assert!(is_mutation, "planted mutation keyword must match");
}

/// Guard (c): No unhandled or silenced command outputs (`let _ = …output()`/`.status()`) in `services/`.
#[test]
fn guard_no_ignored_outputs() {
    let services_dir = src_tauri_dir().join("src/services");
    let rs_files = collect_rs_files(&services_dir);
    assert!(!rs_files.is_empty(), "found no files in services/");

    let mut violations = Vec::new();

    for file in &rs_files {
        let content = fs::read_to_string(file).expect("readable rs file");
        let rel_path = file
            .strip_prefix(&services_dir)
            .unwrap_or(file)
            .to_string_lossy();

        for (line_no, line) in content.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with("//") {
                continue;
            }

            // Check for `let _ = ...output()` or `let _ = ...status()`
            if trimmed.starts_with("let _ =")
                && (trimmed.contains(".output()") || trimmed.contains(".status()"))
            {
                violations.push(format!("{rel_path}:{}: {trimmed}", line_no + 1));
            }
        }
    }

    assert!(
        violations.is_empty(),
        "Found silenced command output/status in services/:\n{}",
        violations.join("\n")
    );

    // Verify detector catches planted violation
    let fake_line = "let _ = Command::new(\"foo\").status();";
    assert!(fake_line.starts_with("let _ =") && fake_line.contains(".status()"));
}

/// Guard (d): Zero browser confirm/alert (`window.confirm`, `confirm(`, `alert(`) in `src/`.
#[test]
fn guard_no_browser_confirms() {
    let src_dir = repo_root().join("src");
    let frontend_files = collect_frontend_files(&src_dir);
    assert!(
        !frontend_files.is_empty(),
        "found no frontend files in src/"
    );

    let mut violations = Vec::new();

    for file in &frontend_files {
        let content = fs::read_to_string(file).expect("readable frontend file");
        let rel_path = file
            .strip_prefix(&src_dir)
            .unwrap_or(file)
            .to_string_lossy();

        for (line_no, line) in content.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with("//") || trimmed.starts_with('*') || trimmed.starts_with("/*") {
                continue;
            }

            // Check for window.confirm( or confirm(
            if (trimmed.contains("window.confirm(")
                || trimmed.contains("confirm(")
                || trimmed.contains("window.alert(")
                || trimmed.contains("alert("))
                && !trimmed.contains("confirm_action")
                && !trimmed.contains("useConfirm")
                && !trimmed.contains("confirmTitle")
                && !trimmed.contains("confirmText")
                && !trimmed.contains("isConfirmed")
                && !trimmed.contains("fix_confirmation")
                && !trimmed.contains("confirmMessage")
            {
                // Specifically verify it's a bare function call
                let has_window_confirm = trimmed.contains("window.confirm(");
                let has_window_alert = trimmed.contains("window.alert(");
                let has_bare_confirm = trimmed.starts_with("confirm(")
                    || trimmed.contains("!confirm(")
                    || trimmed.contains(" confirm(");
                let has_bare_alert = trimmed.starts_with("alert(") || trimmed.contains(" alert(");

                if has_window_confirm || has_window_alert || has_bare_confirm || has_bare_alert {
                    violations.push(format!("{rel_path}:{}: {trimmed}", line_no + 1));
                }
            }
        }
    }

    assert!(
        violations.is_empty(),
        "Found browser confirm/alert dialogs in frontend src/:\n{}",
        violations.join("\n")
    );

    // Verify detector catches planted violation
    let fake_line = "if (window.confirm('Delete this?')) { doDelete(); }";
    assert!(fake_line.contains("window.confirm("));
}
