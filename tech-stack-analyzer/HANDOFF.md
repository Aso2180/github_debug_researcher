# 技術スタック手戻りリスク解析ツール — Phase 4〜6 完了報告 / 引き継ぎメモ

> `tech-stack-analyzer-phase4-completion-handoff.md`(Phase4〜6実装仕様書)に基づく実装が完了し、
> ローカル(SQLite)・Docker Compose(PostgreSQL)・GitHub Actions定期実行のいずれも実データで動作確認済み。
> 本ファイルは次回以降の開発セッションが状況を素早く把握できるようにするための引き継ぎメモ。

## 1. 現在の完成状況(Definition of Done)

| # | 項目 | 状態 |
|---|---|---|
| 1 | collector: 全テストPASS | ✅ (27件) |
| 2 | server: 全APIエンドポイント実装・テストPASS | ✅ (13件) |
| 3 | client: 3画面(Dashboard/RiskRanking/RepoDetail)が実データで表示 | ✅ |
| 4 | `docker-compose up`でBasic認証付きダッシュボードにアクセス可能 | ✅ |
| 5 | GitHub Actions `collect.yml` が `workflow_dispatch` で正常完了 | ✅ |
| 6 | セキュリティチェックリスト(仕様書3.4節) | ✅ |

## 2. このセッションで見つけて直したバグ

実装自体はPhase4〜6一式が既に書かれていたが、実際に動かして初めて顕在化した不具合が3件あった。

1. **`server/src/app.js`** — Reactビルド成果物への相対パスが `../../client/dist` と1階層深く指定されており、
   本番ビルド(`npm run build`)後もダッシュボードのルート(`/`)が常に404になっていた。
   `__dirname`(`server/src`)から見て正しくは `../client/dist`。
2. **`server/Dockerfile`** — `node:20-slim` には Python / ビルドツールが入っておらず、
   `npm ci --omit=dev` 時に `better-sqlite3` のネイティブビルド(node-gyp)が失敗し、
   `docker-compose up --build` 自体が成立しなかった。マルチステージビルド化
   (ビルド専用ステージで `python3 make g++` を導入し、最終イメージには `node_modules` だけコピー)して解決。
3. **`docker-compose.yml`** — `server.environment.DATABASE_URL` が `postgres://` スキームだったが、
   SQLAlchemy 2.0(collector側)はこのスキームを受け付けず `NoSuchModuleError` になる。
   `postgresql://` に修正。**collector用に新しく `DATABASE_URL` を設定する際は必ず `postgresql://` を使うこと。**
   (Node側の `pg` パッケージはどちらのスキームでも動くため気づきにくい)

## 3. ハマりどころ・非自明な挙動

- **`.env` の読み込み優先順位**: `collector/src/config.py` は `python-dotenv` の `find_dotenv()` を使っており、
  カレントディレクトリから**上に向かって最初に見つかった `.env`** を読む。
  `tech-stack-analyzer/.env`(docker-compose用に`POSTGRES_PASSWORD`等を置いた)が
  `tech-stack-analyzer/collector/.env` より先に見つかってしまうと、後者に書いた
  `GITHUB_TOKEN` / `QIITA_TOKEN` が無視される。**トークン類は必ず `collector/.env` に置くこと**
  (`tech-stack-analyzer/.env` ではなく、collectorに一番近い場所に置くのが安全)。
- **`/api/repos` のデフォルト`limit`は100件**。データが100件を超えると全件は返らない
  (バグではなく仕様。全件欲しい場合は `?limit=200` のように明示指定する)。
- GitHub Search APIのレート制限は認証済みで30req/分。`GITHUB_TOKEN`未設定時は
  `collector/src/main.py` が自動的にリクエスト間隔を6.5秒に広げる(未認証は10req/分のため)。
  「データが少ない」と感じたら、まずトークンが読み込まれているか確認する。

## 4. 実データの状況(このセッション時点)

- SQLite開発DB(`collector/tech_stack.db`): 66リポジトリ(Python/TypeScript/Ruby/Go 各15〜18件)、依存関係1150件、Qiitaトレンド7件
- Docker Compose上のPostgreSQL: 初回投入60件 → GitHub Actions実行後107件に増加(実行のたびにGitHub側のトレンドが変わるため件数は変動する)
- 収集コマンド(GitHub Actionsと同一パラメータ):
  ```bash
  cd tech-stack-analyzer/collector && source .venv/bin/activate
  python -m src.main \
    --languages python,typescript,ruby,go \
    --min-stars 1000 \
    --max-repos 15 \
    --qiita-tags python,rails,django,react,vue
  ```

## 5. ローカルアクセス方法

```
http://localhost:3000/
```

- Basic認証のユーザー名/パスワードは `tech-stack-analyzer/.env` の `DASHBOARD_USER` / `DASHBOARD_PASSWORD` を参照
  (このファイルは `.gitignore` 済みでリポジトリには含まれない)。
- 起動: `cd tech-stack-analyzer && docker compose up -d`
- `db`(PostgreSQL)が healthy になってから `server` が起動する構成。

## 6. GitHub Actions 定期実行(セルフホストランナー)

このプロジェクトのPostgreSQLはローカルDocker上にしか存在しないため、GitHub-hosted runnerからは
到達できない。そのため `collect.yml` は **`runs-on: self-hosted`** に変更し、
このPC(WSL)上でランナーを起動する構成にしている。

- ランナー本体: `~/actions-runner`(リポジトリの外、Git管理対象外)
- 登録名: `wsl-local-runner`、ラベル: `self-hosted,Linux,X64`
- 起動: `cd ~/actions-runner && ./run.sh`(現状はフォアグラウンド実行。
  ターミナルを閉じると停止するため、恒常運用するなら以下でサービス化することを推奨)
  ```bash
  cd ~/actions-runner
  sudo ./svc.sh install
  sudo ./svc.sh start
  ```
  (sudo権限が必要なため、AIエージェントでは実行不可。ユーザー側で実施が必要)
- 前提: ワークフロー実行前に `docker compose up -d` で `db` が起動している必要がある
  (Postgresが落ちていると収集ジョブは失敗する)。

### リポジトリがpublicであることについて

`https://github.com/Aso2180/github_debug_researcher` は現在public設定。
GitHub公式ドキュメントは「self-hosted runnerをpublicリポジトリで使うべきではない」と警告している
(誰でもPRを送れる場合、悪意あるコードがランナー上=このPC上で実行されうるため)。
現状の `collect.yml` は `schedule` / `workflow_dispatch` のみがトリガーで `pull_request` 系は
含まれていないため、外部の第三者が勝手にジョブを走らせることはできない。
**今後 `pull_request` / `pull_request_target` トリガーを追加しない**こと。心配であれば
リポジトリをprivateに変更するのも選択肢。

## 7. 今後の本格開発に向けて残っている作業

- [x] `DASHBOARD_PASSWORD` / `POSTGRES_PASSWORD` を本番用の強いパスワードに変更 → Azure本番環境では実施済み(8章参照)。ローカル`docker-compose`用の`.env`は開発用のまま。
- [ ] セルフホストランナーのサービス化(`svc.sh install`、sudo権限が必要)→ 8章の理由によりそもそも不要になった可能性あり
- [x] 本番でインターネット公開する場合はHTTPS終端(リバースプロキシ等)を追加 → Azure Container Appsの外部ingressが`*.azurecontainerapps.io`に対し自動でマネージドTLS終端するため追加作業不要
- [ ] `helmet()` は `contentSecurityPolicy: false` にしている(社内限定公開の想定。外部公開時は見直すこと)
- [ ] Reactクライアントのビルド成果物(571KB, 500KB超の警告あり)のコード分割を検討してもよい
- [ ] ブラウザでの実画面確認は、このセッションの環境にsudo権限がなくPlaywright用の共有ライブラリ
      (`libnspr4`等)を追加インストールできなかったため未実施。API契約とコンポーネントの
      フィールド参照の突合のみで検証済み。次回、ブラウザ確認できる環境があれば実施するとより確実。
- [ ] `cors()` が全オリジン許可のまま。外部公開の範囲が広がる場合は許可オリジンを絞ることを検討。
- [x] 本番データの定期更新の仕組み → `collect.yml`の`ubuntu-latest`化・GitHub Secrets更新・
      `workflow_dispatch`での本番接続実検証まで完了(12章参照)。`schedule`(毎週月曜3時UTC)による自動収集も有効。
- [ ] **`server/Dockerfile`が`COPY client/dist ./client/dist`でホスト側のビルド済み成果物をそのまま
      イメージに焼き込む方式になっている**(13章参照)。`npm run build`をし忘れたまま`az acr build`すると
      古いフロントエンドが本番に配信される事故が起きる(実際に2026-07-09→07-10で発生)。
      Dockerのbuildステージ内で`npm ci && npm run build`を実行する方式に変更し、
      ビルド漏れが構造的に起きないようにすることを検討。

## 8. Azure本番デプロイ(2026-07-09実施)

サブスクリプション「Azure サブスクリプション 1」(`2d09c6f0-e6a4-46a9-a3cd-d012b6579df8`)、
リージョン Japan East に以下を作成し、ダッシュボードを一般公開した。

| リソース | 名前 | 用途 |
|---|---|---|
| リソースグループ | `rg-tech-stack-analyzer` | 全リソースを収容 |
| Container Registry | `techstackanalyzer2026`(Basic, admin有効) | server/collectorイメージの保管 |
| PostgreSQL Flexible Server | `tech-stack-analyzer-pg`(Burstable B1ms, 32GB, v16) | 本番DB。DB名`tech_stack`、管理ユーザー`pgadmin` |
| Container Apps環境 | `tech-stack-analyzer-env` | server実行環境(Log Analyticsワークスペース自動作成) |
| Container App | `tech-stack-analyzer-server` | dashboardサーバー本体。`min-replicas 0 / max-replicas 1`, 0.25 vCPU/0.5Gi |

**公開URL**: https://tech-stack-analyzer-server.blackocean-293be2f2.japaneast.azurecontainerapps.io/

- Basic認証のユーザー名/パスワードは本番用に新規生成したもの(ローカル`.env`とは別値)。
  ユーザー本人にのみ別途共有済み。紛失した場合は
  `az containerapp secret set --name tech-stack-analyzer-server --resource-group rg-tech-stack-analyzer --secrets dashboard-password=<new>`
  で更新可能(併せて`DASHBOARD_PASSWORD`環境変数のsecretrefはそのままでよい)。
- `DATABASE_URL`・`DASHBOARD_PASSWORD`はContainer Appのsecret機能で管理(平文はどこにもコミットしていない)。
- PostgreSQLのファイアウォールは`AllowAllAzureServicesAndResourcesWithinAzureIps`のみ(Azure内リソースからの接続を許可、インターネットからの直接接続は拒否)。

### デプロイ手順の要点(再現する場合)

1. `az acr build --registry techstackanalyzer2026 --image tech-stack-analyzer-server:latest ./tech-stack-analyzer/server`
   (ローカルでdocker buildしてpushする代わりに、ACR側でクラウドビルドする方式。ローカルのdocker loginや`docker push`権限は不要)
2. `az postgres flexible-server create ...` で本番DBを作成(`--public-access 0.0.0.0`でAzure内リソースからのみ許可)
3. `az containerapp env create` → `az containerapp create` でserverをデプロイ。ACRの認証はadmin資格情報を`--registry-username/--registry-password`で渡す方式(マネージドID + AcrPullロールへの切り替えも今後の改善候補)
4. 初期データ投入は **Azure Container Instances (ACI) の使い捨てジョブ** で実施した。
   - 理由: 開発機(WSL)からPostgreSQLの5432番ポートへの直接アウトバウンド接続がネットワーク側でブロックされており
     (`ifconfig.me`で見えるグローバルIPをファイアウォール許可しても`Connection timed out`)、ローカルから直接`python -m src.main`を
     本番DB向けに実行することはできなかった。ACIはAzure内部からPostgreSQLに到達できるため、collector用に
     `tech-stack-analyzer/collector/Dockerfile`を新規作成しACRでビルド→`az container create --restart-policy Never`で
     一回限り実行→完了後`az container delete`で削除、という運用にした。
   - 同じ理由により、既存のセルフホストランナー(6章)は本番Azure DBに対しても同様に5432番ポートがブロックされる可能性が高い。
     一方、**GitHub-hosted runner(`ubuntu-latest`)は本番PostgreSQLがインターネット経由で到達可能なため、そのまま利用できる見込み**。
     今後定期収集を自動化する場合は、`collect.yml`の`runs-on`を`self-hosted`から`ubuntu-latest`へ戻し、
     `DATABASE_URL`シークレットを本番接続文字列(`postgresql://pgadmin:<password>@tech-stack-analyzer-pg.postgres.database.azure.com:5432/tech_stack?sslmode=require`)
     に更新する案を検討すること(未実施。GitHub側のsecrets変更とworkflow変更を伴うため今回はスコープ外とした)。
5. 疎通確認: `/api/health`が200、Basic認証なしの`/api/repos`が401、認証ありで60リポジトリ・Qiitaトレンド5件を確認済み。

### 既知の制約・今後の課題

- 本番データは2026-07-09時点の一回限りの投入(60リポジトリ)。定期更新の自動化は未実施(上記4参照)。
- `min-replicas 0`のため、しばらくアクセスが無いとコールドスタートが発生する(初回アクセス時に数秒〜十数秒の遅延が起きうる)。
  常時起動にしたい場合は`az containerapp update --min-replicas 1`(コストが増える点に注意)。
- ACRはadmin有効化した簡易認証。管理者アカウントの棚卸し・マネージドID移行は未実施。
- コスト目安: PostgreSQL Flexible Server(B1ms)が主要コスト(月1,500〜2,000円程度)、ACR Basic(月250円程度)、
  Container Appsは消費量課金(トラフィック次第だが月数百円程度を想定)。

## 9. Phase 7: AIリスク分析・工数可視化・ガントチャート機能(2026-07-09実施)

`PHASE7-8-INSTRUCTIONS.md` に基づき実装。

- 新規エンドポイント `POST /api/analyze`(`server/src/routes/analyze.js`)。
  - `projectOverview`/`goals`(必須)と任意の`candidateStack`を受け取り、`candidateStack`未指定時は
    `repositories.primary_language`・`qiita_tag_trends.tag`の実在語彙に対する単純な部分一致でキーワード抽出する
    (外部NLP不使用。収集済みデータの語彙のみを根拠にする設計)。
  - 抽出した言語で`repositories`を`stars DESC LIMIT 20`に絞り込み、最新(`calculated_at`最大)の`risk_scores`を
    相関サブクエリでJOIN(1リポジトリにつき複数回分析が走ると`risk_scores`に履歴行が積み上がる仕様のため、
    素朴な`LEFT JOIN`だとリポジトリが重複して返る。**本エンドポイント以外でも同テーブルをJOINする際は
    このMAX(calculated_at)相関サブクエリのパターンを踏襲すること**)。
  - Anthropic API(`server/src/services/anthropicClient.js`、モデル`claude-sonnet-5`)にJSON専用出力を指示するプロンプトを送り、
    コードフェンス除去→`JSON.parse`。失敗時は1回だけ強調プロンプトで再試行し、それでも失敗なら502。
  - `express-rate-limit`でこのエンドポイント専用のレート制限(既定: 分5回/IP、`ANALYZE_RATE_LIMIT_MAX`/
    `ANALYZE_RATE_LIMIT_WINDOW_MS`環境変数で調整可能)。他の`/api/*`と同様Basic認証も維持。
  - `ANTHROPIC_API_KEY`は`server/.env`(`server/src/config.js`経由、DASHBOARD_*と同じ読み込み方式)で管理。
    collector側の`.env`読み込み(3章参照)には一切触れていない。
- フロントエンド新規画面 `ProjectPlanner`(`server/client/src/pages/ProjectPlanner.jsx`、ルート`/planner`)。
  - ガントチャートライブラリは **frappe-gantt**(2026-02リリース・依存ゼロ・軽量)を採用。
    本家が4年間更新されていない`gantt-task-react`は本ツールの趣旨(依存の健全性を見るツール)に照らして除外した。
  - ガントチャート部分(`server/client/src/components/GanttChart.jsx`)は`React.lazy`+`Suspense`で動的import化し、
    初期バンドルには含めていない。ビルド確認結果: メインバンドル 571KB→577.78KB(+約1.1%、ProjectPlanner本体の追加分)、
    frappe-gantt本体はGanttChart専用チャンク(48.62KB JS + 6.94KB CSS)として分離済み。
    → 7章「Reactクライアントのビルド成果物のコード分割」は、少なくとも今回追加した重量級ライブラリについては対応済み。
- テスト: `server/tests/analyze.test.js`・`analyzeRateLimit.test.js`(Anthropic SDKは内部で使う`fetch`をグローバルにモックして実APIを一切呼ばない)、
  `server/client/src/__tests__/ProjectPlanner.test.jsx`(GanttChartはモック化)。
- **見つけて直したバグ**: `server/src/config.js`の`PORT = Number(process.env.PORT) || 3000`は、
  テストが`PORT=0`(OSにランダムな空きポートを選ばせる慣習)を指定しても`0`がfalsyなため`3000`にフォールバックしてしまい、
  テストファイルが1つしかなかった間は顕在化しなかったが、テストファイルを追加(3ファイル並列実行)した途端に
  実ポート3000の奪い合いで`EADDRINUSE`が発生した。`process.env.PORT !== undefined ? Number(...) : 3000`に修正。
- **Azure本番デプロイ(2026-07-09時点で中断中)**: `az acr build`で新イメージをビルド・プッシュ済み
  (`techstackanalyzer2026.azurecr.io/tech-stack-analyzer-server:latest`、ACR上のタグは新コード)。
  ただし **Container App側はまだ更新していない**(`az containerapp show`で確認済み: secretsは
  `database-url`/`dashboard-password`/ACR認証用のみで`anthropic-api-key`は未登録、env varにも`ANTHROPIC_API_KEY`は無い、
  `image`参照は`:latest`タグのままだが新リビジョンを明示的にトリガーしていないため**本番で稼働中のリビジョンは旧コードの可能性が高い**)。
  → **つまり現時点で本番ダッシュボードに`/api/analyze`・`ProjectPlanner`画面はまだ反映されていない。**

## 10. Phase 8: 本番データの定期収集自動化(コード変更のみ、2026-07-09時点)

- `.github/workflows/collect.yml`の`runs-on`を`self-hosted`→`ubuntu-latest`に変更済み(8章に記載の見込みの通り、
  GitHub-hosted runnerからは本番PostgreSQLに到達できる想定だが未検証)。
- GitHub Secrets(`https://github.com/Aso2180/github_debug_researcher/settings/secrets/actions`)側は
  ユーザーが `DATABASE_URL`・`GH_PAT`・`QIITA_TOKEN`・`ANTHROPIC_API_KEY` の4件を登録済み(2026-07-09)。
  - **注意**: `ANTHROPIC_API_KEY`はGitHub Actions用のシークレットストアであり、`collect.yml`はこれを参照していない
    (`/api/analyze`はAzure Container App上で動く本番サーバーが直接処理するため、GitHub Actions経由では呼ばれない)。
    本番`/api/analyze`を動かすには**別途Azure Container App側にも同じ値を`anthropic-api-key`という名前で登録する必要がある**
    (9章参照。この認識違いが本セッション中に一度発生したので次回も同様の混同に注意)。
  - `DATABASE_URL`の値が本番Azure接続文字列に更新済みかは**未確認**(ユーザーに確認予定だった時点で中断)。
    値は見れないため、次回セッションで改めて確認するか、`workflow_dispatch`を実行してログで判断すること。
- 未実施だった`workflow_dispatch`実検証・7章タスクのクローズは12章の通り2026-07-10に完了。

## 11. 中断時点のスナップショット(2026-07-09、※12章で解消済み)

> この章は2026-07-09セッション終了時点の記録として残す。記載の未コミット変更・ブロッカーは
> 12章の作業により2026-07-10にすべて解消済み。次回セッションは12章から読めば十分。

### ブロッカー: Azure CLIログイン
ユーザーが `az login` を試みたところ、無関係なテナント(`d2a8abd9-f5da-4a77-a193-dfbec1751c41` "Default Directory")で
MFAエラー(AADSTS50076)、かつ`2180aso@gmail.com`(Google側メール)でサブスクリプションが見つからないというエラーに遭遇し中断。
本来使うべきは `ryoji.aso@outlook.jp`、テナント`3b373fae-43ea-4d9f-82ea-586a27fb88db`、
サブスクリプション`2d09c6f0-e6a4-46a9-a3cd-d012b6579df8`(`rg-tech-stack-analyzer`が存在する場所)。
→ **12章時点でこの問題は発生せず、`az account show`で正しいアカウントにログイン済みであることを確認済み。**

## 12. Phase 7/8 本番反映・検証完了(2026-07-10実施)

前回(2026-07-09)の中断点から再開し、11章の「再開時にやること」を全て完了した。

1. **`anthropic-api-key`シークレット確認**: `az containerapp secret list`で登録済みであることを確認。
2. **Container App更新**: 以下を実行し、新リビジョン`tech-stack-analyzer-server--0000001`をデプロイ。
   ```bash
   az containerapp update --name tech-stack-analyzer-server --resource-group rg-tech-stack-analyzer \
     --set-env-vars ANTHROPIC_API_KEY=secretref:anthropic-api-key \
     --image techstackanalyzer2026.azurecr.io/tech-stack-analyzer-server:latest
   ```
   疎通確認: `/api/health`(200)、認証なし`/api/repos`(401)、認証あり`/api/repos`・`/api/qiita-trends`(200)、
   `POST /api/analyze`(200、Anthropic APIを実際に呼び出しスキーマ通りのJSONを確認)まで完了。
   → 本番ダッシュボードで`/api/analyze`・`ProjectPlanner`画面が正式稼働。
3. **未コミット変更のコミット**: Phase 7/8一式をコミット(`840ed7a`, "Add Phase 7 AI risk analysis + Gantt planner,
   run collect.yml on ubuntu-latest")。pushはユーザーがターミナルから`git push origin main`で実施。
4. **`workflow_dispatch`実検証でハマった点**:
   - 1回目、GitHub Actions画面で古い実行(2026-07-08、`self-hosted`時代、head `0bada09e`)に対して
     「Re-run jobs」を押してしまい、`run_attempt: 3`としてキューに積まれたが**`self-hosted`ラベルのランナーを
     待ち続けてqueuedのまま進まなかった**(セルフホストランナーが起動していないため)。
     **`Run workflow`ボタン(workflow_dispatch本来のトリガー)を使い、`main`ブランチの最新コミットを
     明示的に選んで新規実行する必要がある**(既存runのRe-runは、その実行が最初に使ったコミット時点の
     workflowファイルに固定されるため、後から`runs-on`を変更しても反映されない)。
   - 2回目、正しく新規実行したところ`sqlalchemy.exc.OperationalError: password authentication failed
     for user "pgadmin"`で失敗。ネットワーク到達自体は成功(FATALはサーバー到達後の認証エラー)。
     原因はGitHub Secretsの`DATABASE_URL`に**ローカルdocker-compose用の`.env`の`POSTGRES_PASSWORD`
     (`devlocalpassword123`)を誤って登録していた**ため。本番`pgadmin`の実パスワードに修正して再実行し成功。
     **同名の変数(`POSTGRES_PASSWORD`/`DATABASE_URL`)がローカル用・本番用で複数箇所に存在する構成なので、
     シークレット登録時は値の出所(ローカル`.env` vs Azure作成時に控えたパスワード)を混同しないよう注意。**
5. **最終確認**: `workflow_dispatch`が`success`で完了(実行ID`29069080830`)。本番PostgreSQLの
   `/api/repos?limit=200`で108件中60件が同日(2026-07-10)`fetched_at`であることを確認し、
   GitHub-hostedランナーが実際に本番DBへ新規データを書き込んだことを実証した。

### 現時点で残っている作業(任意・優先度低)
- セルフホストランナー(6章)の運用継続要否の最終判断(定期収集はGitHub-hostedに一本化されたため、
  基本的には不要と判断してよいが、ユーザーの最終確認待ち)。
- `helmet()`の`contentSecurityPolicy: false`・`cors()`全オリジン許可の見直し(社内限定公開が前提のまま)。
- Reactクライアントの残りバンドルサイズ(frappe-gantt以外の部分)のコード分割検討。
- ブラウザでの実画面確認(Playwright用共有ライブラリ未インストールのため未実施)。
  → 13章の通り、本番URLを実際にユーザーがブラウザで開いて確認したことで
    「フロントエンドのビルド漏れ」というAPI契約の突合だけでは発見できない不具合が見つかった。
    今後も本番反映後は必ずユーザー自身がブラウザで一度確認することを徹底したい。

## 13. 本番`/planner`画面が真っ白(ナビに表示すらされない)だった不具合の調査・修正(2026-07-10実施)

12章の作業完了後、ユーザーが実際に本番URLの`/planner`をブラウザで開いたところ、ナビゲーションバーに
「プランナー」リンク自体が存在せず(ダッシュボード・リスクランキングの2つのみ)、`ProjectPlanner`画面の
内容も一切表示されない状態だった。バックエンドの`/api/analyze`は12章で疎通確認済みだったため、
「バックエンドは新しいのにフロントエンドだけ古い」という一見矛盾した状態で、原因調査に時間を要した。

### 調査の経緯(次回同種の不具合に遭遇したときの参考に)
1. まずブラウザキャッシュを疑ったが、シークレットウィンドウ+ハード再読み込みでも再現。
2. Networkタブは全リクエストが`304 Not Modified`で、`ETag`もこちらでcurl取得した値と一致していたため
   「キャッシュではなく本当に最新版が返っている」と誤って結論づけてしまった
   (**304はサーバーが返したETagとブラウザが持つETagの一致を意味するだけで、
   そのETagの中身が期待通りかどうかまでは保証しない**。中身自体を毎回検証すべきだった)。
3. Consoleエラーも無し、DOM上に`<nav>`は存在(スクリーンショットで確認)、リンクが2つだけ→JS実行エラーではなく
   **配信されているJSバンドルの中身自体が古い**と判明。
4. `curl`でバンドル本体を取得し`grep -c "プランナー"`したところ**0件**(=Phase 7のコードが1バイトも
   含まれていない)。この直接検証が決め手になった。文字列やハッシュの"一致"だけで判断せず、
   実際のバンドルの中身を検索するのが最も確実。
5. 原因は`server/Dockerfile`が`COPY client/dist ./client/dist`でホスト側の**ビルド済み**`dist`を
   イメージにそのまま焼き込む方式だったこと。12章で`az acr build`を実行した時点で、ローカルの
   `client/dist`は`ProjectPlanner.jsx`等のPhase 7フロントエンド変更を取り込む前の
   古いビルド(2026-07-09作成、`index-BGaU_d7V.js`、559KB)のままだった
   (`dist/index.html`のmtimeが`ProjectPlanner.jsx`のmtimeより2秒早い、という痕跡で確認)。
   → **Dockerが「ビルドする」のではなく「ビルド済み成果物をコピーするだけ」の構成である以上、
   `az acr build`前に必ず`npm run build`(client側)を手動実行する規律が必要**。7章に改善案を記載。

### 修正内容
1. `tech-stack-analyzer/server/client`で`npm run build`を再実行し、Phase 7を反映した最新の
   `dist`(`index-D6LpFKnT.js`、577.78KB)を生成。
2. `az acr build --registry techstackanalyzer2026 --image tech-stack-analyzer-server:latest ./tech-stack-analyzer/server`
   でイメージを再ビルド・push(digest `sha256:3cd40cda6bb45aaa6cc39cb6aab1f7318d9e1bd892ce61f5dad513c9badddf66`)。
3. `az containerapp update --image techstackanalyzer2026.azurecr.io/tech-stack-analyzer-server@<上記digest>`
   で新リビジョン`tech-stack-analyzer-server--0000002`をデプロイ。
4. 配信されたJSバンドル(`index-D6LpFKnT.js`)に`プランナー`文字列が含まれることをcurlで再確認、
   `/api/health`・認証あり`/api/repos`・`/planner`がいずれも200であることを確認。
5. **ユーザー本人がブラウザ(シークレットウィンドウ)で`/planner`を開き、プランナー画面が表示されることを目視確認済み。**

次回セッション開始時は、まず`git status`(コミット・push済みのはずでクリーンになっている想定)と
12章「現時点で残っている作業」から確認すること。
