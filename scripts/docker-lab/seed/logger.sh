#!/bin/sh
# Log lines in the shapes real services print, every ~2 seconds.
id() { cat /proc/sys/kernel/random/uuid; }
now() { date -u +%Y-%m-%dT%H:%M:%S.000Z; }
n=0
while :; do
  n=$((n + 1))
  r=$(id)
  echo "$(now) [INFO ] (GET /health) [$r] Incoming request"
  echo "127.0.0.1 - - [$(date -u '+%d/%b/%Y:%H:%M:%S +0000')] \"GET /health HTTP/1.1\" 200 137 \"-\" \"node\""
  echo "prisma:query SELECT \"public\".\"orders\".\"id\" FROM \"public\".\"orders\" WHERE \"status\" = \$1 LIMIT \$2"
  echo "$(now) [INFO ] (POST /api/v1/orders) [$r] Order created id=$n total=42.50"
  case $((n % 6)) in
    1) echo "$(now) [WARN ] (GET /api/v1/products) [$r] slow query took 1532ms" ;;
    2) echo "{\"level\":\"error\",\"msg\":\"payment declined\",\"requestId\":\"$r\",\"code\":\"card_declined\"}" ;;
    3) echo "TypeError: Cannot read properties of undefined (reading 'id')" >&2
       echo "    at OrdersService.create (/app/dist/orders/orders.service.js:42:31)" >&2
       echo "    at async OrdersController.post (/app/dist/orders/orders.controller.js:18:12)" >&2 ;;
    4) echo "10.0.0.7 - - [$(date -u '+%d/%b/%Y:%H:%M:%S +0000')] \"POST /api/v1/checkout HTTP/1.1\" 502 13 \"-\" \"Mozilla/5.0\"" ;;
    5) echo "1.2.3.4 - - [$(date -u '+%d/%b/%Y:%H:%M:%S +0000')] \"GET /.env HTTP/1.1\" 404 0 \"-\" \"scanner\"" ;;
  esac
  sleep 2
done
