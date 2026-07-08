"""GitHub Dependency Graph(SBOM)から依存関係を収集し、非推奨状態を判定する

仕様書セクション6.2「Dependency Graph SBOM取得」に対応。
非推奨判定はPyPI/npmレジストリの公開APIを使う(いずれも公開情報、認証不要)。
"""
import logging
import re

import requests
from sqlalchemy.orm import Session

from src.db.models import Repository, Dependency

logger = logging.getLogger(__name__)

# SPDXのpurl形式例: pkg:pypi/requests@2.31.0, pkg:npm/react@18.3.1, pkg:npm/%40babel/core@7.24.0
_PURL_RE = re.compile(r"^pkg:(?P<ecosystem>[^/]+)/(?P<name>.+)@(?P<version>[^?]+)")


def parse_purl(purl: str) -> dict | None:
    """Package URL(purl)文字列を ecosystem/name/version に分解する"""
    match = _PURL_RE.match(purl)
    if not match:
        return None
    ecosystem = match.group("ecosystem")
    name = match.group("name")
    version = match.group("version")
    # npmのスコープ付きパッケージは %40babel%2Fcore のようにURLエンコードされることがある
    name = name.replace("%2F", "/").replace("%40", "@")
    return {"ecosystem": ecosystem, "name": name, "version": version}


def extract_packages_from_sbom(sbom_json: dict) -> list[dict]:
    """GitHub SBOM APIのレスポンス(SPDX形式)からパッケージ一覧を抽出する"""
    packages = sbom_json.get("sbom", {}).get("packages", [])
    result = []
    for pkg in packages:
        external_refs = pkg.get("externalRefs", [])
        purl = next(
            (ref["referenceLocator"] for ref in external_refs if ref.get("referenceType") == "purl"),
            None,
        )
        if not purl:
            continue
        parsed = parse_purl(purl)
        if parsed:
            result.append(parsed)
    return result


def is_npm_package_deprecated(name: str, session: requests.Session | None = None) -> tuple[bool, bool]:
    """npmレジストリで最新バージョンが非推奨(deprecatedフィールドあり)か確認する

    戻り値: (is_deprecated, checked)。checked=Falseはレジストリ照会に失敗し判定不能だったことを示す。
    """
    session = session or requests.Session()
    try:
        resp = session.get(f"https://registry.npmjs.org/{name}", timeout=15)
        if resp.status_code != 200:
            return False, False
        data = resp.json()
        latest_tag = data.get("dist-tags", {}).get("latest")
        version_info = data.get("versions", {}).get(latest_tag, {})
        return bool(version_info.get("deprecated")), True
    except requests.RequestException as e:
        logger.warning("npmレジストリ確認に失敗(%s): %s", name, e)
        return False, False


def is_pypi_package_deprecated(name: str, session: requests.Session | None = None) -> tuple[bool, bool]:
    """PyPIで最新リリースがyanked(取り下げ)されていないか確認する(≒非推奨扱い)

    戻り値: (is_deprecated, checked)。checked=FalseはPyPI照会に失敗し判定不能だったことを示す。
    """
    session = session or requests.Session()
    try:
        resp = session.get(f"https://pypi.org/pypi/{name}/json", timeout=15)
        if resp.status_code != 200:
            return False, False
        data = resp.json()
        latest_version = data.get("info", {}).get("version")
        releases = data.get("releases", {}).get(latest_version, [])
        return bool(releases) and all(r.get("yanked", False) for r in releases), True
    except requests.RequestException as e:
        logger.warning("PyPI確認に失敗(%s): %s", name, e)
        return False, False


def check_deprecated(ecosystem: str, name: str, session: requests.Session | None = None) -> tuple[bool, bool]:
    """戻り値: (is_deprecated, checked)。未対応エコシステムはchecked=Falseで判定不能を明示する"""
    ecosystem = ecosystem.lower()
    if ecosystem == "npm":
        return is_npm_package_deprecated(name, session)
    if ecosystem == "pypi":
        return is_pypi_package_deprecated(name, session)
    return False, False


def collect_dependencies(
    session: Session,
    github_client,
    repo: Repository,
    max_packages: int = 20,
    check_deprecation: bool = True,
) -> int:
    """SBOMを取得し、依存関係をDBに保存する。戻り値は保存件数"""
    sbom = github_client.get_sbom(repo.owner, repo.name)
    packages = extract_packages_from_sbom(sbom)[:max_packages]

    # 既存レコードは洗い替え
    session.query(Dependency).filter_by(repo_id=repo.id).delete()

    http_session = requests.Session()
    saved = 0
    for pkg in packages:
        deprecated, checked = (False, False)
        if check_deprecation:
            deprecated, checked = check_deprecated(pkg["ecosystem"], pkg["name"], http_session)
        session.add(
            Dependency(
                repo_id=repo.id,
                package_name=pkg["name"],
                ecosystem=pkg["ecosystem"],
                version=pkg["version"],
                is_deprecated=deprecated,
                deprecation_checked=checked,
            )
        )
        saved += 1
    session.commit()
    logger.info("%s: 依存関係 %d件を保存(非推奨チェック=%s)", repo.full_name, saved, check_deprecation)
    return saved
