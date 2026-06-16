use serde::Serialize;
use std::collections::HashSet;
use std::io::ErrorKind;
use std::process::Command;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WifiNetworkItem {
  id: String,
  ssid: String,
  signal_percent: u8,
  security: String,
  saved: bool,
  connected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostNetworkStatus {
  available: bool,
  ssid: Option<String>,
  ip_address: Option<String>,
  message: String,
  networks: Vec<WifiNetworkItem>,
}

fn unavailable_network_status(message: String) -> HostNetworkStatus {
  HostNetworkStatus {
    available: false,
    ssid: None,
    ip_address: None,
    message,
    networks: Vec::new(),
  }
}

fn run_nmcli(args: &[&str]) -> Result<String, String> {
  let output = Command::new("nmcli")
    .args(args)
    .output()
    .map_err(|error| {
      if error.kind() == ErrorKind::NotFound {
        "nmcli не найден. Установите и включите NetworkManager.".to_string()
      } else {
        format!("Не удалось запустить nmcli: {error}")
      }
    })?;

  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

  if !output.status.success() {
    return Err(if stderr.is_empty() {
      format!("nmcli завершился с кодом {}", output.status)
    } else {
      stderr
    });
  }

  Ok(stdout)
}

fn split_nmcli_fields(line: &str) -> Vec<String> {
  let mut fields = Vec::new();
  let mut current = String::new();
  let mut escaped = false;

  for character in line.chars() {
    if escaped {
      current.push(character);
      escaped = false;
    } else if character == '\\' {
      escaped = true;
    } else if character == ':' {
      fields.push(current);
      current = String::new();
    } else {
      current.push(character);
    }
  }

  if escaped {
    current.push('\\');
  }
  fields.push(current);

  fields
}

fn slugify_ssid(ssid: &str, index: usize) -> String {
  let mut slug = String::new();
  let mut last_was_dash = false;

  for character in ssid.to_lowercase().chars() {
    if character.is_ascii_alphanumeric() {
      slug.push(character);
      last_was_dash = false;
    } else if !last_was_dash {
      slug.push('-');
      last_was_dash = true;
    }
  }

  let slug = slug.trim_matches('-').to_string();
  if slug.is_empty() {
    format!("wifi-{}", index + 1)
  } else {
    slug
  }
}

fn normalize_security(raw_security: &str) -> String {
  let security = raw_security.to_lowercase();

  if security.contains("wpa3") {
    "wpa3".to_string()
  } else if security.contains("wpa") || security.contains("wep") {
    "wpa2".to_string()
  } else {
    "open".to_string()
  }
}

fn read_saved_wifi_names() -> HashSet<String> {
  let output = match run_nmcli(&["-t", "-f", "NAME,TYPE", "connection", "show"]) {
    Ok(output) => output,
    Err(_) => return HashSet::new(),
  };

  output
    .lines()
    .filter_map(|line| {
      let fields = split_nmcli_fields(line);
      let name = fields.first()?.trim();
      let connection_type = fields.get(1)?.trim();

      if name.is_empty() || !connection_type.contains("wireless") {
        return None;
      }

      Some(name.to_string())
    })
    .collect()
}

fn read_connected_wifi_device() -> Option<String> {
  let output = run_nmcli(&["-t", "-f", "DEVICE,TYPE,STATE", "device", "status"]).ok()?;

  output.lines().find_map(|line| {
    let fields = split_nmcli_fields(line);
    let device = fields.first()?.trim();
    let device_type = fields.get(1)?.trim();
    let state = fields.get(2)?.trim();

    if device.is_empty() || device_type != "wifi" || state != "connected" {
      return None;
    }

    Some(device.to_string())
  })
}

fn read_wifi_ip_address() -> Option<String> {
  let device = read_connected_wifi_device()?;
  let output = run_nmcli(&["-g", "IP4.ADDRESS", "device", "show", device.as_str()]).ok()?;

  output.lines().find_map(|line| {
    let address = line.trim().split('/').next()?.trim();
    if address.is_empty() {
      None
    } else {
      Some(address.to_string())
    }
  })
}

fn parse_wifi_networks(output: &str, saved_wifi_names: &HashSet<String>) -> Vec<WifiNetworkItem> {
  let mut networks: Vec<WifiNetworkItem> = Vec::new();

  for line in output.lines() {
    let fields = split_nmcli_fields(line);
    if fields.len() < 4 {
      continue;
    }

    let connected = fields[0].trim() == "yes";
    let ssid = fields[1].trim();
    if ssid.is_empty() {
      continue;
    }

    let signal_percent = fields[2].trim().parse::<u8>().unwrap_or(0).min(100);
    let security = normalize_security(fields[3].trim());
    let saved = saved_wifi_names.contains(ssid);
    let id = slugify_ssid(ssid, networks.len());

    if let Some(existing) = networks.iter_mut().find(|network| network.ssid == ssid) {
      existing.connected = existing.connected || connected;
      existing.saved = existing.saved || saved;
      if signal_percent > existing.signal_percent {
        existing.signal_percent = signal_percent;
      }
      if existing.security == "open" && security != "open" {
        existing.security = security;
      }
      continue;
    }

    networks.push(WifiNetworkItem {
      id,
      ssid: ssid.to_string(),
      signal_percent,
      security,
      saved,
      connected,
    });
  }

  networks.sort_by(|left, right| {
    right
      .connected
      .cmp(&left.connected)
      .then_with(|| right.signal_percent.cmp(&left.signal_percent))
      .then_with(|| left.ssid.cmp(&right.ssid))
  });

  networks
}

fn read_network_status(rescan: bool) -> HostNetworkStatus {
  if let Err(message) = run_nmcli(&["--version"]) {
    return unavailable_network_status(message);
  }

  let rescan_message = if rescan {
    run_nmcli(&["device", "wifi", "rescan"]).err()
  } else {
    None
  };
  let saved_wifi_names = read_saved_wifi_names();
  let networks_output = match run_nmcli(&[
    "-t",
    "-f",
    "ACTIVE,SSID,SIGNAL,SECURITY",
    "device",
    "wifi",
    "list",
    "--rescan",
    "no",
  ]) {
    Ok(output) => output,
    Err(message) => return unavailable_network_status(message),
  };
  let networks = parse_wifi_networks(&networks_output, &saved_wifi_names);
  let ssid = networks
    .iter()
    .find(|network| network.connected)
    .map(|network| network.ssid.clone());

  HostNetworkStatus {
    available: true,
    ssid,
    ip_address: read_wifi_ip_address(),
    message: rescan_message.unwrap_or_else(|| "NetworkManager Wi-Fi bridge готов.".to_string()),
    networks,
  }
}

#[tauri::command]
fn network_status() -> HostNetworkStatus {
  read_network_status(false)
}

#[tauri::command]
fn network_scan() -> HostNetworkStatus {
  read_network_status(true)
}

#[tauri::command]
fn network_connect(ssid: String, password: Option<String>) -> Result<HostNetworkStatus, String> {
  let ssid = ssid.trim();
  if ssid.is_empty() {
    return Err("SSID не задан.".to_string());
  }

  let password = password.unwrap_or_default();
  let mut args = vec!["device", "wifi", "connect", ssid];
  if !password.is_empty() {
    args.push("password");
    args.push(password.as_str());
  }

  run_nmcli(&args)?;
  let mut status = read_network_status(false);
  status.message = format!("Подключено к {ssid}.");
  Ok(status)
}

#[tauri::command]
fn network_forget(ssid: String) -> Result<HostNetworkStatus, String> {
  let ssid = ssid.trim();
  if ssid.is_empty() {
    return Err("SSID не задан.".to_string());
  }

  run_nmcli(&["connection", "delete", "id", ssid])?;
  let mut status = read_network_status(false);
  status.message = format!("Сеть {ssid} удалена из сохраненных.");
  Ok(status)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      network_status,
      network_scan,
      network_connect,
      network_forget,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
