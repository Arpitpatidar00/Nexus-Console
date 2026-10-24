// shop: documents with nested objects, arrays, optional fields, and ObjectId
// references (orders.customerId → customers._id) that no schema declares.
const shop = db.getSiblingDB('shop');
const ids = [];
for (let i = 1; i <= 200; i++) {
  const doc = {
    email: `shopper${i}@example.com`,
    name: `Shopper ${i}`,
    createdAt: new Date(Date.now() - i * 3600e3),
  };
  if (i % 3 === 0) doc.address = { city: 'Pune', zip: `4110${i % 10}` };
  if (i % 4 === 0) doc.tags = ['vip', 'beta'];
  if (i % 7 === 0) doc.phone = null;
  ids.push(shop.customers.insertOne(doc).insertedId);
}
shop.customers.createIndex({ email: 1 }, { unique: true });
for (let i = 1; i <= 800; i++) {
  shop.orders.insertOne({
    customerId: ids[i % ids.length],
    status: ['pending', 'paid', 'shipped'][i % 3],
    total: Math.round((10 + i * 1.37) * 100) / 100,
    items: [{ sku: `SKU-${i % 50}`, qty: 1 + (i % 3) }],
    ...(i % 10 === 0 ? { coupon: 'WELCOME10' } : {}),
  });
}
shop.orders.createIndex({ customerId: 1, status: 1 });
shop.products.insertMany(
  Array.from({ length: 60 }, (_, i) => ({
    sku: `SKU-${i}`,
    name: `Item ${i}`,
    price: 5 + i,
    stock: i % 9,
  })),
);
shop.createView('paid_orders', 'orders', [{ $match: { status: 'paid' } }]);
