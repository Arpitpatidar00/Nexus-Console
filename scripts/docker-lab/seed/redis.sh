#!/bin/sh
# Keys grouped by prefix, one of each type, some with a TTL.
r() { redis-cli -h redis "$@" >/dev/null; }
i=1
while [ $i -le 150 ]; do
  r HSET "session:$i" user "user$i" ip "10.0.0.$((i % 255))" agent "Mozilla/5.0"
  [ $((i % 2)) -eq 0 ] && r EXPIRE "session:$i" 86400
  r SET "cache:product:$i" "{\"id\":$i,\"name\":\"Item $i\",\"price\":$((i * 3))}"
  i=$((i + 1))
done
r RPUSH queue:emails welcome@example.com reset@example.com invoice@example.com
r SADD feature:flags dark-mode new-checkout beta-search
r ZADD leaderboard:weekly 120 ana 98 ben 77 chen 45 dev
r XADD events:orders '*' type created order 1
r XADD events:orders '*' type paid order 1
r SET maintenance_mode off
r SET rate:limit:10.0.0.1 7 EX 60
echo "redis seeded"
