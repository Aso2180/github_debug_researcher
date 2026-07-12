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
        "slug": "info-sharing",
        "name": "情報共有・ナレッジ共有",
        "description": "社内ドキュメント・ナレッジの検索性を高めるための技術スタック構成。",
        "display_order": 1,
        "patterns": [
            {
                "slug": "info-sharing-light",
                "name": "個人開発・小規模チーム向けRAG構成",
                "tier": "light",
                "summary": "文書をベクトル化して検索し、結果を根拠にLLMへ回答させるRAG(Retrieval-Augmented "
                           "Generation)の軽量構成。",
                "risk_notes": (
                    "RAGの回答精度は実装力よりも文書の分割方法(チャンク設計)で大部分が決まると言われている。"
                    "議事録やチャットログのような短い文脈の文書は固定長分割で十分だが、契約書のように論理構造を"
                    "持つ文書は章立てに沿った分割が向く。検索結果を参照させてもLLMのハルシネーションを完全には"
                    "ゼロにできないため、参照元へのリンクを必ず提示する設計が重要。"
                ),
                "display_order": 1,
                "components": [
                    {
                        "layer": "frontend", "component_name": "Slack Bot",
                        "description": "社内でよく使われるチャットツール上のインターフェース。ユーザーが使い慣れた"
                                        "場所で質問できるため導入しやすい。",
                    },
                    {
                        "layer": "backend", "component_name": "Python (LangChain)",
                        "description": "検索とLLMをつなぐオーケストレーションの定番ライブラリ。文書のチャンク分割・"
                                        "検索・LLM呼び出しの一連の流れを組みやすい。",
                    },
                    {
                        "layer": "datastore", "component_name": "pgvector (PostgreSQL)",
                        "description": "PostgreSQLの拡張機能としてベクトル検索を追加できる。既存のPostgreSQL"
                                        "運用ノウハウをそのまま使える手軽さが利点。",
                    },
                    {
                        "layer": "security", "component_name": "文書アクセス権限メタデータ",
                        "description": "文書を取り込む段階で「誰が読めるものか」のメタデータを持たせる仕組み。"
                                        "権限管理を後回しにすると、本来アクセス権のない社員が機密文書の内容を"
                                        "読めてしまう事故につながる。",
                    },
                ],
            },
            {
                "slug": "info-sharing-enterprise",
                "name": "エンタープライズ向けRAG構成",
                "tier": "enterprise",
                "summary": "大規模な文書量・アクセス権限管理に対応したRAG構成。",
                "risk_notes": (
                    "文書量が増えるほど検索精度の劣化・インデックス更新のコストが課題になる。権限管理を"
                    "ベクトルDB側でも保持しないと、検索結果を通じて権限外の文書内容が漏れる可能性がある。"
                    "ハルシネーション対策として参照元表示を必須にする方針は軽量構成と同様。"
                ),
                "display_order": 2,
                "components": [
                    {
                        "layer": "backend", "component_name": "Python (LlamaIndex)",
                        "description": "大規模な文書インデックス管理に強みを持つRAGフレームワーク。企業向けの"
                                        "複雑なデータ接続に対応しやすい。",
                    },
                    {
                        "layer": "datastore", "component_name": "Pinecone",
                        "description": "マネージド型のベクトルデータベース。大規模データでもスケールしやすく、"
                                        "エンタープライズでの採用実績が多い。",
                    },
                    {
                        "layer": "frontend", "component_name": "社内Web UI",
                        "description": "自社ポータルに組み込む専用UI。Slack等の外部ツールに依存しない統制の"
                                        "効いた提供形態。",
                    },
                    {
                        "layer": "security", "component_name": "文書アクセス権限管理(RBAC)",
                        "description": "ロールベースのアクセス制御。検索結果自体を権限に応じてフィルタする"
                                        "仕組みが求められる。",
                    },
                ],
            },
        ],
    },
    {
        "slug": "efficiency",
        "name": "効率化・生産性向上",
        "description": "個人開発からチーム開発まで、生産性を高めるための技術スタック構成。",
        "display_order": 2,
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
        "display_order": 3,
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
    {
        "slug": "data-analysis",
        "name": "データ分析・市場予測",
        "description": "売上・利用ログ等のデータを分析し意思決定に活かすための技術スタック構成。",
        "display_order": 4,
        "patterns": [
            {
                "slug": "data-analysis-light",
                "name": "小規模チーム向け軽量BI構成",
                "tier": "light",
                "summary": "クラウドDWHと無料〜低コストのBIツールを組み合わせた構成。",
                "risk_notes": (
                    "クラウドDWHは従量課金のため、コスト最適化を後回しにすると想定以上に費用が膨らみやすい。"
                    "データモデルが増えるほど依存関係が複雑化するため、命名規則やドキュメンテーションのルールを"
                    "早期に決めておくことが望ましい。"
                ),
                "display_order": 1,
                "components": [
                    {
                        "layer": "datastore", "component_name": "BigQuery",
                        "description": "従量課金のクラウドDWH。小規模データ量では低コストに始められる。",
                    },
                    {
                        "layer": "infra", "component_name": "Looker Studio",
                        "description": "無料で使えるBIツール。BigQuery等と直接連携でき、小規模チームの"
                                        "可視化用途に向く。",
                    },
                ],
            },
            {
                "slug": "data-analysis-enterprise",
                "name": "データ基盤・BIのエンタープライズ構成",
                "tier": "enterprise",
                "summary": "DWH+ETL+dbt+BIツールを組み合わせた、業界標準とも言えるデータ基盤構成。",
                "risk_notes": (
                    "事業部ごとにデータ基盤を分割する「データメッシュ」構成は柔軟性が高い一方、権限管理(IAM)が"
                    "事業部の数だけ複雑化した実例が報告されている。BIツール側もエージェント型AI機能の統合が"
                    "進んでおり、単なる可視化から自動的な要因分析へ役割が広がりつつある。"
                ),
                "display_order": 2,
                "components": [
                    {
                        "layer": "datastore", "component_name": "Snowflake",
                        "description": "クラウドDWHの代表格。Databricksと並びエンタープライズのデータ基盤で"
                                        "広く採用される。",
                    },
                    {
                        "layer": "infra", "component_name": "Fivetran/Airbyte",
                        "description": "各種データソースをDWHに取り込むETL/ELTツール。データ連携の実装コストを"
                                        "下げる。",
                    },
                    {
                        "layer": "backend", "component_name": "dbt",
                        "description": "DWH内のデータ変換をSQLベースで管理するツール。データモデルの依存関係が"
                                        "可視化しやすい。",
                    },
                    {
                        "layer": "infra", "component_name": "Tableau/Power BI/Looker",
                        "description": "BIツール。近年はエージェント型AI機能を統合し、可視化だけでなく"
                                        "自動的な要因分析も担うようになっている。",
                    },
                ],
            },
        ],
    },
    {
        "slug": "labor-reduction",
        "name": "省人化",
        "description": "紙帳票のデータ化等、人手作業を削減するための技術スタック構成。",
        "display_order": 5,
        "patterns": [
            {
                "slug": "labor-reduction-light",
                "name": "クラウドAI-OCR単体構成",
                "tier": "light",
                "summary": "クラウドAPI型のAI-OCRサービス単体で帳票をデータ化する軽量構成。",
                "risk_notes": (
                    "文字単位の認識率がどれだけ高くても、帳票単位で完全に人の手を離れる割合は100%にはならない。"
                    "請求金額の桁のような重要項目は認識精度に関わらず人の目による確認が必要。「導入すれば入力"
                    "作業がゼロになる」という前提でプロジェクトを進めると運用フェーズでつまずきやすい。"
                ),
                "display_order": 1,
                "components": [
                    {
                        "layer": "infra", "component_name": "クラウドAI-OCR API",
                        "description": "画像・PDFから文字を認識してデータ化するクラウドサービス。定型帳票で"
                                        "あれば比較的低コストに導入できる。",
                    },
                ],
            },
            {
                "slug": "labor-reduction-enterprise",
                "name": "IDP(非定型文書処理)構成",
                "tier": "enterprise",
                "summary": "AI-OCRに加え、読み取り後の仕分け・判断・システム連携まで含めて自動化するIDP構成。",
                "risk_notes": (
                    "レイアウトが取引先ごとに異なる非定型帳票では読み取りの難度が跳ね上がる。AIが判断に迷う"
                    "ケースをあらかじめ想定し、そこだけ人間に確認を仰ぐHuman-in-the-loopの運用フローを最初から"
                    "組み込んでおくことが定石。ある事例では手入力からAI-OCRへの切り替えで38人体制が4人まで"
                    "圧縮できた一方、効果が出る前提には運用設計の丁寧さが必要。"
                ),
                "display_order": 2,
                "components": [
                    {
                        "layer": "infra", "component_name": "AI-OCR",
                        "description": "非定型帳票にも対応するAI-OCRエンジン。IDPの入り口となる文字認識部分を"
                                        "担う。",
                    },
                    {
                        "layer": "backend", "component_name": "仕分け・判断ロジック",
                        "description": "読み取り結果を業務ルールに沿って仕分け・判定する処理。ここが無いと"
                                        "単なる文字起こしで終わってしまう。",
                    },
                    {
                        "layer": "security", "component_name": "Human-in-the-loop運用",
                        "description": "AIが自信を持てないケースを人間が確認するワークフロー。精度が100%に"
                                        "ならない前提で必須の設計。",
                    },
                ],
            },
        ],
    },
    {
        "slug": "risk-detection",
        "name": "リスク検知・不正検知",
        "description": "不正な取引や異常な挙動を検知するための技術スタック構成。",
        "display_order": 6,
        "patterns": [
            {
                "slug": "risk-detection-light",
                "name": "ルールベース+教師ありモデルの軽量構成",
                "tier": "light",
                "summary": "既知の不正パターンをルール+教師あり学習で検知するシンプルな構成。",
                "risk_notes": (
                    "誤検知(False Positive)が多いと、現場が警告そのものを無視するようになる「アラート疲れ」が"
                    "典型的な失敗パターン。精度の追求と同じくらい誤検知率を抑える設計が重要。"
                ),
                "display_order": 1,
                "components": [
                    {
                        "layer": "backend", "component_name": "ルールベース検知エンジン",
                        "description": "閾値や条件式で既知の不正パターンを検知する仕組み。実装コストが低く、"
                                        "まず着手しやすい。",
                    },
                    {
                        "layer": "backend", "component_name": "教師あり学習モデル",
                        "description": "既知の不正パターンをラベル付きデータから学習するモデル。ルールでは"
                                        "捉えきれないパターンを補完する。",
                    },
                ],
            },
            {
                "slug": "risk-detection-enterprise",
                "name": "ハイブリッド型・XAI対応構成",
                "tier": "enterprise",
                "summary": "教師あり+教師なし学習、時系列/グラフ解析を組み合わせ、判定理由を可視化する"
                           "エンタープライズ構成。",
                "risk_notes": (
                    "なぜそのリスク判定が下されたのかをAIが説明できない「ブラックボックス問題」は現場の納得感を"
                    "損なうだけでなく、金融分野では規制対応の観点からも重要な論点。判定理由を可視化する仕組み"
                    "(説明可能AI, XAI)が実務ではほぼ必須になりつつある。国内外の事例では、導入企業の8割以上が"
                    "誤検知の大幅な削減を実感し、6割以上が導入初年度に測定可能なROIを達成したと報告されている。"
                ),
                "display_order": 2,
                "components": [
                    {
                        "layer": "backend", "component_name": "教師なし学習モデル",
                        "description": "未知の不正パターンを検知する異常検知モデル。ラベル無しデータからの"
                                        "学習が中心。",
                    },
                    {
                        "layer": "infra", "component_name": "時系列/グラフ解析",
                        "description": "取引の時系列変化や関係性(グラフ構造)から異常を検知する解析基盤。"
                                        "単純な特徴量だけでは見えない不正パターンの発見に使われる。",
                    },
                    {
                        "layer": "security", "component_name": "説明可能AI(XAI)",
                        "description": "判定理由を人間が理解できる形で可視化する仕組み。現場の納得感や規制"
                                        "対応の観点からエンタープライズではほぼ必須。",
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
