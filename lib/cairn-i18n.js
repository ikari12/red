/**
 * CAIRN demo HTML i18n — loads external locale definition JSON.
 *
 * Layout (under /demo/i18n/):
 *   manifest.json
 *   locales/{lang}/{page}.json   // { mode, pivot, messages: { pivotText: translated } }
 *
 * Usage:
 *   <script src="/demo/lib/cairn-i18n.js"></script>
 *   <script>CairnI18nBoot({ page: "sling" });</script>
 *
 * Add a language later: drop locales/fr/{page}.json and register "fr" in manifest.json.
 * No Translate API — static dictionaries only.
 */
(function (global) {
  "use strict";

  var BASE = "/demo/i18n";
  var _manifest = null;
  var _api = null;

  function normalize(v, supported) {
    if (!v) return null;
    v = String(v).trim().toLowerCase().replace("_", "-");
    if (supported && supported.indexOf(v) !== -1) return v;
    var primary = v.split("-")[0];
    if (supported && supported.indexOf(primary) !== -1) return primary;
    if (supported) {
      for (var i = 0; i < supported.length; i++) {
        if (v.indexOf(supported[i]) === 0) return supported[i];
      }
    }
    return null;
  }

  function cookieGet(name) {
    try {
      var parts = document.cookie.split(";");
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (p.indexOf(name + "=") === 0) {
          return decodeURIComponent(p.slice(name.length + 1));
        }
      }
    } catch (e) {}
    return null;
  }

  function cookieSet(name, lang) {
    try {
      document.cookie =
        name +
        "=" +
        encodeURIComponent(lang) +
        "; Path=/; Max-Age=" +
        365 * 24 * 3600 +
        "; SameSite=Lax";
    } catch (e) {}
  }

  function supportedCodes(manifest) {
    return Object.keys((manifest && manifest.languages) || {});
  }

  function resolveLang(manifest) {
    var supported = supportedCodes(manifest);
    var fallback = (manifest && manifest.default) || "ja";
    var cookieName = (manifest && manifest.cookie) || "cairn_demo_lang";
    try {
      var q = new URLSearchParams(location.search).get("lang");
      var n = normalize(q, supported);
      if (n) return n;
    } catch (e) {}
    var c = normalize(cookieGet(cookieName), supported);
    if (c) return c;
    try {
      var nav = (navigator.language || navigator.userLanguage || "").toLowerCase();
      var fromNav = normalize(nav, supported);
      if (fromNav) return fromNav;
    } catch (e2) {}
    return fallback;
  }

  function setLang(lang, manifest) {
    var supported = supportedCodes(manifest);
    lang = normalize(lang, supported) || (manifest && manifest.default) || "ja";
    cookieSet((manifest && manifest.cookie) || "cairn_demo_lang", lang);
    try {
      var url = new URL(location.href);
      url.searchParams.set("lang", lang);
      location.href = url.toString();
    } catch (e) {
      location.search = "lang=" + encodeURIComponent(lang);
    }
  }

  function sortedKeys(map) {
    return Object.keys(map || {}).sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function replaceAll(text, map, keys) {
    if (!text || !map) return text;
    if (!/[\u3040-\u9fff]/.test(text) && !keys.some(function (k) { return text.indexOf(k) !== -1; })) {
      // Still allow non-JP pivots in the future
      var hit = false;
      for (var i = 0; i < keys.length; i++) {
        if (text.indexOf(keys[i]) !== -1) { hit = true; break; }
      }
      if (!hit) return text;
    }
    var out = text;
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (!k || out.indexOf(k) === -1) continue;
      var v = map[k];
      if (v == null || v === "") continue;
      out = out.split(k).join(v);
    }
    return out;
  }

  function applyToElement(root, map, keys) {
    if (!root || !map) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var parent = node.parentElement;
      if (parent) {
        var tag = (parent.tagName || "").toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript") continue;
      }
      var raw = node.nodeValue;
      var next = replaceAll(raw, map, keys);
      if (next !== raw) node.nodeValue = next;
    }
    var attrs = ["placeholder", "title", "aria-label", "alt", "value"];
    var els = root.querySelectorAll(
      "[placeholder],[title],[aria-label],[alt],input[value],button[value]"
    );
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      for (var a = 0; a < attrs.length; a++) {
        var name = attrs[a];
        if (!el.hasAttribute(name) && !(name === "value" && "value" in el)) continue;
        var cur =
          name === "value" && el.tagName === "INPUT"
            ? el.value
            : el.getAttribute(name);
        if (!cur) continue;
        var neu = replaceAll(cur, map, keys);
        if (neu !== cur) {
          if (name === "value" && el.tagName === "INPUT") el.value = neu;
          else el.setAttribute(name, neu);
        }
      }
    }
    if (root === document.body || root === document.documentElement) {
      var t = document.querySelector("title");
      if (t && t.textContent) {
        var nt = replaceAll(t.textContent, map, keys);
        if (nt !== t.textContent) t.textContent = nt;
      }
    }
  }

  function injectToggle(lang, manifest) {
    if (document.getElementById("cairn-i18n-toggle")) return;
    var langs = (manifest && manifest.languages) || {};
    var codes = Object.keys(langs);
    if (!codes.length) return;
    var wrap = document.createElement("div");
    wrap.id = "cairn-i18n-toggle";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Language");
    wrap.style.cssText =
      "position:fixed;top:10px;right:10px;z-index:99999;display:flex;" +
      "border-radius:10px;overflow:hidden;border:1px solid rgba(56,189,248,0.45);" +
      "background:rgba(15,23,42,0.92);backdrop-filter:blur(10px);" +
      "box-shadow:0 6px 20px rgba(0,0,0,0.35);font-family:system-ui,sans-serif;";
    codes.forEach(function (code) {
      var meta = langs[code] || {};
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = meta.shortLabel || code.toUpperCase();
      b.title = meta.nativeName || code;
      b.style.cssText =
        "border:none;cursor:pointer;padding:7px 12px;font-size:12px;font-weight:700;" +
        (lang === code
          ? "background:rgba(2,132,199,0.9);color:#fff;"
          : "background:transparent;color:#94a3b8;");
      b.addEventListener("click", function () {
        setLang(code, manifest);
      });
      wrap.appendChild(b);
    });
    document.body.appendChild(wrap);
  }

  function localeUrl(manifest, lang, page) {
    var tpl =
      (manifest.pages && manifest.pages[page] && manifest.pages[page].file) ||
      "locales/{lang}/" + page + ".json";
    return BASE + "/" + tpl.replace("{lang}", encodeURIComponent(lang));
  }

  function fetchJson(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("i18n fetch failed: " + url + " (" + res.status + ")");
      return res.json();
    });
  }

  function activate(lang, manifest, messages) {
    var defaultLang = (manifest && manifest.default) || "ja";
    var api = {
      lang: lang,
      manifest: manifest,
      setLang: function (code) {
        setLang(code, manifest);
      },
      t: function (src) {
        if (lang === defaultLang || !messages) return src;
        if (messages[src] != null && messages[src] !== "") return messages[src];
        return replaceAll(src, messages, sortedKeys(messages));
      },
      apply: function (root) {
        if (lang === defaultLang || !messages) return;
        applyToElement(root || document.body, messages, sortedKeys(messages));
      },
    };
    _api = api;
    global.CairnI18n = api;

    function start() {
      try {
        document.documentElement.lang = lang;
      } catch (e) {}
      injectToggle(lang, manifest);
      if (lang !== defaultLang && messages) {
        var keys = sortedKeys(messages);
        applyToElement(document.body, messages, keys);
        var title = document.querySelector("title");
        if (title) {
          var nt = replaceAll(title.textContent || "", messages, keys);
          if (nt) title.textContent = nt;
        }
        var timer = null;
        try {
          var obs = new MutationObserver(function () {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
              applyToElement(document.body, messages, keys);
            }, 80);
          });
          obs.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
          });
        } catch (e2) {}
        try {
          var _alert = global.alert;
          global.alert = function (msg) {
            return _alert.call(global, api.t(String(msg == null ? "" : msg)));
          };
          var _confirm = global.confirm;
          global.confirm = function (msg) {
            return _confirm.call(global, api.t(String(msg == null ? "" : msg)));
          };
        } catch (e3) {}
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
    return api;
  }

  function boot(opts) {
    opts = opts || {};
    var page = opts.page;
    if (!page) {
      console.warn("CairnI18nBoot: opts.page is required");
      return null;
    }
    return fetchJson(BASE + "/manifest.json")
      .then(function (manifest) {
        _manifest = manifest;
        var lang = resolveLang(manifest);
        var defaultLang = manifest.default || "ja";
        if (lang === defaultLang) {
          return activate(lang, manifest, null);
        }
        var url = localeUrl(manifest, lang, page);
        return fetchJson(url)
          .then(function (payload) {
            var messages =
              (payload && (payload.messages || payload.map || payload)) || {};
            if (payload && payload.messages) messages = payload.messages;
            return activate(lang, manifest, messages);
          })
          .catch(function (err) {
            console.warn("CairnI18n: locale missing, staying on default", err);
            return activate(defaultLang, manifest, null);
          });
      })
      .catch(function (err) {
        console.warn("CairnI18n: manifest load failed", err);
        return null;
      });
  }

  global.CairnI18nBoot = boot;
})(typeof window !== "undefined" ? window : this);
