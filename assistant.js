"use strict";

function registerAssistantRoutes({ app, adminOnly, getProducts, getOrders }) {
  const LOW_STOCK_THRESHOLD = 5;

  app.get("/api/admin/assistant/overview", adminOnly, async (req, res) => {
    try {
      const [products, orders] = await Promise.all([getProducts(false), getOrders()]);
      const safeProducts = Array.isArray(products) ? products : [];
      const safeOrders = Array.isArray(orders) ? orders : [];
      const lowStock = safeProducts
        .filter((p) => p && p.active !== false && Number(p.stock) <= LOW_STOCK_THRESHOLD)
        .map((p) => ({
          id: String(p.id || ""),
          name: String(p.name || "Unnamed product").slice(0, 100),
          stock: Math.max(0, Number(p.stock) || 0),
          active: p.active !== false
        }))
        .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));

      const pendingOrders = safeOrders.filter((o) => o && !["Delivered", "Cancelled"].includes(String(o.status)));
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date());
      const todayOrders = safeOrders.filter((o) => {
        const value = o.createdAt || o.created_at;
        if (!value) return false;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return false;
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit"
        }).format(date) === today;
      }).length;

      res.set("Cache-Control", "no-store").json({
        ok: true,
        generatedAt: new Date().toISOString(),
        mode: "read-only",
        threshold: LOW_STOCK_THRESHOLD,
        metrics: {
          totalProducts: safeProducts.length,
          activeProducts: safeProducts.filter((p) => p && p.active !== false).length,
          lowStockCount: lowStock.length,
          outOfStockCount: lowStock.filter((p) => p.stock === 0).length,
          totalOrders: safeOrders.length,
          pendingOrders: pendingOrders.length,
          todayOrders
        },
        lowStock,
        capabilities: {
          websiteReadAccess: true,
          websiteWriteAccess: false,
          aiProviderConfigured: false,
          voiceEnabled: false
        }
      });
    } catch (error) {
      console.error("Foodora assistant overview failed:", error.message);
      res.status(500).json({ error: "Assistant overview is temporarily unavailable." });
    }
  });
}

module.exports = { registerAssistantRoutes };
