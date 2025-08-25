// ===== popup.js (password support; robust argon2 loader; no auto-copy) =====

// Robust loader: if argon2 isn't on the page, inject it and wait.
const ensureArgon2 = (async () => {
  if (typeof argon2 === "undefined") {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("vendor/argon2/argon2.js");
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load argon2.js"));
      // Put it before this script, or fallback to <head>
      (document.currentScript?.parentNode || document.head).appendChild(s);
    });
  }
  if (typeof argon2 === "undefined") {
    throw new Error("argon2 still undefined after load — check paths and manifest.");
  }
  // Point argon2 at packaged WASM and wait for ready
  argon2.wasmPath = chrome.runtime.getURL("vendor/argon2/argon2.wasm");
  if (argon2 && typeof argon2.ready === "object") {
    await argon2.ready;
  }
})();

// --- small utils ---
const enc = new TextEncoder();
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64url(bytes) {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// HKDF → AES-GCM key
async function hkdfToAesKey(raw /* Uint8Array */) {
  const hkdfKey = await crypto.subtle.importKey("raw", raw.buffer, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", info: enc.encode("qb-v2"), salt: new Uint8Array(0) },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

// Derive AES key; include saltB64 only when a password is provided
async function deriveEncryptionKey(randomKey /* 32B Uint8Array */, passwordText /* string */) {
  if (!passwordText || !passwordText.trim()) {
    const aesKey = await hkdfToAesKey(randomKey);
    return { aesKey, saltB64: null };
  }

  // Ensure argon2 is available (loads script + wasm if needed)
  await ensureArgon2;

  // Match website params exactly
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { hash } = await argon2.hash({
    pass: passwordText,
    salt,                          // Uint8Array(16)
    type: argon2.ArgonType.Argon2id,
    hashLen: 32,
    time: 3,
    mem: 4096,                     // KiB (4 MB)
    parallelism: 1
  });

  const passKey = new Uint8Array(hash); // 32 bytes
  const combined = new Uint8Array(64);  // randomKey || passKey
  combined.set(randomKey, 0);
  combined.set(passKey, 32);

  const aesKey = await hkdfToAesKey(combined);
  return { aesKey, saltB64: b64(salt) };
}

async function qbCreate({ text, ttlSeconds, maxReads, password }) {
  // 1) random key + 12-byte IV
  const randomKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 2) derive AES key (with/without password)
  const { aesKey, saltB64 } = await deriveEncryptionKey(randomKey, password);

  // 3) encrypt
  const pt = enc.encode(text);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, pt);
  const ct = new Uint8Array(ctBuf);

  // 4) payload (only send saltB64 if password present)
  const body = {
    ciphertextB64: b64(ct),
    ivB64: b64(iv),
    ttlSeconds,
    maxReads,
    ...(saltB64 ? { saltB64 } : {})
  };

  // 5) POST
  const res = await fetch("https://quickburn.me/api/secret", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API ${res.status}`);

  const { id } = await res.json();

  // 6) final link (random key in fragment; password is entered by recipient at open)
  const link = `${new URL("https://quickburn.me").origin}/s/${id}#k=${b64url(randomKey)}`;
  return { link };
}

// --- wire popup UI (no auto-copy) ---
(async () => {
  const secretEl = document.getElementById("secret");
  const expiresEl = document.getElementById("expires");
  const readsEl = document.getElementById("reads");
  const pwEl = document.getElementById("password");
  const msgEl = document.getElementById("msg");
  const btn = document.getElementById("create");
  const result = document.getElementById("result");
  const linkBox = document.getElementById("linkbox");
  const copyBtn = document.getElementById("copy");
  const clearBtn = document.getElementById("clear");

  // Prefill from context menu (best-effort)
  try {
    const { qb_text } = await chrome.storage.session.get("qb_text");
    if (qb_text) secretEl.value = qb_text;
  } catch {}

  const ttlMap = { "10m": 600, "1h": 3600, "24h": 86400, "7d": 604800, "30d": 2592000 };

  btn.addEventListener("click", async () => {
    msgEl.textContent = "";
    result.style.display = "none";
    try {
      const text = (secretEl.value || "").trim();
      if (!text) throw new Error("Text required");

      const ttl = ttlMap[expiresEl.value] ?? 86400;
      const reads = parseInt(readsEl.value, 10) || 1;
      const password = (pwEl.value || "").trim();

      const { link } = await qbCreate({ text, ttlSeconds: ttl, maxReads: reads, password });
      linkBox.textContent = link;
      result.style.display = "block";
      msgEl.textContent = password ? "Password-protected link ready." : "Link ready.";
    } catch (e) {
      msgEl.textContent = String(e?.message || e);
    }
  });

  copyBtn.addEventListener("click", async () => {
    const txt = linkBox.textContent || "";
    if (txt) {
      await navigator.clipboard.writeText(txt);
      msgEl.textContent = "Copied.";
    }
  });

  clearBtn.addEventListener("click", () => {
    linkBox.textContent = "";
    result.style.display = "none";
    msgEl.textContent = "";
  });
})();
