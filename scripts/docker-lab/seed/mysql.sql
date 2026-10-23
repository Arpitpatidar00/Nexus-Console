SET SESSION cte_max_recursion_depth = 5000;
CREATE TABLE customers (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, name VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP) COMMENT = 'People who buy things';
CREATE TABLE products (id INT AUTO_INCREMENT PRIMARY KEY, sku VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL, attributes JSON);
CREATE TABLE orders (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL COMMENT 'buyer',
  status ENUM('pending','paid','shipped') NOT NULL DEFAULT 'pending', note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  INDEX idx_customer_created (customer_id, created_at));
CREATE TABLE order_items (order_id BIGINT UNSIGNED NOT NULL, product_id INT NOT NULL, qty INT NOT NULL,
  PRIMARY KEY (order_id, product_id), FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id));
CREATE VIEW recent_orders AS SELECT id, customer_id, status FROM orders WHERE created_at > NOW() - INTERVAL 30 DAY;
INSERT INTO customers (email, name)
  WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 300)
  SELECT CONCAT('buyer', n, '@example.com'), IF(n % 5 = 0, NULL, CONCAT('Buyer ', n)) FROM seq;
INSERT INTO products (sku, name, price, attributes)
  WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 80)
  SELECT CONCAT('M-', n), CONCAT('Gadget ', n), 9.99 + n, JSON_OBJECT('color', ELT(1 + n % 3, 'red', 'blue', 'black')) FROM seq;
INSERT INTO orders (customer_id, status, note)
  WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 1500)
  SELECT 1 + n % 300, ELT(1 + n % 3, 'pending', 'paid', 'shipped'), IF(n % 11 = 0, 'Gift wrap\nplease', NULL) FROM seq;
INSERT INTO order_items SELECT id, 1 + id % 80, 1 + id % 4 FROM orders;
