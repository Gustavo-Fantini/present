from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_BASE = "https://freeisland.onrender.com"
EXPECTED_TAG = os.getenv("AMAZON_ASSOCIATE_TAG", "freeislandt0b-20").strip()
DISCLOSURE = (
    "Como participante do Programa de Associados da Amazon, "
    "sou remunerado pelas compras qualificadas efetuadas."
)
LEGACY_TAGS = ("freeisland01-20", "freeislandt0e-20", "freeisland0de-20")
ARTICLE_FILES = (
    "guias/como-identificar-preco-real.html",
    "guias/como-validar-cupom.html",
    "guias/vendedor-garantia-marketplace.html",
    "guias/escolher-processador.html",
    "guias/comparar-placa-de-video.html",
    "guias/escolher-monitor.html",
    "guias/comparar-ssd.html",
    "guias/escolher-perifericos.html",
    "guias/montar-pc-equilibrado.html",
    "guias/checklist-compra-online.html",
)
CORE_FILES = (
    "index.html",
    "guias.html",
    "ofertas.html",
    "sobre.html",
    "politica-editorial.html",
    "privacidade.html",
    "termos.html",
    "contato.html",
)
HTML_FILES = CORE_FILES + ARTICLE_FILES


class SiteParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.links: list[dict[str, str]] = []
        self.images: list[str] = []
        self.scripts: list[str] = []
        self.canonical = ""
        self.description = ""
        self.robots = ""
        self.dates: list[str] = []
        self._anchor: dict[str, Any] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.casefold(): str(value or "") for key, value in attrs}
        normalized = tag.casefold()
        if normalized == "a":
            self._anchor = {"href": values.get("href", ""), "rel": values.get("rel", ""), "text": []}
        elif normalized == "img":
            self.images.append(values.get("src", ""))
        elif normalized == "script" and values.get("src"):
            self.scripts.append(values["src"])
        elif normalized == "link" and values.get("rel", "").casefold() == "canonical":
            self.canonical = values.get("href", "")
        elif normalized == "meta":
            name = values.get("name", "").casefold()
            if name == "description":
                self.description = values.get("content", "")
            elif name == "robots":
                self.robots = values.get("content", "")
        elif normalized == "time" and values.get("datetime"):
            self.dates.append(values["datetime"])

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() == "a" and self._anchor is not None:
            self.links.append(
                {
                    "href": str(self._anchor["href"]),
                    "rel": str(self._anchor["rel"]),
                    "text": " ".join(self._anchor["text"]).strip(),
                }
            )
            self._anchor = None

    def handle_data(self, data: str) -> None:
        cleaned = re.sub(r"\s+", " ", data).strip()
        if not cleaned:
            return
        self.text_parts.append(cleaned)
        if self._anchor is not None:
            self._anchor["text"].append(cleaned)

    @property
    def text(self) -> str:
        return " ".join(self.text_parts)


def expected_canonical(relative: str) -> str:
    if relative == "index.html":
        return f"{PUBLIC_BASE}/"
    return f"{PUBLIC_BASE}/{relative}"


def parse_page(path: Path) -> SiteParser:
    parser = SiteParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def word_count(text: str) -> int:
    return len(re.findall(r"[\wÀ-ÿ]+", text, flags=re.UNICODE))


def amazon_host(hostname: str | None) -> bool:
    host = str(hostname or "").casefold().removeprefix("www.")
    return host in {"amazon.com.br", "amazon.com"}


def resolve_local_link(source: str, href: str) -> Path | None:
    value = str(href or "").strip()
    if not value or value.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    parsed = urlsplit(value)
    if parsed.scheme in {"http", "https"}:
        if parsed.hostname != "freeisland.onrender.com":
            return None
        value = parsed.path
    elif parsed.scheme or parsed.netloc:
        return None
    else:
        value = parsed.path
    if re.fullmatch(r"/[A-Za-z0-9-]+/(?:meli|amzn|shopee|ali|kabum|adidas|terabyte|netshoes)/?", value):
        return None
    if value in {"", "/"}:
        return ROOT / "index.html"
    if value.startswith("/"):
        target = ROOT / value.lstrip("/")
    else:
        target = ROOT / Path(source).parent / value
    if target.suffix == "":
        target = target / "index.html"
    return target.resolve()


def audit_local() -> dict[str, Any]:
    errors: list[str] = []
    pages: dict[str, SiteParser] = {}
    amazon_links = 0
    local_links = 0
    today = datetime.now(timezone.utc).date()

    for relative in HTML_FILES:
        path = ROOT / relative
        if not path.is_file():
            errors.append(f"missing_page:{relative}")
            continue
        page = parse_page(path)
        pages[relative] = page
        if page.canonical != expected_canonical(relative):
            errors.append(f"invalid_canonical:{relative}")
        if len(page.description.strip()) < 60:
            errors.append(f"short_meta_description:{relative}")
        if "noindex" in page.robots.casefold():
            errors.append(f"page_not_indexable:{relative}")
        if "privacy-consent.js" not in " ".join(page.scripts):
            errors.append(f"consent_loader_missing:{relative}")
        if any(re.search(r"(?:^|/)fi\.js(?:[?#]|$)|meta-events\.js", script) for script in page.scripts):
            errors.append(f"optional_analytics_loaded_without_consent:{relative}")

        page_has_amazon = False
        for link in page.links:
            href = link["href"]
            parsed = urlsplit(href)
            if amazon_host(parsed.hostname):
                page_has_amazon = True
                amazon_links += 1
                tags = parse_qs(parsed.query, keep_blank_values=True).get("tag", [])
                if tags != [EXPECTED_TAG]:
                    errors.append(f"invalid_amazon_tag:{relative}:{href}")
                rel = set(link["rel"].casefold().split())
                if not {"sponsored", "noopener"}.issubset(rel):
                    errors.append(f"amazon_rel_missing:{relative}:{href}")
                if "amazon.com.br" not in link["text"].casefold():
                    errors.append(f"amazon_destination_unclear:{relative}:{href}")
            target = resolve_local_link(relative, href)
            if target is not None:
                local_links += 1
                try:
                    target.relative_to(ROOT.resolve())
                except ValueError:
                    errors.append(f"local_link_escapes_root:{relative}:{href}")
                else:
                    if not target.is_file():
                        errors.append(f"broken_local_link:{relative}:{href}")

        if page_has_amazon and DISCLOSURE not in page.text:
            errors.append(f"amazon_disclosure_missing:{relative}")
        if any(amazon_host(urlsplit(source).hostname) for source in page.images):
            errors.append(f"amazon_image_embedded:{relative}")

    if len(pages) != len(HTML_FILES):
        errors.append("incomplete_public_site")
    if amazon_links < 10:
        errors.append("insufficient_tagged_amazon_links")

    for relative in ARTICLE_FILES:
        page = pages.get(relative)
        if page is None:
            continue
        if word_count(page.text) < 400:
            errors.append(f"thin_article:{relative}")
        article_dates: list[date] = []
        for raw_date in page.dates:
            try:
                article_dates.append(date.fromisoformat(raw_date[:10]))
            except ValueError:
                continue
        if not article_dates:
            errors.append(f"publication_date_missing:{relative}")
            continue
        publication_date = min(article_dates)
        age = (today - publication_date).days
        if age < 0 or age > 60:
            errors.append(f"article_not_recent:{relative}:{age}")

    home = pages.get("index.html")
    if home is not None and word_count(home.text) < 450:
        errors.append("homepage_static_content_too_short")
    guide_index = pages.get("guias.html")
    if guide_index is not None:
        indexed_articles = {
            urlsplit(link["href"]).path
            for link in guide_index.links
            if urlsplit(link["href"]).path.startswith("guias/")
        }
        if len(indexed_articles.intersection(ARTICLE_FILES)) != len(ARTICLE_FILES):
            errors.append("guide_index_incomplete")

    offers = pages.get("ofertas.html")
    if offers is not None and re.search(r"R\$\s*\d", offers.text, flags=re.IGNORECASE):
        errors.append("manual_amazon_price_detected")

    for relative in ("index.html", "ofertas.html", *ARTICLE_FILES, "r/redirect.js"):
        content = (ROOT / relative).read_text(encoding="utf-8")
        for legacy in LEGACY_TAGS:
            if legacy in content:
                errors.append(f"legacy_tag:{relative}:{legacy}")

    redirect_page = (ROOT / "r/index.html").read_text(encoding="utf-8")
    if DISCLOSURE not in redirect_page:
        errors.append("redirect_disclosure_missing")
    if '/r/redirect.js?v=20260901_1' not in redirect_page:
        errors.append("redirect_cache_version_stale")

    sitemap_path = ROOT / "sitemap.xml"
    if not sitemap_path.is_file():
        errors.append("sitemap_missing")
    else:
        sitemap = sitemap_path.read_text(encoding="utf-8")
        for relative in HTML_FILES:
            if expected_canonical(relative) not in sitemap:
                errors.append(f"sitemap_page_missing:{relative}")

    return {
        "ok": not errors,
        "tracking_tag": EXPECTED_TAG,
        "pages_checked": len(pages),
        "articles_checked": sum(1 for item in ARTICLE_FILES if item in pages),
        "amazon_links_checked": amazon_links,
        "local_links_checked": local_links,
        "errors": errors,
    }


def fetch_live(url: str) -> tuple[int, dict[str, str], str, str]:
    request = Request(url, headers={"User-Agent": "FreeIslandComplianceAudit/1.0"})
    context = ssl.create_default_context()
    try:
        with urlopen(request, timeout=20, context=context) as response:
            body = response.read(2_000_000).decode("utf-8", errors="replace")
            return response.status, dict(response.headers.items()), body, response.geturl()
    except HTTPError as error:
        return error.code, dict(error.headers.items()), "", error.geturl()
    except (URLError, TimeoutError, OSError) as error:
        return 0, {}, str(error), url


def audit_live(base_url: str) -> dict[str, Any]:
    base = str(base_url or "").rstrip("/")
    errors: list[str] = []
    checked = 0
    for relative in HTML_FILES:
        path = "/" if relative == "index.html" else f"/{relative}"
        status, headers, body, final_url = fetch_live(f"{base}{path}")
        checked += 1
        if status != 200:
            errors.append(f"live_http_status:{relative}:{status}")
            continue
        if not final_url.startswith("https://"):
            errors.append(f"live_not_https:{relative}")
        if "noindex" in str(headers.get("X-Robots-Tag", "")).casefold():
            errors.append(f"live_noindex:{relative}")
        if "<html" not in body.casefold():
            errors.append(f"live_not_html:{relative}")
    status, _, body, _ = fetch_live(f"{base}/r/")
    checked += 1
    if status != 200:
        errors.append(f"live_http_status:r/index.html:{status}")
    else:
        if DISCLOSURE not in body:
            errors.append("live_redirect_disclosure_missing")
        if '/r/redirect.js?v=20260901_1' not in body:
            errors.append("live_redirect_cache_version_stale")
    status, headers, _, final_url = fetch_live(f"{base}/")
    if status == 200 and not any(key.casefold() == "strict-transport-security" for key in headers):
        errors.append("hsts_header_missing")
    if urlsplit(final_url).hostname != urlsplit(base).hostname:
        errors.append("unexpected_live_host")
    return {"ok": not errors, "pages_checked": checked, "errors": errors}


def main() -> int:
    parser = argparse.ArgumentParser(description="Audita a landing para a revisão do Programa de Associados Amazon.")
    parser.add_argument("--base-url", default="", help="Também valida a versão publicada por HTTPS.")
    parser.add_argument("--output", type=Path, help="Salva o relatório JSON neste caminho.")
    args = parser.parse_args()

    if not re.fullmatch(r"[A-Za-z0-9_-]{3,64}-20", EXPECTED_TAG):
        print(json.dumps({"ok": False, "error": "invalid_expected_tag"}, ensure_ascii=False, indent=2))
        return 1

    report: dict[str, Any] = {"generated_at": datetime.now(timezone.utc).isoformat(), "local": audit_local()}
    if args.base_url:
        report["live"] = audit_live(args.base_url)
    report["ok"] = all(value.get("ok") is True for value in report.values() if isinstance(value, dict))
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
