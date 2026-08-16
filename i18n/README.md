# CAIRN demo locale definitions

External language packs for `/demo/*.html` tools.

## Layout

```
manifest.json                 # default, cookie, supported languages, page index
locales/
  en/
    sling.json                # { "mode":"replace", "pivot":"ja", "messages":{ "日本語":"English", ... } }
    rfd_landing_analyzer.json
    …
  fr/                         # future — same filenames, French values
    sling.json
```

HTML pages keep Japanese as the pivot source text. A locale file maps pivot → target.
The runtime (`/demo/lib/cairn-i18n.js`) loads `manifest.json` then `locales/{lang}/{page}.json`.

## Add a language (e.g. French)

1. Create `locales/fr/` and copy each `locales/en/*.json`.
2. Translate the **values** in `messages` (keys stay Japanese pivot text for now).
3. Register in `manifest.json` → `languages.fr`.
4. Redeploy CAIRN (`cairn-app`). No HTML edits required.

## Add / fix a string

Edit the relevant `locales/{lang}/{page}.json` `messages` entry. Prefer longer phrases as keys so replacements stay unambiguous.
