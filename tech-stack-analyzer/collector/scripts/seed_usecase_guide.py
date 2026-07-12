"""ユースケース別アーキテクチャガイド(Phase3)の手動キュレーションデータ投入スクリプト

このガイドのコンテンツ(カテゴリ・アーキテクチャパターン・構成要素)は、通常のバッチ収集
(GitHub/Qiita APIスクレイピング、src.main)とは性質が異なり人手でキュレーションしたものなので、
main.py の実行経路には乗せず、このスクリプトを個別に(ローカル/docker-compose/本番いずれの
DATABASE_URLに対しても)実行する運用にする。

冪等性: カテゴリ・パターンは slug で upsert する。コンポーネントは一意キーを持たないため、
パターンごとに既存行を全削除してから再insertする(dependency_collector.py の「洗い替え」方式と同じ考え方)。
これにより週次実行やACIジョブでの再実行を繰り返しても重複行が生まれない。

使い方(collector/ ディレクトリで実行):
    python scripts/seed_usecase_guide.py
"""
import logging
import sys

sys.path.insert(0, ".")

from src.db.session import get_engine, init_db, get_session_factory
from src.db.models import UseCaseCategory, ArchitecturePattern, ArchitecturePatternComponent

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CATEGORIES = [
    {
        "slug": "efficiency",
        "name": "効率化・生産性向上",
        "description": "個人開発からチーム開発まで、生産性を高めるための技術スタック構成。",
        "display_order": 1,
        "patterns": [
            {
                "slug": "efficiency-light",
                "name": "個人開発・MVP向け軽量構成",
                "tier": "light",
                "summary": "フロントとバックを同一言語(TypeScript)に統一した、個人開発〜小規模チーム向けの構成。",
                "risk_notes": (
                    "フロントとバックを同一言語(TypeScript)に統一するのが個人開発〜小規模チームの定石。"
                    "ただしRow Level Security(RLS)を設定し忘れたままAPIを公開すると、テナント間のデータ漏洩に"
                    "つながる。Vercel等のサーバーレス基盤は無料枠を超えた際のコスト急増に気づきにくい点にも注意。"
                ),
                "display_order": 1,
                "components": [
                    {
                        "layer": "frontend", "component_name": "TypeScript/Next.js",
                        "description": "フロントとバックエンドを同一言語(TypeScript)で書けるWebフレームワーク。"
                                        "個人開発〜小規模チームで採用されることが多い定番の組み合わせ。",
                    },
                    {
                        "layer": "frontend", "component_name": "Tailwind CSS",
                        "description": "ユーティリティクラスをHTMLに直接記述するCSSフレームワーク。"
                                        "Next.jsと組み合わせて使われることが多い。",
                    },
                    {
                        "layer": "datastore", "component_name": "PostgreSQL (Supabase)",
                        "description": "SupabaseはPostgreSQL・認証・API機能をまとめて提供するオープンソースの"
                                        "バックエンド基盤。個人開発〜小規模SaaSでよく使われる。",
                    },
                    {
                        "layer": "infra", "component_name": "Vercel",
                        "description": "Next.jsアプリのホスティングに強いサーバーレスプラットフォーム。"
                                        "デプロイの手軽さから個人開発でよく使われるが、無料枠超過時のコスト急増に注意。",
                    },
                    {
                        "layer": "security", "component_name": "Supabase Auth + RLS",
                        "description": "Supabase提供の認証機能と、PostgreSQLのRow Level Security(行単位アクセス制御)。"
                                        "マルチテナントのデータ分離によく使われる。",
                    },
                ],
            },
            {
                "slug": "efficiency-enterprise",
                "name": "チーム開発・エンタープライズ向け構成",
                "tier": "enterprise",
                "summary": "フロントエンド/バックエンド/インフラを役割分担するチーム開発向けの構成。",
                "risk_notes": (
                    "フロントエンドとバックエンドの技術が乖離しているとコミュニケーションコストが増加する。"
                    "特に『最初からKubernetes』はPMF前の段階では学習コスト・運用コストが過剰になりやすく、"
                    "失速の原因になった事例が繰り返し報告されている。マルチテナント設計を後回しにすると、"
                    "ユーザー数が伸びた段階で大規模な作り直しが必要になる。"
                ),
                "display_order": 2,
                "components": [
                    {
                        "layer": "frontend", "component_name": "React/TypeScript",
                        "description": "フロントエンド開発で最も広く使われるライブラリ。エコシステム・人材の"
                                        "採用しやすさから、チーム開発で定番の選択肢になっている。",
                    },
                    {
                        "layer": "backend", "component_name": "Node.js",
                        "description": "JavaScript/TypeScriptでサーバーサイドを書けるランタイム。フロントと"
                                        "言語を揃えたいチームで採用されることが多い。",
                    },
                    {
                        "layer": "datastore", "component_name": "PostgreSQL",
                        "description": "オープンソースのリレーショナルデータベース。中〜大規模システムで"
                                        "広く採用される、実績豊富な選択肢。",
                    },
                    {
                        "layer": "infra", "component_name": "Docker",
                        "description": "アプリケーションをコンテナ化する技術。環境差異を無くせるため、"
                                        "チーム開発・本番運用で標準的に使われる。",
                    },
                    {
                        "layer": "infra", "component_name": "Kubernetes",
                        "description": "複数のコンテナを運用するオーケストレーション基盤。大規模・多サービスの"
                                        "運用に向く一方、学習・運用コストが高くPMF前の段階では過剰になりやすい。",
                    },
                ],
            },
        ],
    },
    {
        "slug": "automation",
        "name": "業務自動化",
        "description": "社内業務・レガシーシステムの自動化のための技術スタック構成。",
        "display_order": 2,
        "patterns": [
            {
                "slug": "automation-light",
                "name": "iPaaS中心の構成(クラウドサービス間連携が主)",
                "tier": "light",
                "summary": "APIが公開されたクラウドサービス同士をノーコード/ローコードで連携する構成。",
                "risk_notes": (
                    "APIが公開されているクラウドサービス同士の連携には強いが、APIが無いレガシーシステムには"
                    "対応できない。ワークフローが複雑化すると可読性が下がり、誰が見ても保守できる状態を"
                    "維持する工夫(命名規則・管理台帳)が必要。"
                ),
                "display_order": 1,
                "components": [
                    {
                        "layer": "infra", "component_name": "Zapier",
                        "description": "ノーコードでクラウドサービス同士を連携できるiPaaSの代表格。"
                                        "非エンジニアでも設定しやすく、個人〜中小企業でよく使われる。",
                    },
                    {
                        "layer": "infra", "component_name": "Make",
                        "description": "Zapierと同種のiPaaS(旧Integromat)。より複雑な分岐・ワークフローを"
                                        "ビジュアルに組める点が特徴。",
                    },
                    {
                        "layer": "infra", "component_name": "Power Automate (クラウドフロー)",
                        "description": "Microsoft製のiPaaS。Microsoft 365(Teams/SharePoint等)との連携に強く、"
                                        "既にMicrosoft製品を使っている企業で採用されやすい。",
                    },
                ],
            },
            {
                "slug": "automation-enterprise",
                "name": "RPA中心の構成(画面操作・レガシーシステム対応)",
                "tier": "enterprise",
                "summary": "画面操作の自動化により、APIが無い古い業務システムにも対応できる構成。",
                "risk_notes": (
                    "APIが公開されていない古い業務システムにも対応できるのがRPAの強み。ただし『作った人が"
                    "異動すると誰も触れなくなる』属人化が失敗パターンの1位。ROI未達の主因は業務棚卸し不足で"
                    "あり、ツール選定ミスより影響が大きい。保守工数がロボット1本あたり月2〜4時間継続的に"
                    "発生する前提で費用対効果を見積もる必要がある。"
                ),
                "display_order": 2,
                "components": [
                    {
                        "layer": "infra", "component_name": "UiPath",
                        "description": "画面操作を自動化するRPA(Robotic Process Automation)ツールの代表格。"
                                        "エンタープライズでの導入実績が多い。",
                    },
                    {
                        "layer": "infra", "component_name": "Power Automate Desktop",
                        "description": "Microsoft製のデスクトップRPA。クラウドフロー(iPaaS)と組み合わせて"
                                        "使われることが多い。",
                    },
                    {
                        "layer": "infra", "component_name": "AI-OCR",
                        "description": "紙帳票・画像から文字を認識してデータ化する技術。RPAと組み合わせて"
                                        "非定型文書処理(請求書・帳票等)の自動化に使われる。",
                    },
                ],
            },
        ],
    },
]


def upsert_category(session, category_data):
    category = session.query(UseCaseCategory).filter_by(slug=category_data["slug"]).one_or_none()
    if category is None:
        category = UseCaseCategory(slug=category_data["slug"])
        session.add(category)
    category.name = category_data["name"]
    category.description = category_data["description"]
    category.display_order = category_data["display_order"]
    return category


def upsert_pattern(session, category, pattern_data):
    pattern = session.query(ArchitecturePattern).filter_by(slug=pattern_data["slug"]).one_or_none()
    if pattern is None:
        pattern = ArchitecturePattern(slug=pattern_data["slug"])
        session.add(pattern)
    pattern.category = category
    pattern.name = pattern_data["name"]
    pattern.tier = pattern_data["tier"]
    pattern.summary = pattern_data["summary"]
    pattern.risk_notes = pattern_data["risk_notes"]
    pattern.display_order = pattern_data["display_order"]
    return pattern


def replace_components(session, pattern, components_data):
    # コンポーネントは一意キーが無いため、洗い替え(既存行を全削除してから再insert)で冪等にする。
    session.query(ArchitecturePatternComponent).filter_by(pattern_id=pattern.id).delete()
    for c in components_data:
        session.add(ArchitecturePatternComponent(
            pattern=pattern, layer=c["layer"], component_name=c["component_name"], description=c["description"],
        ))


def seed(session):
    for category_data in CATEGORIES:
        category = upsert_category(session, category_data)
        session.flush()  # category.id を確定させる(pattern.category_id の参照に必要)
        for pattern_data in category_data["patterns"]:
            pattern = upsert_pattern(session, category, pattern_data)
            session.flush()  # pattern.id を確定させる(component.pattern_id の参照に必要)
            replace_components(session, pattern, pattern_data["components"])
        logger.info("カテゴリ '%s' のパターン%d件を投入しました", category.name, len(category_data["patterns"]))


def main():
    engine = get_engine()
    init_db(engine)
    session = get_session_factory(engine)()
    try:
        seed(session)
        session.commit()
        logger.info("ユースケースガイドの初期データ投入が完了しました")
    finally:
        session.close()


if __name__ == "__main__":
    main()
