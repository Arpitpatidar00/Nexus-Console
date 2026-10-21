use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IosSimulator {
    pub udid: String,
    pub name: String,
    pub state: String,
    pub runtime: String,
    pub is_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AndroidAvd {
    pub name: String,
    pub running: bool,
}

pub fn parse_simctl_json(text: &str) -> Vec<IosSimulator> {
    let val: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let mut result = Vec::new();
    if let Some(devices_map) = val.get("devices").and_then(|d| d.as_object()) {
        for (runtime_key, dev_list) in devices_map {
            let runtime_name = runtime_key
                .strip_prefix("com.apple.CoreSimulator.SimRuntime.")
                .unwrap_or(runtime_key)
                .replace('-', " ");

            if let Some(arr) = dev_list.as_array() {
                for dev in arr {
                    let udid = dev
                        .get("udid")
                        .and_then(|u| u.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let name = dev
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let state = dev
                        .get("state")
                        .and_then(|s| s.as_str())
                        .unwrap_or("Shutdown")
                        .to_string();
                    let is_avail = dev
                        .get("isAvailable")
                        .and_then(|a| a.as_bool())
                        .unwrap_or(true);

                    if !udid.is_empty() && !name.is_empty() {
                        result.push(IosSimulator {
                            udid,
                            name,
                            state,
                            runtime: runtime_name.clone(),
                            is_available: is_avail,
                        });
                    }
                }
            }
        }
    }

    result
}

pub fn list_ios_simulators() -> AppResult<Vec<IosSimulator>> {
    let out = Command::new("xcrun")
        .args(["simctl", "list", "devices", "--json"])
        .output();

    let output = match out {
        Ok(o) if o.status.success() => o,
        _ => return Ok(vec![]),
    };

    let text = String::from_utf8_lossy(&output.stdout);
    Ok(parse_simctl_json(&text))
}

pub fn control_ios_simulator(udid: &str, action: &str) -> AppResult<String> {
    match action {
        "boot" => {
            let out = Command::new("xcrun")
                .args(["simctl", "boot", udid])
                .output()
                .map_err(|e| AppError::Io(format!("xcrun boot failed: {e}")))?;
            if out.status.success() {
                Ok("Booted successfully".into())
            } else {
                Err(AppError::Io(
                    String::from_utf8_lossy(&out.stderr).to_string(),
                ))
            }
        }
        "shutdown" => {
            let out = Command::new("xcrun")
                .args(["simctl", "shutdown", udid])
                .output()
                .map_err(|e| AppError::Io(format!("xcrun shutdown failed: {e}")))?;
            if out.status.success() {
                Ok("Shutdown successfully".into())
            } else {
                Err(AppError::Io(
                    String::from_utf8_lossy(&out.stderr).to_string(),
                ))
            }
        }
        "open" => {
            let _ = Command::new("open").args(["-a", "Simulator"]).spawn();
            Ok("Simulator opened".into())
        }
        "erase" => {
            let out = Command::new("xcrun")
                .args(["simctl", "erase", udid])
                .output()
                .map_err(|e| AppError::Io(format!("xcrun erase failed: {e}")))?;
            if out.status.success() {
                Ok("Erased successfully".into())
            } else {
                Err(AppError::Io(
                    String::from_utf8_lossy(&out.stderr).to_string(),
                ))
            }
        }
        _ => Err(AppError::Io(format!("Unknown action: {action}"))),
    }
}

pub fn parse_emulator_avds(text: &str) -> Vec<AndroidAvd> {
    let mut avds = Vec::new();
    for line in text.lines() {
        let name = line.trim();
        if !name.is_empty() {
            avds.push(AndroidAvd {
                name: name.to_string(),
                running: false,
            });
        }
    }
    avds
}

pub fn list_android_avds() -> AppResult<Vec<AndroidAvd>> {
    let out = Command::new("emulator").arg("-list-avds").output();

    let mut avds = match out {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            parse_emulator_avds(&text)
        }
        _ => Vec::new(),
    };

    if let Ok(adb_out) = Command::new("adb").arg("devices").output() {
        if adb_out.status.success() {
            let adb_text = String::from_utf8_lossy(&adb_out.stdout);
            let has_emulator = adb_text.contains("emulator-");
            if has_emulator && !avds.is_empty() {
                avds[0].running = true;
            }
        }
    }

    Ok(avds)
}

pub fn launch_android_avd(name: &str) -> AppResult<String> {
    Command::new("emulator")
        .args(["-avd", name])
        .spawn()
        .map_err(|e| AppError::Io(format!("Failed to spawn emulator: {e}")))?;
    Ok(format!("Emulator {name} launched"))
}

pub fn get_logcat(serial: Option<&str>, max_lines: usize) -> AppResult<Vec<String>> {
    let mut cmd = Command::new("adb");
    if let Some(s) = serial {
        cmd.args(["-s", s]);
    }
    let lines_str = max_lines.to_string();
    cmd.args(["logcat", "-d", "-t", &lines_str]);
    let out = cmd
        .output()
        .map_err(|e| AppError::Io(format!("Failed to run adb logcat: {e}")))?;

    if !out.status.success() {
        return Err(AppError::Shell(
            String::from_utf8_lossy(&out.stderr).to_string(),
        ));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    Ok(text.lines().map(String::from).collect())
}

pub fn install_apk(apk_path: &str, serial: Option<&str>) -> AppResult<()> {
    let path = std::path::Path::new(apk_path);
    if !path.exists() || !path.is_file() {
        return Err(AppError::NotFound(format!(
            "APK file '{apk_path}' does not exist"
        )));
    }
    if !apk_path.to_lowercase().ends_with(".apk") {
        return Err(AppError::InvalidName("Target file is not an .apk".into()));
    }

    let mut cmd = Command::new("adb");
    if let Some(s) = serial {
        cmd.args(["-s", s]);
    }
    cmd.args(["install", "-r", apk_path]);
    let out = cmd
        .output()
        .map_err(|e| AppError::Io(format!("Failed to run adb install: {e}")))?;

    if !out.status.success() {
        return Err(AppError::Shell(
            String::from_utf8_lossy(&out.stderr).to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "machine-dependent"]
    fn test_list_ios_simulators_returns_vec() {
        let res = list_ios_simulators();
        assert!(res.is_ok());
    }

    #[test]
    #[ignore = "machine-dependent"]
    fn test_list_android_avds_returns_vec() {
        let res = list_android_avds();
        assert!(res.is_ok());
    }
}
