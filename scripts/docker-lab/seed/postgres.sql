-- shop: a normal app database. users_svc + orders_svc: two "microservice"
-- databases where orders.user_id points at another database's users table.
CREATE SCHEMA billing;
CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text,
  tier text NOT NULL DEFAULT 'standard', profile jsonb, referred_by uuid REFERENCES customers(id), created_at timestamptz NOT NULL DEFAULT now());
COMMENT ON TABLE customers IS 'People who buy things';
COMMENT ON COLUMN customers.tier IS 'standard | gold';
CREATE TABLE categories (id serial PRIMARY KEY, name text NOT NULL, parent_id int REFERENCES categories(id));
CREATE TABLE products (id serial PRIMARY KEY, sku text NOT NULL UNIQUE, name text NOT NULL, price_cents int NOT NULL,
  category_id int REFERENCES categories(id), tags text[] DEFAULT '{}', attributes jsonb);
CREATE TABLE orders (id bigserial PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', note text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);
CREATE TABLE order_items (order_id bigint REFERENCES orders(id) ON DELETE CASCADE, product_id int REFERENCES products(id),
  qty int NOT NULL CHECK (qty > 0), PRIMARY KEY (order_id, product_id));
CREATE TABLE audit_log (id bigserial PRIMARY KEY, actor_id uuid, action text, payload json, at timestamptz DEFAULT now());
CREATE TABLE import_staging (line text);
CREATE TABLE billing.plans (code text PRIMARY KEY, price_cents int NOT NULL);
CREATE TABLE billing.subscriptions (customer_id uuid REFERENCES customers(id), plan_code text REFERENCES billing.plans(code),
  started_at date NOT NULL, PRIMARY KEY (customer_id, plan_code));
CREATE VIEW recent_orders AS SELECT id, customer_id, status, created_at FROM orders WHERE created_at > now() - interval '30 days';

INSERT INTO customers (email, name, tier, profile)
  SELECT 'customer' || g || '@example.com', CASE WHEN g % 7 = 0 THEN NULL ELSE 'Customer ' || g END,
         CASE WHEN g % 10 = 0 THEN 'gold' ELSE 'standard' END,
         CASE WHEN g % 3 = 0 THEN jsonb_build_object('theme', 'dark', 'langs', jsonb_build_array('en', 'hi'), 'address', jsonb_build_object('city', 'Indore')) END
  FROM generate_series(1, 500) g;
UPDATE customers c SET referred_by = (SELECT id FROM customers ORDER BY email LIMIT 1) WHERE c.email LIKE '%5@example.com';
INSERT INTO categories (name) VALUES ('Electronics'), ('Books'), ('Home');
INSERT INTO categories (name, parent_id) VALUES ('Phones', 1), ('Laptops', 1);
INSERT INTO products (sku, name, price_cents, category_id, tags, attributes)
  SELECT 'SKU-' || lpad(g::text, 4, '0'), 'Product ' || g, 199 + g * 37, 1 + g % 5, ARRAY['tag' || (g % 4)],
         jsonb_build_object('color', (ARRAY['red','blue','black'])[1 + g % 3], 'weight_g', 100 + g)
  FROM generate_series(1, 120) g;
INSERT INTO orders (customer_id, status, note, created_at)
  SELECT c.id, (ARRAY['pending','paid','shipped','cancelled'])[1 + g % 4],
         CASE WHEN g % 9 = 0 THEN E'Leave at the door.\nCall on arrival.' END, now() - (g || ' hours')::interval
  FROM generate_series(1, 3000) g CROSS JOIN LATERAL (SELECT id FROM customers ORDER BY email OFFSET (g % 500) LIMIT 1) c;
INSERT INTO order_items SELECT o.id, 1 + (o.id % 120), 1 + o.id % 3 FROM orders o;
INSERT INTO audit_log (actor_id, action, payload) SELECT id, 'login', '{"ip":"10.0.0.1"}' FROM customers LIMIT 50;
INSERT INTO import_staging VALUES ('a,b,c'), ('d,e,f');
INSERT INTO billing.plans VALUES ('free', 0), ('pro', 1200);
INSERT INTO billing.subscriptions SELECT id, 'pro', current_date FROM customers WHERE tier = 'gold';

CREATE DATABASE users_svc;
CREATE DATABASE orders_svc;
\connect users_svc
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, created_at timestamptz DEFAULT now());
CREATE TABLE sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz);
INSERT INTO users (email) SELECT 'user' || g || '@example.com' FROM generate_series(1, 50) g;
INSERT INTO sessions (user_id, expires_at) SELECT id, now() + interval '1 day' FROM users;
\connect orders_svc
CREATE TABLE orders (id bigserial PRIMARY KEY, user_id uuid NOT NULL, total_cents int NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE order_events (id bigserial PRIMARY KEY, order_id bigint NOT NULL REFERENCES orders(id), kind text NOT NULL);
INSERT INTO orders (user_id, total_cents) SELECT gen_random_uuid(), 1000 + g FROM generate_series(1, 200) g;
INSERT INTO order_events (order_id, kind) SELECT id, 'created' FROM orders;
