// Push Notifications via ntfy.sh
// Set NTFY_TOPIC in your .env file (e.g. NTFY_TOPIC=static_orders_omar)
// Install the free ntfy app on your phone, subscribe to the same topic.

async function notifyNewOrder(order) {
  const topic = process.env.NTFY_TOPIC?.trim();
  if (!topic) {
    // Not configured — skip silently
    return;
  }
  if (!order) return;

  try {
    let items = order.items;

    // DB returns JSONB already parsed; fallback: parse if it's a string
    if (typeof items === "string") {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    if (!Array.isArray(items)) items = [];

    let itemsTotal = 0;
    const itemsList = items.map((it) => {
      const qty  = Number(it.quantity ?? it.qty ?? 1);
      const name = it.itemName || it.name || it.item || "Item";
      const price = Number(it.price || 0);
      itemsTotal += price * qty;
      return `${qty}× ${name}`;
    });

    const shipping   = Number(order.shippingPrice || 0);
    const grandTotal = itemsTotal + shipping;

    const lines = [
      `Customer: ${order.customerName || "Customer"} (${order.phone || "No phone"})`,
      itemsList.length ? `Items: ${itemsList.join(", ")}` : null,
      `Total: ${grandTotal.toFixed(2)} EGP`,
      order.address ? `Address: ${order.address}` : null,
    ].filter(Boolean);

    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: {
        "Title":    `New Order #${order.id}`,
        "Priority": "high",
        "Tags":     "package,moneybag",
        "Content-Type": "text/plain",
      },
      body: lines.join("\n"),
    });

    if (res.ok) {
      console.log(`[ntfy] ✓ Push sent for order #${order.id} → ntfy.sh/${topic}`);
    } else {
      const body = await res.text().catch(() => "");
      console.error(`[ntfy] ✗ Push failed (HTTP ${res.status}): ${body}`);
    }
  } catch (err) {
    console.error("[ntfy] ✗ Network error sending push notification:", err.message);
  }
}

module.exports = { notifyNewOrder };
