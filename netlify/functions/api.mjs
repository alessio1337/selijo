// Seljo – API pe Netlify Functions, cu date și fișiere în Netlify Blobs.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: "/api/*" };

const S = (name) => getStore({ name, consistency: "strong" });
const STATUS = ["nouă", "în producție", "gata", "livrată", "anulată"];
const MAX_FILE = 4 * 1024 * 1024; // limita Netlify Functions: ~6 MB per cerere (base64 mărește fișierul cu ~33%)
const SEED_V = 2;
const SEED = [
  { id: "banner", name: "Banner personalizat", m2: 61.71, min: 61.71, fin: true, desc: "PVC frontlit 440 g/m², print de calitate, tiv ranforsat și capse metalice. Pentru interior și exterior." },
  { id: "blockout", name: "Banner blockout dublă față", m2: 80.6, min: 80.6, fin: true, desc: "Banner opac, cu imagine pe ambele fețe, pentru montaj suspendat." },
  { id: "mesh", name: "Mesh publicitar", m2: 67.69, min: 67.69, fin: true, desc: "Plasă perforată pentru garduri, schele și fațade, lasă vântul să treacă." },
  { id: "colant", name: "Autocolant personalizat", m2: 72.52, min: 72.52, desc: "Folie autocolantă imprimată, tăiată la dimensiune, pentru interior și exterior." },
  { id: "removable", name: "Autocolant detașabil", m2: 153.13, min: 153.13, desc: "Se desprinde curat, fără urme, potrivit pentru pereți și suprafețe sensibile." },
  { id: "afise", name: "Afișe publicitare", m2: 59.29, min: 59.29, desc: "Afișe imprimate pentru promoții, evenimente și vitrine." },
  { id: "window", name: "Autocolant window graphics", m2: 85, desc: "Folii pentru vitrine și geamuri: imprimate, perforate sau mate." },
  { id: "rollup", name: "Roll-up 85 × 200 cm", fixed: 199.99, fw: 85, fh: 200, desc: "Sistem de expunere cu print inclus și geantă de transport." },
  { id: "rollup100", name: "Roll-up 100 × 200 cm", fixed: 259.99, fw: 100, fh: 200, desc: "Varianta mai lată, cu print inclus și geantă de transport." },
  { id: "sticker", name: "Stickere personalizate", m2: 120, min: 25, desc: "Stickere decupate în orice formă, pentru ambalaje și promovare." },
  { id: "auto", name: "Branding auto", m2: 120, desc: "Colanturi pentru mașini și flote: portiere, lunetă, wrap parțial." },
].map((p, sort) => ({ m2: null, fixed: null, min: null, fin: false, fw: null, fh: null, img: null, desc: "", active: true, sort, ...p }));

const json = (o, code = 200, h = {}) =>
  new Response(JSON.stringify(o), { status: code, headers: { "Content-Type": "application/json; charset=utf-8", ...h } });
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const secret = () => process.env.SESSION_SECRET || sha("seljo|" + (process.env.ADMIN_PASSWORD || "")).toString("hex");
const sign = (s) => crypto.createHmac("sha256", secret()).update(s).digest("hex");
const authed = (req) => {
  const m = /(?:^|; )sid=(\d+)\.([a-f0-9]+)/.exec(req.headers.get("cookie") || "");
  return !!m && Number(m[1]) > Date.now() && same(m[2], sign(m[1]));
};
const txt = (v, n) => String(v ?? "").slice(0, n);
const num = (v, lo, hi) => { v = Number(v); return Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
const opt = (v, hi) => (v === "" || v == null ? null : num(v, 0, hi));
const price = (p, w, h, q, ex) => Math.round((p.fixed ? p.fixed * q : Math.max((w * h / 10000) * q * p.m2, p.min || 0)) * (ex ? 1.3 : 1) * 100) / 100;
const IMG = /^\/api\/img\/[a-f0-9]+\.(jpg|png|webp)$/;

async function allProducts() {
  const st = S("products"), meta = S("meta");
  if ((await meta.get("seed_v", { type: "json" })) !== SEED_V) {
    await Promise.all(SEED.map(async (p) => { const old = await st.get(p.id, { type: "json" }); await st.setJSON(p.id, { ...p, img: old?.img ?? null }); }));
    await meta.setJSON("seed_v", SEED_V);
  }
  const { blobs } = await st.list();
  const all = await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })));
  return all.filter(Boolean).sort((a, b) => a.sort - b.sort);
}

export default async (req) => {
  try {
    const seg = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const m = req.method;

    if (seg[0] === "products" && m === "GET")
      return json((await allProducts()).filter((p) => p.active).map(({ id, name, m2, fixed, min, fin, fw, fh, desc, img }) => ({ id, name, m2, fixed, min, fin, fw, fh, desc, img })));

    if (seg[0] === "img" && m === "GET") {
      const key = txt(seg[1], 40);
      if (!/^[a-f0-9]+\.(jpg|png|webp)$/.test(key)) return json({ error: "Negăsit" }, 404);
      const f = await S("images").get(key, { type: "arrayBuffer" });
      if (!f) return json({ error: "Negăsit" }, 404);
      return new Response(f, { headers: { "Content-Type": { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[key.split(".")[1]], "Cache-Control": "public, max-age=31536000, immutable" } });
    }

    if (seg[0] === "orders" && m === "POST") {
      const b = await req.json();
      const pr = (await allProducts()).find((p) => p.id === txt(b.product, 40) && p.active);
      const q = num(b.qty, 1, 1000), w = pr?.fixed ? pr.fw || 85 : num(b.w, 1, 2000), h = pr?.fixed ? pr.fh || 200 : num(b.h, 1, 2000);
      if (!pr || !q || !w || !h || !txt(b.name, 100).trim()) return json({ error: "Date invalide." }, 400);
      let fileKey = null, fileName = null;
      if (b.file?.data) {
        const ext = (/\.(jpe?g|png|pdf|ai|psd|cdr|eps|webp|gif)$/i.exec(txt(b.file.name, 120)) || [])[0];
        const buf = Buffer.from(String(b.file.data), "base64");
        if (!ext) return json({ error: "Tip de fișier nepermis." }, 400);
        if (buf.length > MAX_FILE) return json({ error: "Fișier prea mare (max 4 MB). Trimite-l pe WhatsApp." }, 413);
        fileKey = crypto.randomBytes(12).toString("hex") + ext.toLowerCase();
        fileName = txt(b.file.name, 120);
        await S("files").set(fileKey, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      }
      const meta = S("meta");
      const n = ((await meta.get("counter", { type: "json" })) || 0) + 1;
      await meta.setJSON("counter", n);
      const express = !!b.express, total = price(pr, w, h, q, express);
      await S("orders").setJSON(String(n).padStart(6, "0"), {
        id: n, created: new Date().toISOString(), name: txt(b.name, 100), phone: txt(b.phone, 30),
        product_id: pr.id, product_name: pr.name, dim: `${w} × ${h} cm`, qty: q, finish: txt(b.finish, 80),
        design: txt(b.design, 120), note: txt(b.note, 1000), total, status: "nouă", express, file_name: fileName, file_key: fileKey,
      });
      return json({ ok: true, id: n, total });
    }

    if (seg[0] === "login" && m === "POST") {
      const b = await req.json();
      const pass = process.env.ADMIN_PASSWORD;
      if (!pass) return json({ error: "ADMIN_PASSWORD nu este setată în Netlify." }, 500);
      if (!same(b.password, pass)) { await new Promise((r) => setTimeout(r, 800)); return json({ error: "Parolă greșită." }, 401); }
      const e = String(Date.now() + 12 * 3600e3);
      return json({ ok: true }, 200, { "Set-Cookie": `sid=${e}.${sign(e)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` });
    }

    if (seg[0] !== "admin") return json({ error: "Negăsit" }, 404);
    if (!authed(req)) return json({ error: "Neautentificat" }, 401);
    const [, what, id, sub] = seg;

    if (what === "images" && m === "POST") {
      const b = await req.json();
      const buf = Buffer.from(String(b.data || ""), "base64");
      if (buf.length < 10 || buf.length > MAX_FILE) return json({ error: "Imagine invalidă sau prea mare." }, 400);
      const kind = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : buf[0] === 0x89 && buf[1] === 0x50 ? "png" : buf.subarray(0, 4).toString() === "RIFF" ? "webp" : null;
      if (!kind) return json({ error: "Format imagine nepermis." }, 400);
      const key = crypto.randomBytes(10).toString("hex") + "." + kind;
      await S("images").set(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      return json({ ok: true, url: "/api/img/" + key });
    }

    if (what === "orders") {
      const st = S("orders");
      if (m === "GET" && !id) {
        const { blobs } = await st.list();
        const all = (await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })))).filter(Boolean);
        return json(all.sort((a, b) => b.id - a.id).map(({ file_key, ...o }) => ({ ...o, has_file: !!file_key })));
      }
      const key = String(id || "").replace(/\D/g, "").padStart(6, "0");
      const o = await st.get(key, { type: "json" });
      if (!o) return json({ error: "Comandă inexistentă" }, 404);
      if (m === "GET" && sub === "file") {
        const f = o.file_key && (await S("files").get(o.file_key, { type: "arrayBuffer" }));
        if (!f) return json({ error: "Fără fișier" }, 404);
        return new Response(f, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(o.file_name)}` } });
      }
      if (m === "PATCH") {
        const b = await req.json();
        if (!STATUS.includes(b.status)) return json({ error: "Status invalid" }, 400);
        await st.setJSON(key, { ...o, status: b.status });
        return json({ ok: true });
      }
      if (m === "DELETE") {
        if (o.file_key) await S("files").delete(o.file_key);
        await st.delete(key);
        return json({ ok: true });
      }
    }

    if (what === "products") {
      const st = S("products");
      if (m === "GET" && !id) return json(await allProducts());
      if (m === "DELETE") { await st.delete(txt(id, 40)); return json({ ok: true }); }
      if (m === "POST" || m === "PUT") {
        const b = await req.json();
        const pid = m === "POST" ? txt(b.id, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "") : txt(id, 40);
        const name = txt(b.name, 80).trim();
        if (!pid || !name) return json({ error: "ID și nume obligatorii" }, 400);
        const m2 = opt(b.m2, 100000), fixed = opt(b.fixed, 1e6), min = opt(b.min, 1e6);
        if (m2 == null && fixed == null) return json({ error: "Completează prețul pe m² sau prețul fix" }, 400);
        if (m === "POST" && (await st.get(pid, { type: "json" }))) return json({ error: "ID existent" }, 400);
        const fw = opt(b.fw, 5000), fh = opt(b.fh, 5000), img = IMG.test(String(b.img || "")) ? b.img : null;
        await st.setJSON(pid, { id: pid, name, m2, fixed, min, fw, fh, desc: txt(b.desc, 300), img, fin: !!b.fin, active: m === "POST" ? b.active !== 0 : !!b.active, sort: Number(b.sort) || 0 });
        return json({ ok: true });
      }
    }
    return json({ error: "Negăsit" }, 404);
  } catch (e) {
    return json({ error: "Eroare server" }, 500);
  }
};
