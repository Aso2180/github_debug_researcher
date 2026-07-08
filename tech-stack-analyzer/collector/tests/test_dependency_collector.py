import responses

from src.collectors.dependency_collector import (
    parse_purl,
    extract_packages_from_sbom,
    is_npm_package_deprecated,
    is_pypi_package_deprecated,
    collect_dependencies,
)
from src.db.models import Repository
from src.db.session import get_engine, init_db, get_session_factory


def make_session():
    engine = get_engine("sqlite:///:memory:")
    init_db(engine)
    return get_session_factory(engine)()


def test_parse_purl_pypi():
    result = parse_purl("pkg:pypi/requests@2.31.0")
    assert result == {"ecosystem": "pypi", "name": "requests", "version": "2.31.0"}


def test_parse_purl_npm_scoped_package():
    result = parse_purl("pkg:npm/%40babel/core@7.24.0")
    assert result == {"ecosystem": "npm", "name": "@babel/core", "version": "7.24.0"}


def test_parse_purl_invalid_returns_none():
    assert parse_purl("not-a-purl") is None


def test_extract_packages_from_sbom():
    sbom_json = {
        "sbom": {
            "packages": [
                {
                    "name": "requests",
                    "externalRefs": [
                        {"referenceType": "purl", "referenceLocator": "pkg:pypi/requests@2.31.0"}
                    ],
                },
                {
                    "name": "no-purl-package",
                    "externalRefs": [],
                },
            ]
        }
    }
    packages = extract_packages_from_sbom(sbom_json)
    assert len(packages) == 1
    assert packages[0]["name"] == "requests"


@responses.activate
def test_is_npm_package_deprecated_true():
    responses.add(
        responses.GET,
        "https://registry.npmjs.org/left-pad",
        json={
            "dist-tags": {"latest": "1.3.0"},
            "versions": {"1.3.0": {"deprecated": "use String.prototype.padStart() instead"}},
        },
        status=200,
    )
    assert is_npm_package_deprecated("left-pad") == (True, True)


@responses.activate
def test_is_npm_package_deprecated_false():
    responses.add(
        responses.GET,
        "https://registry.npmjs.org/react",
        json={"dist-tags": {"latest": "18.3.1"}, "versions": {"18.3.1": {}}},
        status=200,
    )
    assert is_npm_package_deprecated("react") == (False, True)


@responses.activate
def test_is_pypi_package_deprecated_via_yanked():
    responses.add(
        responses.GET,
        "https://pypi.org/pypi/some-yanked-pkg/json",
        json={
            "info": {"version": "1.0.0"},
            "releases": {"1.0.0": [{"yanked": True}]},
        },
        status=200,
    )
    assert is_pypi_package_deprecated("some-yanked-pkg") == (True, True)


@responses.activate
def test_is_npm_package_deprecated_registry_error_is_unchecked():
    responses.add(responses.GET, "https://registry.npmjs.org/broken-pkg", status=500)
    assert is_npm_package_deprecated("broken-pkg") == (False, False)


@responses.activate
def test_collect_dependencies_saves_rows_and_checks_deprecation():
    session = make_session()
    repo = Repository(owner="o", name="r", primary_language="python", stars=1)
    session.add(repo)
    session.flush()

    class FakeGithubClient:
        def get_sbom(self, owner, repo_name):
            return {
                "sbom": {
                    "packages": [
                        {
                            "externalRefs": [
                                {"referenceType": "purl", "referenceLocator": "pkg:pypi/requests@2.31.0"}
                            ]
                        }
                    ]
                }
            }

    responses.add(
        responses.GET,
        "https://pypi.org/pypi/requests/json",
        json={"info": {"version": "2.31.0"}, "releases": {"2.31.0": [{"yanked": False}]}},
        status=200,
    )

    saved = collect_dependencies(session, FakeGithubClient(), repo, max_packages=10, check_deprecation=True)
    assert saved == 1

    from src.db.models import Dependency
    dep = session.query(Dependency).filter_by(repo_id=repo.id).one()
    assert dep.package_name == "requests"
    assert dep.ecosystem == "pypi"
    assert dep.is_deprecated is False
    assert dep.deprecation_checked is True


def test_collect_dependencies_skip_deprecation_check_marks_unchecked():
    session = make_session()
    repo = Repository(owner="o", name="r2", primary_language="python", stars=1)
    session.add(repo)
    session.flush()

    class FakeGithubClient:
        def get_sbom(self, owner, repo_name):
            return {
                "sbom": {
                    "packages": [
                        {
                            "externalRefs": [
                                {"referenceType": "purl", "referenceLocator": "pkg:pypi/requests@2.31.0"}
                            ]
                        }
                    ]
                }
            }

    collect_dependencies(session, FakeGithubClient(), repo, max_packages=10, check_deprecation=False)

    from src.db.models import Dependency
    dep = session.query(Dependency).filter_by(repo_id=repo.id).one()
    # スキップ時は「非推奨ではない」と断定してはならず、未検証として保存する
    assert dep.is_deprecated is False
    assert dep.deprecation_checked is False
