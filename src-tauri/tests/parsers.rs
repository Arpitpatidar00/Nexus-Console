use std::fs;
use std::path::{Path, PathBuf};

use stackroost_lib::services::cloud::{parse_cost_explorer_json, parse_ec2_instances_json};
use stackroost_lib::services::databases::{parse_mysql_tables, parse_psql_tables};
use stackroost_lib::services::devices::{parse_emulator_avds, parse_simctl_json};
use stackroost_lib::services::doctor::system::{parse_ioreg_num, parse_low_power};
use stackroost_lib::services::domains::{
    parse_dig_propagation_output, parse_dig_records, parse_openssl_date, parse_rdap_json,
    parse_ssl_cert_text,
};
use stackroost_lib::services::maclean::energy::parse_pmset_batt;
use stackroost_lib::services::network::hosts::parse_hosts_content;
use stackroost_lib::services::network::parse_nettop_output;
use stackroost_lib::services::projects::git::{
    parse_git_branch_vv, parse_git_commit_log, parse_git_merged_branches,
    parse_git_rev_list_counts, parse_git_status_porcelain,
};
use stackroost_lib::services::releases::{
    parse_fastfile_lanes, parse_package_json_version, parse_pubspec_version,
};
use stackroost_lib::services::remote::parse::docker::{parse_compose, parse_containers};

fn fixture_path(subpath: &str) -> PathBuf {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let root = manifest_dir.parent().unwrap_or(manifest_dir);
    root.join("fixtures").join(subpath)
}

fn read_fixture(subpath: &str) -> String {
    let path = fixture_path(subpath);
    fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to read fixture {}: {e}", path.display()))
}

// ============================================================================
// 1. AWS PARSER TESTS (EC2 & COST EXPLORER)
// ============================================================================

#[test]
fn test_aws_ec2_fixture_happy() {
    let content = read_fixture("aws/describe-instances.json");
    let instances = parse_ec2_instances_json(content.as_bytes(), "us-east-1")
        .expect("should parse ec2 fixture");
    assert_eq!(instances.len(), 2);

    // Instance 1: prod
    assert_eq!(instances[0].id, "i-0123456789abcdef0");
    assert_eq!(instances[0].name, "api-production-us-east");
    assert_eq!(instances[0].state, "running");
    assert!(instances[0].is_prod);
    assert_eq!(instances[0].public_ip.as_deref(), Some("54.210.12.34"));
    assert_eq!(instances[0].private_ip.as_deref(), Some("10.0.1.25"));

    // Instance 2: non-prod
    assert_eq!(instances[1].id, "i-0987654321fedcba1");
    assert_eq!(instances[1].name, "worker-staging");
    assert_eq!(instances[1].state, "stopped");
    assert!(!instances[1].is_prod);
}

#[test]
fn test_aws_ec2_empty() {
    let json = br#"{"Reservations": []}"#;
    let instances = parse_ec2_instances_json(json, "us-east-1").unwrap();
    assert!(instances.is_empty());
}

#[test]
fn test_aws_ec2_malformed_json() {
    let garbage = b"{ invalid json here...";
    let res = parse_ec2_instances_json(garbage, "us-east-1");
    assert!(res.is_err());
}

#[test]
fn test_aws_ec2_unicode() {
    let json = r#"{
        "Reservations": [
            {
                "Instances": [
                    {
                        "InstanceId": "i-unicode123",
                        "InstanceType": "t4g.nano",
                        "State": { "Name": "running" },
                        "Tags": [
                            { "Key": "Name", "Value": "сервер-япония-東京-✨" },
                            { "Key": "Env", "Value": "prod" }
                        ]
                    }
                ]
            }
        ]
    }"#
    .as_bytes();
    let instances = parse_ec2_instances_json(json, "ap-northeast-1").unwrap();
    assert_eq!(instances.len(), 1);
    assert_eq!(instances[0].name, "сервер-япония-東京-✨");
    assert!(instances[0].is_prod);
}

#[test]
fn test_aws_cost_explorer_fixture_happy() {
    let content = read_fixture("aws/ce-cost-and-usage.json");
    let report = parse_cost_explorer_json(&content, 1729500000).expect("should parse cost fixture");
    assert_eq!(report.currency, "USD");
    assert_eq!(report.month_to_date_total, 76.4);
    assert_eq!(report.top_services.len(), 3);
    assert_eq!(
        report.top_services[0].service,
        "Amazon Elastic Compute Cloud - Compute"
    );
    assert_eq!(report.top_services[0].amount, 42.85);
}

#[test]
fn test_aws_cost_explorer_empty() {
    let json = r#"{"ResultsByTime": []}"#;
    let report = parse_cost_explorer_json(json, 1729500000).unwrap();
    assert_eq!(report.month_to_date_total, 0.0);
    assert!(report.top_services.is_empty());
}

#[test]
fn test_aws_cost_explorer_malformed() {
    let garbage = "not valid json";
    let res = parse_cost_explorer_json(garbage, 1729500000);
    assert!(res.is_err());
}

#[test]
fn test_aws_cost_explorer_unicode() {
    let json = r#"{
        "ResultsByTime": [
            {
                "TimePeriod": { "Start": "2026-10-01", "End": "2026-10-21" },
                "Groups": [
                    {
                        "Keys": ["Сервис Базы Данных 🚀 & Tokyo Region (東京)"],
                        "Metrics": {
                            "UnblendedCost": {
                                "Amount": "42.50",
                                "Unit": "EUR"
                            }
                        }
                    }
                ]
            }
        ]
    }"#;
    let report = parse_cost_explorer_json(json, 1729500000).unwrap();
    assert_eq!(report.currency, "EUR");
    assert_eq!(report.month_to_date_total, 42.50);
    assert_eq!(
        report.top_services[0].service,
        "Сервис Базы Данных 🚀 & Tokyo Region (東京)"
    );
}

// ============================================================================
// 2. DOCKER PARSER TESTS (COMPOSE & CONTAINERS)
// ============================================================================

#[test]
fn test_docker_compose_fixture_happy() {
    let content = read_fixture("docker/compose-ls.json");
    let projects = parse_compose(Some(&content));
    assert_eq!(projects.len(), 2);
    assert_eq!(projects[0].name, "stackroost-dev");
    assert_eq!(projects[0].status, "running(3)");
    assert_eq!(
        projects[0].config_files,
        "/Users/me/Desktop/Stackroost/docker-compose.yml"
    );
    assert_eq!(projects[1].name, "analytics-stack");
    assert_eq!(projects[1].status, "exited(1)");
}

#[test]
fn test_docker_compose_empty() {
    let projects = parse_compose(Some("[]"));
    assert!(projects.is_empty());

    let none_projects = parse_compose(None);
    assert!(none_projects.is_empty());
}

#[test]
fn test_docker_compose_malformed() {
    let projects = parse_compose(Some("{ broken json"));
    assert!(projects.is_empty());
}

#[test]
fn test_docker_compose_unicode() {
    let json = r#"[{"Name":"микросервисы-🚀","Status":"running(1)","ConfigFiles":"/app/docker-compose.yml"}]"#;
    let projects = parse_compose(Some(json));
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].name, "микросервисы-🚀");
}

#[test]
fn test_docker_containers_fixture_happy() {
    let content = read_fixture("docker/compose-ps.json");
    let containers = parse_containers(Some(&content), None, None);
    assert_eq!(containers.len(), 2);

    assert_eq!(containers[0].id, "abc123def456");
    assert_eq!(containers[0].name, "stackroost-dev-web-1");
    assert_eq!(containers[0].state, "running");
    assert_eq!(containers[0].health.as_deref(), Some("healthy"));
    assert_eq!(
        containers[0].compose_project.as_deref(),
        Some("stackroost-dev")
    );

    assert_eq!(containers[1].id, "789012abcdef");
    assert_eq!(containers[1].name, "stackroost-dev-db-1");
    assert_eq!(containers[1].health, None);
}

#[test]
fn test_docker_containers_empty() {
    let containers = parse_containers(Some(""), None, None);
    assert!(containers.is_empty());

    let none_containers = parse_containers(None, None, None);
    assert!(none_containers.is_empty());
}

#[test]
fn test_docker_containers_malformed() {
    let garbage = "this is not json lines\nsecond line garbage\n";
    let containers = parse_containers(Some(garbage), None, None);
    assert!(containers.is_empty());
}

#[test]
fn test_docker_containers_unicode() {
    let json_line = r#"{"ID":"d4e5f6a1b2c3","Names":"контейнер-база-🚀","Image":"custom:v1","State":"running","Status":"Up 2 hours","Labels":"com.docker.compose.project=проект-alpha"}"#;
    let containers = parse_containers(Some(json_line), None, None);
    assert_eq!(containers.len(), 1);
    assert_eq!(containers[0].name, "контейнер-база-🚀");
    assert_eq!(
        containers[0].compose_project.as_deref(),
        Some("проект-alpha")
    );
}

// ============================================================================
// 3. DATABASES PARSER TESTS (PSQL & MYSQL)
// ============================================================================

#[test]
fn test_databases_psql_fixture_happy() {
    let content = read_fixture("databases/psql-tables.txt");
    let tables = parse_psql_tables(&content, "public");
    assert_eq!(tables.len(), 4);
    assert_eq!(tables[0].name, "users");
    assert_eq!(tables[0].schema, "public");
    assert_eq!(tables[1].name, "sessions");
    assert_eq!(tables[2].name, "audit_logs");
    assert_eq!(tables[3].name, "projects");
}

#[test]
fn test_databases_psql_empty() {
    let tables = parse_psql_tables("", "public");
    assert!(tables.is_empty());
}

#[test]
fn test_databases_psql_malformed() {
    let text = " (0 rows)\n\n(12 rows)\n   \n";
    let tables = parse_psql_tables(text, "public");
    assert!(tables.is_empty());
}

#[test]
fn test_databases_psql_unicode() {
    let text = " пользователи_таблица \n заказы_2026_🚀 \n table_with_special$ \n";
    let tables = parse_psql_tables(text, "public");
    assert_eq!(tables.len(), 3);
    assert_eq!(tables[0].name, "пользователи_таблица");
    assert_eq!(tables[1].name, "заказы_2026_🚀");
}

#[test]
fn test_databases_mysql_fixture_happy() {
    let content = read_fixture("databases/mysql-tables.txt");
    let tables = parse_mysql_tables(&content, "appdb");
    assert_eq!(tables.len(), 4);
    assert_eq!(tables[0].name, "accounts");
    assert_eq!(tables[0].schema, "appdb");
    assert_eq!(tables[1].name, "orders");
    assert_eq!(tables[2].name, "products");
    assert_eq!(tables[3].name, "migrations");
}

#[test]
fn test_databases_mysql_empty() {
    let tables = parse_mysql_tables("", "test_db");
    assert!(tables.is_empty());
}

#[test]
fn test_databases_mysql_malformed() {
    let text = "Tables_in_app_production\n"; // Only header, no rows
    let tables = parse_mysql_tables(text, "app_production");
    assert!(tables.is_empty());
}

#[test]
fn test_databases_mysql_unicode() {
    let text = "Tables_in_app\nтаблица_клиентов\nproduct_catalog_🛍️\n";
    let tables = parse_mysql_tables(text, "app");
    assert_eq!(tables.len(), 2);
    assert_eq!(tables[0].name, "таблица_клиентов");
    assert_eq!(tables[1].name, "product_catalog_🛍️");
}

// ============================================================================
// 4. DOMAINS PARSER TESTS (DIG, SSL CERT, RDAP)
// ============================================================================

#[test]
fn test_domains_dig_records_fixture_happy() {
    let content = read_fixture("domains/dig-records.txt");
    let records = parse_dig_records(&content);
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].record_type, "A");
    assert_eq!(records[0].value, "172.66.147.243");
    assert_eq!(records[0].ttl, Some(300));
    assert_eq!(records[1].value, "104.20.23.154");
}

#[test]
fn test_domains_dig_records_empty() {
    let records = parse_dig_records("");
    assert!(records.is_empty());
}

#[test]
fn test_domains_dig_records_malformed() {
    let text =
        ";; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY\nshort line\n";
    let records = parse_dig_records(text);
    assert!(records.is_empty());
}

#[test]
fn test_domains_dig_records_unicode() {
    let text = "xn--e1afmkfd.xn--p1ai. 3600 IN TXT \"проверка=значение-🚀\"\n";
    let records = parse_dig_records(text);
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].record_type, "TXT");
    assert_eq!(records[0].value, "\"проверка=значение-🚀\"");
}

#[test]
fn test_domains_propagation_output() {
    let output = "example.com. 300 IN A 93.184.216.34\n";
    let answers = parse_dig_propagation_output(output);
    assert_eq!(answers, vec!["93.184.216.34"]);
}

#[test]
fn test_domains_openssl_date() {
    let ts = parse_openssl_date("Jan 15 00:00:00 2026 GMT");
    assert!(ts.is_some());
}

#[test]
fn test_domains_ssl_cert_fixture_happy() {
    let content = read_fixture("domains/openssl-x509.txt");
    let cert = parse_ssl_cert_text(&content, "example.com");
    assert_eq!(cert.domain, "example.com");
    assert_eq!(cert.not_before, "Sep 26 22:49:11 2026 GMT");
    assert_eq!(cert.not_after, "Dec 25 22:56:35 2026 GMT");
    assert!(cert.issuer.contains("Cloudflare TLS"));
    assert!(cert.subject.contains("CN=example.com"));
    assert_eq!(cert.sans, vec!["example.com", "*.example.com"]);
    assert_eq!(cert.error, None);
}

#[test]
fn test_domains_ssl_cert_empty() {
    let cert = parse_ssl_cert_text("", "example.com");
    assert!(!cert.valid);
    assert!(cert.error.is_some());
}

#[test]
fn test_domains_ssl_cert_malformed() {
    let garbage = "unable to load certificate\n14073520...:error:0909006C:PEM routines:get_name:no start line";
    let cert = parse_ssl_cert_text(garbage, "example.com");
    assert!(!cert.valid);
}

#[test]
fn test_domains_ssl_cert_unicode() {
    let text = "notBefore=Jan 1 00:00:00 2026 GMT\nnotAfter=Dec 31 23:59:59 2027 GMT\nissuer=C=RU, O=ООО \"Сертификаты\", CN=Тест УЦ 🚀\nsubject=CN=пример.рф\nX509v3 Subject Alternative Name:\n    DNS:пример.рф, DNS:www.пример.рф\n";
    let cert = parse_ssl_cert_text(text, "пример.рф");
    assert!(cert.valid);
    assert!(cert.issuer.contains("ООО \"Сертификаты\""));
    assert_eq!(cert.sans, vec!["пример.рф", "www.пример.рф"]);
}

#[test]
fn test_domains_rdap_fixture_happy() {
    let content = read_fixture("domains/rdap-domain.json");
    let rdap = parse_rdap_json(&content, "example.com");
    assert_eq!(rdap.domain, "example.com");
    assert_eq!(
        rdap.registrar.as_deref(),
        Some("RESERVED-Internet Assigned Numbers Authority")
    );
    assert_eq!(
        rdap.expiration_date.as_deref(),
        Some("2027-08-13T04:00:00Z")
    );
    assert_eq!(rdap.created_date.as_deref(), Some("1995-08-14T04:00:00Z"));
    assert_eq!(rdap.updated_date.as_deref(), Some("2026-08-14T07:01:38Z"));
    assert!(rdap
        .status
        .contains(&"client transfer prohibited".to_string()));
    assert_eq!(rdap.error, None);
}

#[test]
fn test_domains_rdap_empty() {
    let rdap = parse_rdap_json("", "example.com");
    assert!(rdap.error.is_some());
    assert_eq!(rdap.registrar, None);
}

#[test]
fn test_domains_rdap_malformed() {
    let html_404 = "<!DOCTYPE html><html><body>404 Not Found</body></html>";
    let rdap = parse_rdap_json(html_404, "notfound.org");
    assert!(rdap.error.is_some());
}

#[test]
fn test_domains_rdap_unicode() {
    let json = r#"{
        "status": ["active"],
        "events": [
            { "eventAction": "expiration", "eventDate": "2028-01-01T00:00:00Z" }
        ],
        "entities": [
            {
                "roles": ["registrar"],
                "vcardArray": ["vcard", [["fn", {}, "text", "Регистратор Доменов 'Руцентр' 🇷🇺"]]]
            }
        ]
    }"#;
    let rdap = parse_rdap_json(json, "тест.рф");
    assert_eq!(
        rdap.registrar.as_deref(),
        Some("Регистратор Доменов 'Руцентр' 🇷🇺")
    );
    assert_eq!(
        rdap.expiration_date.as_deref(),
        Some("2028-01-01T00:00:00Z")
    );
}

// ============================================================================
// 5. NETWORK PARSER TESTS (HOSTS & NETTOP)
// ============================================================================

#[test]
fn test_network_hosts_fixture_happy() {
    let content = read_fixture("network/hosts-sample.txt");
    let doc = parse_hosts_content(&content);
    assert_eq!(doc.entries.len(), 3);

    assert_eq!(doc.entries[0].ip, "127.0.0.1");
    assert_eq!(doc.entries[0].hostnames, vec!["api.local.dev".to_string()]);
    assert_eq!(doc.entries[0].comment.as_deref(), Some("Local API"));
    assert!(doc.entries[0].enabled);

    assert_eq!(doc.entries[1].ip, "127.0.0.1");
    assert_eq!(doc.entries[1].hostnames, vec!["db.local.dev".to_string()]);
    assert!(doc.entries[1].enabled);

    assert_eq!(doc.entries[2].ip, "192.168.1.100");
    assert!(!doc.entries[2].enabled);
}

#[test]
fn test_network_hosts_empty() {
    let doc = parse_hosts_content("");
    assert!(doc.entries.is_empty());
}

#[test]
fn test_network_hosts_malformed() {
    let text = "# just comments\n\ninvalid_line_without_ip\n127.0.0.1\n";
    let doc = parse_hosts_content(text);
    // Line with only IP and no hostnames is skipped
    assert!(doc.entries.is_empty());
}

#[test]
fn test_network_hosts_unicode() {
    let text = "# --- BEGIN STACKROOST MANAGED ENTRIES ---\n127.0.0.1 тест.локал # Тестовый сервер 🚀\n# --- END STACKROOST MANAGED ENTRIES ---\n";
    let doc = parse_hosts_content(text);
    assert_eq!(doc.entries.len(), 1);
    assert_eq!(doc.entries[0].hostnames, vec!["тест.локал".to_string()]);
    assert_eq!(
        doc.entries[0].comment.as_deref(),
        Some("Тестовый сервер 🚀")
    );
}

#[test]
fn test_network_nettop_fixture_happy() {
    let content = read_fixture("network/nettop-samples.txt");
    let proc_list = parse_nettop_output(&content);
    assert_eq!(proc_list.len(), 4);

    // Highest bandwidth first: node (8900000 + 12000000)
    assert_eq!(proc_list[0].process, "node");
    assert_eq!(proc_list[0].pid, 34567);
    assert_eq!(proc_list[0].bytes_in, 8900000);
    assert_eq!(proc_list[0].bytes_out, 12000000);

    assert_eq!(proc_list[1].process, "Google Chrome");
    assert_eq!(proc_list[1].pid, 12345);

    assert_eq!(proc_list[2].process, "Slack");
    assert_eq!(proc_list[3].process, "curl");
}

#[test]
fn test_network_nettop_empty() {
    let proc_list = parse_nettop_output("");
    assert!(proc_list.is_empty());
}

#[test]
fn test_network_nettop_malformed() {
    let text = "time,proc,bytes_in,bytes_out\ngarbage line without commas\n,,,\n";
    let proc_list = parse_nettop_output(text);
    assert!(proc_list.is_empty());
}

#[test]
fn test_network_nettop_unicode() {
    let text = "time,proc,bytes_in,bytes_out\nТелеграм-Клиент.9999,1024,2048\n";
    let proc_list = parse_nettop_output(text);
    assert_eq!(proc_list.len(), 1);
    assert_eq!(proc_list[0].process, "Телеграм-Клиент");
    assert_eq!(proc_list[0].pid, 9999);
    assert_eq!(proc_list[0].bytes_in, 1024);
    assert_eq!(proc_list[0].bytes_out, 2048);
}

// ============================================================================
// 6. DEVICES PARSER TESTS (SIMCTL & EMULATOR)
// ============================================================================

#[test]
fn test_devices_simctl_fixture_happy() {
    let content = read_fixture("devices/simctl-list.json");
    let sims = parse_simctl_json(&content);
    assert_eq!(sims.len(), 2);

    assert_eq!(sims[0].udid, "A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
    assert_eq!(sims[0].name, "iPhone 16 Pro");
    assert_eq!(sims[0].state, "Booted");
    assert!(sims[0].is_available);
    assert_eq!(sims[0].runtime, "iOS 18 0");

    assert_eq!(sims[1].udid, "B2C3D4E5-F6A7-8901-BCDE-F12345678901");
    assert_eq!(sims[1].name, "iPhone 16 Pro (Testing)");
    assert_eq!(sims[1].state, "Shutdown");
}

#[test]
fn test_devices_simctl_empty() {
    let sims = parse_simctl_json("{}");
    assert!(sims.is_empty());

    let empty_devices = parse_simctl_json(r#"{"devices":{}}"#);
    assert!(empty_devices.is_empty());
}

#[test]
fn test_devices_simctl_malformed() {
    let sims = parse_simctl_json("{ not valid json");
    assert!(sims.is_empty());
}

#[test]
fn test_devices_simctl_unicode() {
    let json = r#"{
        "devices": {
            "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
                {
                    "udid": "E5F6A1B2-C3D4-5678-90AB-CDEF12345678",
                    "name": "iPad Pro (13-inch) \"Команда Разработки\" 🚀",
                    "state": "Booted",
                    "isAvailable": true
                }
            ]
        }
    }"#;
    let sims = parse_simctl_json(json);
    assert_eq!(sims.len(), 1);
    assert_eq!(sims[0].name, "iPad Pro (13-inch) \"Команда Разработки\" 🚀");
}

#[test]
fn test_devices_emulator_avds_fixture_happy() {
    let content = read_fixture("devices/emulator-list-avds.txt");
    let avds = parse_emulator_avds(&content);
    assert_eq!(avds.len(), 3);
    assert_eq!(avds[0].name, "Pixel_8_API_34");
    assert_eq!(avds[1].name, "Pixel_7_Pro_API_33");
    assert_eq!(avds[2].name, "Medium_Phone_API_35");
    assert!(!avds[0].running);
}

#[test]
fn test_devices_emulator_avds_empty() {
    let avds = parse_emulator_avds("");
    assert!(avds.is_empty());
}

#[test]
fn test_devices_emulator_avds_malformed() {
    let text = "   \n\n   \t\n";
    let avds = parse_emulator_avds(text);
    assert!(avds.is_empty());
}

#[test]
fn test_devices_emulator_avds_unicode() {
    let text = "Pixel_Тестовый_Эмулятор_🚀\nGalaxy_S24_Ultra\n";
    let avds = parse_emulator_avds(text);
    assert_eq!(avds.len(), 2);
    assert_eq!(avds[0].name, "Pixel_Тестовый_Эмулятор_🚀");
}

// ============================================================================
// 7. SYSTEM PARSER TESTS (PMSET & IOREG)
// ============================================================================

#[test]
fn test_system_pmset_batt_fixture_happy() {
    let content = read_fixture("system/pmset-batt.txt");
    let (source, charging, percent) = parse_pmset_batt(&content);
    assert_eq!(source, "battery");
    assert!(!charging);
    assert_eq!(percent, Some(58));
}

#[test]
fn test_system_pmset_batt_ac_charging() {
    let text = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234567)	98%; charging; 0:12 remaining present: true\n";
    let (source, charging, percent) = parse_pmset_batt(text);
    assert_eq!(source, "ac");
    assert!(charging);
    assert_eq!(percent, Some(98));
}

#[test]
fn test_system_pmset_batt_empty() {
    let (source, charging, percent) = parse_pmset_batt("");
    assert_eq!(source, "ac");
    assert!(!charging);
    assert_eq!(percent, None);
}

#[test]
fn test_system_pmset_batt_malformed() {
    let text = "No battery installed or unexpected output structure";
    let (source, charging, percent) = parse_pmset_batt(text);
    assert_eq!(source, "ac");
    assert!(!charging);
    assert_eq!(percent, None);
}

#[test]
fn test_system_pmset_batt_unicode() {
    let text = "Now drawing from 'Battery Power'\n -СтатусБатареи 🔋: 100%; discharging\n";
    let (source, charging, percent) = parse_pmset_batt(text);
    assert_eq!(source, "battery");
    assert!(!charging);
    assert_eq!(percent, Some(100));
}

#[test]
fn test_system_ioreg_fixture_happy() {
    let content = read_fixture("system/ioreg-battery.txt");
    assert_eq!(parse_ioreg_num(&content, "CycleCount"), Some(822));
    assert_eq!(parse_ioreg_num(&content, "MaxCapacity"), Some(100));
    assert_eq!(parse_ioreg_num(&content, "CurrentCapacity"), Some(58));
    assert_eq!(parse_ioreg_num(&content, "Voltage"), Some(11601));
    assert_eq!(parse_ioreg_num(&content, "TimeRemaining"), Some(266));
}

#[test]
fn test_system_ioreg_empty() {
    assert_eq!(parse_ioreg_num("", "CycleCount"), None);
}

#[test]
fn test_system_ioreg_malformed() {
    let text = "\"CycleCount\" = not_a_number\n\"MaxCapacity\" = \n";
    assert_eq!(parse_ioreg_num(text, "CycleCount"), None);
    assert_eq!(parse_ioreg_num(text, "MaxCapacity"), None);
}

#[test]
fn test_system_ioreg_unicode() {
    let text = "  \"CycleCount\" = 250 // Батарея в отличном состоянии ✨\n";
    assert_eq!(parse_ioreg_num(text, "CycleCount"), Some(250));
}

#[test]
fn test_system_pmset_low_power_happy() {
    let pmset_g = "System-wide power settings:\n SleepDisabled 0\n lowpowermode 1\n gpuswitch 2\n";
    assert_eq!(parse_low_power(pmset_g), Some(true));

    let pmset_g_off = "System-wide power settings:\n lowpowermode 0\n";
    assert_eq!(parse_low_power(pmset_g_off), Some(false));
}

#[test]
fn test_system_pmset_low_power_malformed() {
    assert_eq!(parse_low_power("no power mode key present"), None);
}

// ============================================================================
// 8. GIT PARSER TESTS (STATUS, COUNTS, COMMIT LOG, MERGED BRANCHES, BRANCH -VV)
// ============================================================================

#[test]
fn test_git_status_porcelain_fixture_happy() {
    let content = read_fixture("git/git-status-porcelain.txt");
    let dirty_count = parse_git_status_porcelain(&content);
    assert_eq!(dirty_count, 4);
}

#[test]
fn test_git_status_porcelain_empty() {
    assert_eq!(parse_git_status_porcelain(""), 0);
    assert_eq!(parse_git_status_porcelain("   \n\n  \t\n"), 0);
}

#[test]
fn test_git_status_porcelain_unicode() {
    let text = " M src/документ-тест.rs\n?? images/логотип-🚀.png\n";
    assert_eq!(parse_git_status_porcelain(text), 2);
}

#[test]
fn test_git_branch_vv_fixture_happy() {
    let content = read_fixture("git/git-branch-vv.txt");
    let branches = parse_git_branch_vv(&content);
    assert_eq!(branches.len(), 6);

    assert_eq!(branches[0].name, "feat/mac-clean");
    assert_eq!(branches[0].commit, "8c3d181");
    assert_eq!(branches[0].upstream, None);

    // HEAD branch
    assert!(branches[4].is_head);
    assert_eq!(branches[4].name, "fix/audit-C-tests");
    assert_eq!(branches[4].commit, "82745f1");

    // Main branch with upstream
    assert_eq!(branches[5].name, "main");
    assert_eq!(branches[5].commit, "3b67fca");
    assert_eq!(branches[5].upstream.as_deref(), Some("origin/main"));
}

#[test]
fn test_git_branch_vv_empty() {
    let branches = parse_git_branch_vv("");
    assert!(branches.is_empty());
}

#[test]
fn test_git_branch_vv_malformed() {
    let branches = parse_git_branch_vv("singleword\n\n");
    assert!(branches.is_empty());
}

#[test]
fn test_git_branch_vv_unicode() {
    let text = "* ветка-разработки 1234567 [origin/ветка-разработки: ahead 1] Тестовый коммит 🚀\n";
    let branches = parse_git_branch_vv(text);
    assert_eq!(branches.len(), 1);
    assert!(branches[0].is_head);
    assert_eq!(branches[0].name, "ветка-разработки");
    assert_eq!(branches[0].commit, "1234567");
    assert_eq!(
        branches[0].upstream.as_deref(),
        Some("origin/ветка-разработки")
    );
}

#[test]
fn test_git_rev_list_counts_happy() {
    let (ahead, behind) = parse_git_rev_list_counts("3\t5\n");
    assert_eq!(ahead, 3);
    assert_eq!(behind, 5);

    let (ahead2, behind2) = parse_git_rev_list_counts("0 0");
    assert_eq!(ahead2, 0);
    assert_eq!(behind2, 0);
}

#[test]
fn test_git_rev_list_counts_malformed() {
    let (a, b) = parse_git_rev_list_counts("not enough parts");
    assert_eq!(a, 0);
    assert_eq!(b, 0);
}

#[test]
fn test_git_commit_log_happy() {
    let log = "a1b2c3d\tfeat: implement new parser suite\t2 hours ago\tAlice Engineer\n";
    let info = parse_git_commit_log(log).unwrap();
    assert_eq!(info.hash, "a1b2c3d");
    assert_eq!(info.message, "feat: implement new parser suite");
    assert_eq!(info.relative_time, "2 hours ago");
    assert_eq!(info.author, "Alice Engineer");
}

#[test]
fn test_git_commit_log_malformed() {
    let invalid = "only\ttwo\tparts";
    assert!(parse_git_commit_log(invalid).is_none());
}

#[test]
fn test_git_merged_branches_happy() {
    let output = "  feature/done-1\n* main\n  feature/done-2\n  master\n";
    let merged = parse_git_merged_branches(output, "main");
    assert_eq!(
        merged,
        vec!["feature/done-1".to_string(), "feature/done-2".to_string()]
    );
}

// ============================================================================
// 9. RELEASES PARSER TESTS (PUBSPEC, FASTFILE, PACKAGE.JSON)
// ============================================================================

#[test]
fn test_releases_pubspec_fixture_happy() {
    let content = read_fixture("releases/pubspec.yaml");
    let (ver, build) = parse_pubspec_version(&content);
    assert_eq!(ver.as_deref(), Some("2.4.1"));
    assert_eq!(build.as_deref(), Some("48"));
}

#[test]
fn test_releases_pubspec_empty() {
    let (ver, build) = parse_pubspec_version("");
    assert_eq!(ver, None);
    assert_eq!(build, None);
}

#[test]
fn test_releases_pubspec_malformed() {
    let text = "name: my_app\ndescription: without version key\n";
    let (ver, build) = parse_pubspec_version(text);
    assert_eq!(ver, None);
    assert_eq!(build, None);
}

#[test]
fn test_releases_pubspec_unicode() {
    let text = "# Приложение с эмодзи 📱\nname: my_app\nversion: 2.0.0-beta.1+100 # Релиз\n";
    let (ver, build) = parse_pubspec_version(text);
    assert_eq!(ver.as_deref(), Some("2.0.0-beta.1"));
    assert_eq!(build.as_deref(), Some("100"));
}

#[test]
fn test_releases_fastfile_fixture_happy() {
    let content = read_fixture("releases/Fastfile");
    let lanes = parse_fastfile_lanes(&content);
    assert_eq!(lanes.len(), 3);
    assert_eq!(lanes, vec!["beta", "release", "internal"]);
}

#[test]
fn test_releases_fastfile_empty() {
    let lanes = parse_fastfile_lanes("");
    assert!(lanes.is_empty());
}

#[test]
fn test_releases_fastfile_malformed() {
    let text = "# comments only\ndef not_a_lane\nend\n";
    let lanes = parse_fastfile_lanes(text);
    assert!(lanes.is_empty());
}

#[test]
fn test_releases_fastfile_unicode() {
    let text = "# Лейны сборки 🚀\ndefault_platform(:ios)\nlane :testflight_прод do |values|\n  # сборка\nend\nlane :бета_тест do\nend\n";
    let lanes = parse_fastfile_lanes(text);
    assert_eq!(lanes, vec!["testflight_прод", "бета_тест"]);
}

#[test]
fn test_releases_package_json_happy() {
    let json = r#"{"name":"stackroost-ui","version":"2.1.0","private":true}"#;
    let ver = parse_package_json_version(json);
    assert_eq!(ver.as_deref(), Some("2.1.0"));
}

#[test]
fn test_releases_package_json_malformed() {
    let invalid = "{ not a valid json }";
    assert_eq!(parse_package_json_version(invalid), None);
}
