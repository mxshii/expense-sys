// Push Notifications via ntfy.sh
// Topic fallback: 'static_orders_omar' & 'static-orders-alert' (or custom via NTFY_TOPIC env var)

function getTopics() {
  const custom = process.env.NTFY_TOPIC?.trim();
  if (custom) {
    return [custom];
  }
  // Default topics so mobile push alerts work out of the box without needing to configure Vercel env vars
  return ["static_orders_omar", "static-orders-alert"];
}

async function sendNtfyMessage(topic, order) {
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

    // Using JSON body prevents HTTP header encoding / ByteString issues with Unicode or Arabic
    const payload = {
      topic: topic,
      title: `New Order #${order.id}`,
      message: lines.join("\n"),
      priority: 4,
      tags: ["package", "moneybag"],
      click: "https://expense-sys-ten.vercel.app/",
    };

    const res = await fetch("https://ntfy.sh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      console.log(`[ntfy] ✓ Push sent for order #${order.id} → ntfy.sh/${topic}`);
      return { ok: true, topic };
    } else {
      const body = await res.text().catch(() => "");
      console.error(`[ntfy] ✗ Push failed for ${topic} (HTTP ${res.status}): ${body}`);
      return { ok: false, topic, status: res.status, error: body };
    }
  } catch (err) {
    console.error(`[ntfy] ✗ Error pushing to ntfy.sh/${topic}:`, err.message);
    return { ok: false, topic, error: err.message };
  }
}

async function notifyNewOrder(order) {
  if (!order) return { ok: false, reason: "no order" };
  const topics = getTopics();
  if (!topics.length) return { ok: false, reason: "no topics configured" };

  const results = await Promise.allSettled(
    topics.map((t) => sendNtfyMessage(t, order))
  );

  return {
    ok: true,
    topics,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { ok: false, error: r.reason?.message })),
  };
}

module.exports = { notifyNewOrder, getTopics };

