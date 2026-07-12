from scripts.seed_usecase_guide import CATEGORIES, seed
from src.db.models import ArchitecturePattern, ArchitecturePatternComponent, UseCaseCategory
from src.db.session import get_engine, init_db, get_session_factory


def make_session():
    engine = get_engine("sqlite:///:memory:")
    init_db(engine)
    return get_session_factory(engine)()


def test_seed_inserts_all_categories_patterns_and_components():
    session = make_session()

    seed(session)
    session.commit()

    categories = session.query(UseCaseCategory).all()
    patterns = session.query(ArchitecturePattern).all()
    components = session.query(ArchitecturePatternComponent).all()

    assert len(categories) == 6
    assert len(patterns) == 12
    expected_component_count = sum(
        len(p["components"]) for c in CATEGORIES for p in c["patterns"]
    )
    assert len(components) == expected_component_count

    efficiency = session.query(UseCaseCategory).filter_by(slug="efficiency").one()
    assert efficiency.name == "効率化・生産性向上"
    assert len(efficiency.patterns) == 2


def test_seed_is_idempotent_on_rerun():
    # 本番ACIジョブや週次実行で再実行されても、カテゴリ・パターン・コンポーネントが重複しないこと
    # (15.5/9章と同種の重複行バグをこの投入スクリプトで再発させないための検証)
    session = make_session()

    seed(session)
    session.commit()
    seed(session)
    session.commit()

    assert session.query(UseCaseCategory).count() == 6
    assert session.query(ArchitecturePattern).count() == 12
    expected_component_count = sum(
        len(p["components"]) for c in CATEGORIES for p in c["patterns"]
    )
    assert session.query(ArchitecturePatternComponent).count() == expected_component_count


def test_seed_replaces_components_rather_than_appending():
    session = make_session()
    seed(session)
    session.commit()

    pattern = session.query(ArchitecturePattern).filter_by(slug="efficiency-light").one()
    before_ids = {c.id for c in pattern.components}

    seed(session)
    session.commit()

    session.expire_all()
    pattern = session.query(ArchitecturePattern).filter_by(slug="efficiency-light").one()
    after_ids = {c.id for c in pattern.components}

    # 洗い替え方式のため、2回目投入後のコンポーネント行は新しいid(以前のものとは重複しない)
    assert len(after_ids) == len(before_ids)
    assert before_ids.isdisjoint(after_ids)
