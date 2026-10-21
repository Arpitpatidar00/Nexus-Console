# Domains & DNS Fixtures

Fixtures for domain name resolution, TLS certificate inspection, and RDAP registration:
- `dig-records.txt`: Real output from `/usr/bin/dig example.com A`.
- `openssl-x509.txt`: Real certificate dump from `openssl s_client ... | openssl x509 -text`.
- `rdap-domain.json`: Real RDAP response from ICANN/Verisign RDAP services for `example.com`.
