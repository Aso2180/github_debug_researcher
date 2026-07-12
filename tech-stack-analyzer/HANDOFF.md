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

## 14. UX改修計画 v2(P0/P1)実装完了(2026-07-10実施)

ユーザー作成の`UX-IMPROVEMENT-PLAN.md`(本リポジトリ外、`Downloads`フォルダ)の前版は、
`HANDOFF.md`の記述と画面キャプチャの突き合わせのみを根拠にした仮説が中心だった
(「〜と推測される」「〜の可能性が高い」)。今回のセッションでは実装コード本体を全て読み、
開発用SQLite実DB(`collector/tech_stack.db`)に直接SQLを投げて数値を実測し、
GitHub Search APIのラベル仕様・ダッシュボード配色のUXベストプラクティス等を外部サイトで確認した上で、
仮説を検証済みの事実に置き換えてから改修に着手した。

### 14.1 検証で判明した主な事実(前版の仮説からの訂正)

- **`riskColor()`は一元化されていなかったのではなく、`LanguageSummaryCard.jsx`だけが同じロジックを
  ローカルに複製していた**(二重管理)。現状は値が一致していたため見た目のバグは出ていなかったが、
  将来`RISK_THRESHOLDS`を変更すると片方だけ取り残される「予約された回帰」だった。
- **ダッシュボードのカード上部ボーダー色([言語]のブランドカラー)とリスク色は元々別々の配色系統**で、
  Rubyなど言語のブランドカラーが赤いために「危険」に見えるという実害があった
  (外部のダッシュボードUX原則: 「ステータスと無関係な要素に信号色を使うとユーザーは誤って異常だと解釈する」)。
- **メンテナンス指標(maintenance_score)が実データで全リポジトリ0.000付近に集中する件はバグではなかった**。
  開発DBを直接クエリして実測した結果、計算式(`最終push日からの経過日数/365`)は正しく動作しており、
  収集対象が「GitHub検索で`sort=updated`(更新の新しい順)の人気リポジトリ」に絞られているため、
  ほぼ常に0付近になるのは統計的に当然の結果だった。→ ユーザー確認の上、
  「バグ修正」ではなく「列見出し・ツールチップに注記を追加」で対応することに決定(14.2の#6参照)。
- **リポジトリ数の不整合の根本原因を特定**: `server/src/routes/risk.js`の`/api/risk-ranking`が、
  Phase7で`analyze.js`に導入された`MAX(calculated_at)`相関サブクエリ(9章参照、
  「本エンドポイント以外でも同テーブルをJOINする際はこのパターンを踏襲すること」という自己申告済みの
  ルール)を踏襲しておらず、素朴なJOINのままだった。開発DB(collector実行1回のみ)ではまだ重複が
  発現していなかったが、本番Postgresは週次cron+複数回の手動実行が既に走っており、
  収集が繰り返されるたびに同一リポジトリが重複行として返る、悪化し続けるバグだった。
- **Bug比率スコアが0か1に二極化する原因を特定**: `collector/src/clients/github_client.py`の
  `label:{label}`検索(label="bug"固定)は、GitHub公式コミュニティで報告されている通り
  Search API経由では完全一致・大文字小文字を区別する。`kind/bug`等の別名ラベルを使うリポジトリは
  実際のバグ数によらず必ず0になる。
- **プランナーの`candidateStack`欄の未報告の欠陥**: 選択した語がQiitaタグ照合(`matchedTags`)に
  一切反映されない非対称性、および大文字小文字表記ゆれによるサイレントな0件ヒットを新規発見。

### 14.2 実施したP0/P1修正(コード変更・全てテスト済み)

| # | 内容 | 対象ファイル |
|---|---|---|
| 1 | `/api/risk-ranking`に`MAX(calculated_at)`相関サブクエリを追加し重複行バグを修正 | `server/src/routes/risk.js` |
| 2 | Dockerマルチステージ化。`client`のビルド(`npm ci && npm run build`)をDockerfile内の専用ステージで実行し、ホスト側の`dist`をCOPYする方式(13章の事故の原因)を廃止。`.dockerignore`追加 | `server/Dockerfile`, `server/.dockerignore` |
| 3 | `LanguageSummaryCard`のローカル`riskColor()`複製を削除し`riskMeta.js`から共通利用 | `server/client/src/components/LanguageSummaryCard.jsx` |
| 4 | ダッシュボードカードの言語色を太いボーダーから小さいドットに縮小し、リスク色と視覚的に分離 | 同上 |
| 5 | `RiskTable`のBug/メンテ/チャーン列を中立色に変更、色分けは総合リスク列のみに限定 | `server/client/src/components/RiskTable.jsx` |
| 6 | メンテナンス指標・Bugスコアの`SCORE_META.description`に指標の限界・特性を明記し、`RiskTable`の列見出しにツールチップ(title属性)として表示 | `server/client/src/riskMeta.js`, `RiskTable.jsx` |
| 7 | プランナーの「候補の技術スタック」を自由入力からチップ選択式に変更(`repositories.primary_language`・`qiita_tag_trends.tag`の実在語彙のみ選択可能。`getRepos`/`getQiitaTrends`から取得) | `server/client/src/pages/ProjectPlanner.jsx` |
| 8 | `candidateStack`で選んだ語をQiitaタグ照合(`matchedTags`)にも反映し、非対称性を解消 | `server/src/routes/analyze.js` |
| 9 | 「プロジェクト概要」「ゴール」欄にプレースホルダー例文を追加 | `server/client/src/pages/ProjectPlanner.jsx` |
| 10 | デプロイ後スモークテストスクリプトを新規作成(HANDOFF 13章の`curl \| grep -c`調査手法をスクリプト化)。ステータスコードだけでなく配信バンドルの中身(文字列)を検証する | `tech-stack-analyzer/scripts/smoke-test.sh` |
| 11 | テスト実行用CIワークフローを新規作成(従来`collect.yml`しか存在せず、push/PR時にテストを自動実行する仕組みが無かった) | `.github/workflows/test.yml` |

### 14.3 検証方法(実施済み)

- server: `npm test`(25件)、client: `npm test`(20件)、collector: `pytest`(27件) — 全72件パス。
- **Dockerを実際にローカルで起動して検証**(このセッション中にユーザーがDockerにログインし直して対応):
  `docker build`でマルチステージビルドが成功することを確認、生成イメージ内のJSバンドルに
  `grep -c "プランナー"`が1件ヒットすることを確認(13章の事故の再発防止策が機能する形になっていることの実証)。
  さらに`docker compose up -d --build`でPostgres込みの実スタックを起動し、`smoke-test.sh`を実行して
  `/api/health`・認証あり/なしの`/api/repos`・`/`・`/planner`・バンドル内文字列検証が全てOKになることを確認。
  存在しない文字列を指定した場合にスクリプトが正しく失敗(exit 1)することも確認済み。
- 検証後、`docker compose down`とテスト用イメージの削除で後片付け済み。

### 14.4 今回スコープ外にしたもの(P2、次回対応)

前版`UX-IMPROVEMENT-PLAN.md`のP2にあたる以下2点は、新規DBテーブル・新規APIを伴う規模のため
今回は着手せず、ユーザーの了承のもと次回以降に持ち越した。

- **Qiita記事単位のリンク表示**: `collector/src/clients/qiita_client.py`の`get_tag_items_metadata()`は
  既にQiita APIから記事ごとの`id`/`title`/`url`相当のデータを取得できる形でAPIコールしているが、
  意図的にタイトル/URLを抽出せず捨てている(著作権配慮のコメントがあるが対象は本文であってタイトル/URLではない)。
  そのため新規のAPI呼び出しは不要で、抽出フィールドを2〜3個追加し記事単位テーブルを1つ追加するだけで実現できる
  (Qiita API v2のレート制限は認証済み1,000回/時間のため現状の呼び出し規模なら余裕がある)。
- **言語関係グラフ(`GET /api/language-graph`)**: 依存関係データ(1150件、開発DB時点)は既にDBに存在するため、
  新規データ収集は不要でAPI追加とフロント実装のみで着手できる。

### 14.5 次回セッションへの申し送り

1. `git status`を確認(このセッションの変更はコミット済みのはずだが、pushは未実施の可能性がある。
   ユーザーから明示的な指示があった場合のみ`git push`すること)。
2. 14.4のP2(Qiita記事リンク・言語関係グラフ)から着手する。着手前に、Qiita記事単位テーブルの
   スキーマ案(カラム構成)をユーザーと合意してから実装すること。
3. 本章で述べた検証済みの事実(14.1)は、次回P2着手時や別の画面改修時にも参照できるよう
   本章に集約してある。前版`UX-IMPROVEMENT-PLAN.md`(リポジトリ外)を読み直す必要はない。

## 15. Phase 2 UX改修(P2)実装完了(2026-07-11実施)

ユーザー作成の`PHASE2-UX-INSTRUCTIONS.md`(本リポジトリ外、`Downloads`フォルダ)に基づき、
14.4で持ち越したP2の3タスク(Qiita記事リンク・バブルチャート・言語関係グラフ)を実装した。
実装順序は指示書の提案通り「タスク1(スキーマ合意)→タスク3(既存API再利用)→タスク2(集計設計)」。

### 15.1 タスク1: Qiita記事単位のリンク表示

- **スキーマ**: `qiita_articles`(`collector/src/db/models.py`)。列は`id`/`qiita_id`/`tag`/`title`/`url`/
  `likes_count`/`article_created_at`/`fetched_at`。指示書の案に加え、`UNIQUE(qiita_id, tag)`制約を
  ユーザー合意の上で追加した(週次cronで同じ記事が再度INSERTされ続けるとrisk_scoresと同種の
  重複行バグになるため。再収集時は`likes_count`のみUPSERT)。
- **collector**: `qiita_client.py`の`get_tag_items_metadata()`にid/title/urlの抽出を追加。
  `get_tag_summary()`はページ走査結果(items)をトレンド集計と記事保存の両方に使い回す設計にし、
  Qiita APIへの呼び出し回数は増やしていない。`qiita_trend_collector.py`に`_save_qiita_articles()`を追加。
- **server**: `/api/risk-ranking`(`risk.js`)のレスポンス各行に`qiitaArticles`(最大3件、いいね数降順)
  を追加。`primary_language`と`qiita_articles.tag`の突き合わせは両辺を`lower()`で正規化して比較
  (タスク1-8/14.2 #8の`matchedTags`と同じ考え方。専用エンドポイントは追加せず既存APIを拡張する
  方式を選んだ)。
- **UI**: `RiskTable.jsx`に「関連Qiita記事 (n件)」バッジ列を追加。クリックでタイトル+リンクの
  ポップオーバー表示(記事本文は一切扱わない)。バッジのクリックは行クリック(リポジトリ詳細への遷移)
  とイベントを分離(`stopPropagation`)。
- 実データでの動作確認: Docker Compose上のPostgreSQLに対しcollectorを実際に実行し、
  `qiita_articles`テーブルが自動作成(SQLAlchemyの`create_all`、マイグレーション不要)されること、
  Python/Rails記事が実際に保存されること、`/api/risk-ranking`が実記事タイトル・URLを返すことを確認済み。

### 15.2 タスク3: リスク別カラーのバブルチャート

- 新規ライブラリは追加せず、既存の`recharts`(`LanguagePieChart.jsx`で使用済み)の`ScatterChart`を
  再利用。新規SQLも追加せず、既存`/api/risk-ranking`(9章/14.2 #1で`MAX(calculated_at)`パターン
  適用済み)のレスポンスをそのまま利用。
- `RiskBubbleChart.jsx`を新規追加し`Dashboard`に組み込み。X軸=コードチャーン、Y軸=Bug比率、
  バブルサイズ=Stars、色=`riskColor(total_score)`。凡例は`RiskLegend`を上部に固定表示として再利用、
  軸ラベルに単位・意味を明記、チャーン/Bug比率の特性注記を`SCORE_META`から表示。
- **jsdomでの既知の制約**: recharts の`ResponsiveContainer`は、テスト環境の`ResizeObserver`
  ポリフィル(`test-setup.js`、`observe()`が何もしない実装)がリサイズを発火しないため、
  幅・高さ0のまま実SVGを描画しない。境界値(リスク0付近・1付近)の色分けテストは、チャートの
  SVG出力ではなく共通関数`riskColor()`(`riskMeta.js`)を直接検証する形にした
  (`RiskBubbleChart`/`RiskTable`いずれもこの関数で色分けするため、テストとしての実効性は保たれる)。

### 15.3 タスク2: 言語関係グラフ(`GET /api/language-graph`)

- ノード: `primary_language`ごとの集計(リポジトリ数・平均リスクスコア)。平均リスクスコアの算出も
  `MAX(calculated_at)`相関サブクエリを踏襲(横断ルール通り)。
- エッジ: `dependencies.ecosystem`(SBOMのpurl由来、`pypi`/`npm`/`gem`/`golang`等)を
  `primary_language`の語彙にマッピングして共起件数を集計。`dependencies`テーブルは収集のたびに
  洗い替え(`dependency_collector.py`が再収集前に削除)されるため、`risk_scores`と異なり
  重複行の心配は無く素朴な`JOIN`+`GROUP BY`で十分と判断。
  **非自明な設計判断**: `npm`は JavaScript/TypeScript のどちらか一意に決められないため、
  実際のノード集合(`primary_language`)に存在する方を候補順(`TypeScript`→`JavaScript`)で採用する
  方式にした。また同一言語内(例: `pypi`→`Python`)は「言語間」の関係として意味を持たないため
  自己ループとして除外している。
- UI: 新規ライブラリを追加せず、素のSVGで手組みしたノードリンク図(`LanguageGraphChart.jsx`、
  円周上への単純配置)を採用。バンドルサイズへの影響はほぼゼロ(9章のfrappe-gantt前例のような
  重量級ライブラリの追加は今回の規模には見合わないと判断)。ノードクリックで`RiskRanking`の
  言語フィルタへ遷移。ナビバーに「言語関係グラフ」リンクを追加(`App.jsx`)。
- `smoke-test.sh`の`/language-graph`ルート疎通確認、および新規UI文字列
  (`関連Qiita記事`/`リスク分布バブルチャート`/`言語関係グラフ`)のバンドル内`grep`検証を追加。

### 15.4 検証結果

- server: `npm test`(30件、既存27件+新規3件)、client: `npm test`(32件、既存20件+新規12件)、
  collector: `pytest`(30件、既存27件+新規3件) — 全92件パス。既存テストの回帰は無し。
- Docker検証: `docker compose build`→バンドル内に新規UI文字列4種が含まれることを`grep -c`で確認
  →`docker compose up -d`→**Docker Compose上のPostgreSQLに対しcollectorを実際に実行**し
  (`--languages python,typescript --qiita-tags python,rails`)、`qiita_articles`テーブルの自動作成、
  実Qiita記事データの保存、`/api/risk-ranking`・`/api/language-graph`が実データで期待通りの
  レスポンスを返すことを確認→`smoke-test.sh`が全項目成功。検証後`docker compose down`と
  テスト用イメージの削除で後片付け済み(DB永続化用の`db_data`ボリュームは残置)。

### 15.5 本番デプロイと、新規テーブル追加時に踏んだ落とし穴(2026-07-11実施)

コミット(`d3b47d2`)・ユーザーによる`git push`後、12〜13章と同じ手順(`az acr build`→
`az containerapp update`)で本番反映した。

- `az acr build --registry techstackanalyzer2026 --image tech-stack-analyzer-server:latest ./server`
  →新リビジョン`tech-stack-analyzer-server--0000003`をデプロイ。
- **デプロイ直後、認証あり`/api/risk-ranking`が500エラーになった**(`/api/language-graph`は
  既存テーブルのみ参照するため無事だった)。`az containerapp logs show`で原因を特定:
  `error: relation "qiita_articles" does not exist`。
  → **新規テーブルを追加するコード変更は、`docker build`(マルチステージでclientをビルドするだけ)
  や`az containerapp update`(イメージを差し替えるだけ)では本番DBのスキーマまでは変わらない**
  ことを実地で確認した。テーブル作成は`collector`側の`init_db()`(SQLAlchemyの`create_all`、
  マイグレーションツール不使用)が担っており、**本番Postgresに対してcollectorを最低1回実行する
  までは新テーブルは存在しない**。今後もテーブル追加を伴う変更をデプロイする際は、
  サーバーのデプロイだけで完結しないことを前提に手順を組むこと。
- 復旧: 8章と同じAzure Container Instances(ACI)の使い捨てジョブ方式で対応
  (`az acr build`で`collector/Dockerfile`を最新コードでリビルド→
  `az container create --restart-policy Never`で本番`DATABASE_URL`向けに実行→
  `qiita_articles`テーブル作成+実データ投入を確認→`az container delete`で削除)。
  ローカル(WSL)からは8章記載の通り本番Postgresの5432番ポートに直接到達できないため、
  ACI経由が引き続き唯一の即時実行手段。
- 修正後、認証あり`/api/risk-ranking`(qiitaArticles付き)・`/api/language-graph`・`/api/repos`が
  いずれも200、`smoke-test.sh`(新規UI文字列4種を含む)が全項目成功することを確認済み。

### 15.6 次回セッションへの申し送り

1. コードは`d3b47d2`としてコミット・push・本番デプロイ済み。API/バンドル文字列/実データでの
   検証はこのセッションで完了済みだが、**ブラウザでの実画面確認はユーザー本人による実施が必要**
   (横断的な実装ルール最終項目の通り、Claude Codeでは代行不可)。
2. 15.5の教訓により、**今後スキーマ変更(新規テーブル・カラム追加)を伴う変更を本番反映する際は、
   サーバーのデプロイ後に本番DBへcollectorを1回実行する手順を必ずセットで計画すること**
   (ACIジョブ方式、または`collect.yml`の`workflow_dispatch`でも代替可能)。
3. 言語関係グラフのエッジ推定(`npm`→TypeScript/JavaScript)は語彙マッチングによる近似であり、
   完全ではない(15.3参照)。実運用で違和感があれば設計を見直す余地がある。

## 16. 言語関係グラフの見た目修正・CI潜在バグ修正(2026-07-11実施、15章の続き)

15章の本番反映後、ユーザーが実際に`/language-graph`を確認したところ、「4言語が円周上に均等配置され、
線で繋ぐと単なる正方形の対角線にしか見えず、ネットワーク図として説得力に欠ける」との指摘があった。

### 16.1 言語関係グラフの再設計

- `dataviz`スキルを参照した上で、知識グラフ可視化の定石(force-directed layout、Web検索でも
  GraphRAG等の知識グラフ可視化における標準手法として再確認)を軽量に自前実装。新規ライブラリは
  追加していない(ノード反発・エッジのバネ引力・弱い中心吸引を約260回反復する簡易物理シミュレーション)。
- 乱数はノード集合の文字列から決定的にシード(`mulberry32`)しており、同じデータであれば
  再レンダリングしてもレイアウトが揺れない(テストで検証済み)。
- 直線エッジを二次ベジェの緩やかな曲線に変更、上位3件のエッジには共起件数を数値ラベルとして
  選択的に表示(`dataviz`スキルの「全点にラベルを付けない」原則に沿った対応)、ノードに
  ドロップシャドウ、ホバー時に関連ノード/エッジをハイライトしカスタムツールチップを表示する
  インタラクションを追加。
- `riskColor()`(既存の状態色パレット、green/amber/red)を`dataviz`スキルの検証スクリプトに
  かけたところ、カテゴリカル配色としてはlightness bandの基準にFAILしたが、これはリスク水準を
  表す**ステータス色**であり、他画面(RiskTable/RiskBubbleChart等)全体で既に一貫して使われている
  既存の設計なので、今回のグラフ単体の修正スコープでは変更していない(アプリ全体の配色を
  見直す場合は別タスクとして扱うべき)。
- **ブラウザでのスクリーンショット確認は今回もできなかった**(Playwrightの`libnspr4.so`不足、
  8章・12章と同じくsudo権限が無い制約)。レンダリング結果のSVG座標を書き出し、ノード間距離が
  均一でないこと・再レンダリングで座標が変わらないことをテストで検証するに留めている。
  ユーザー本人によるブラウザでの目視確認が必須。

### 16.2 CIワークフローの潜在バグ修正

`git push`後、GitHub Actionsの`test.yml`(Phase 1で追加、14.2 #11)が
`Could not find '.../tech-stack-analyzer/server/tests/*.test.js'`で失敗した。

- 原因: `server/package.json`の`test`スクリプトが`node --test 'tests/*.test.js'`と
  **シングルクォートでglobを囲っていた**。ローカル環境のNode.js(v24)は`node --test`に
  渡された文字列を内部でglob展開してくれるが、CIワークフローが指定する`node-version: "20"`には
  その機能が無く、シェル側もクォートのため展開せず、文字通り`tests/*.test.js`という
  ファイル名を探しに行って失敗していた。
- 修正: クォートを外し`node --test tests/*.test.js`に変更。シェル(dash、ローカルWSL・CI runner
  いずれも同じ)がNodeに渡す前にglobを展開するため、Nodeのバージョンに依存しない。
- **これはPhase 1でtest.ymlが追加されて以来の潜在バグで、実際にpushでワークフローが実行されたのは
  今回が初めてだった可能性が高い**(14.3の検証はローカルの`npm test`のみで、CI実行結果の確認は
  行われていなかった)。教訓: CIワークフローを新規追加した際は、ローカルの`npm test`が通ることだけでなく、
  実際にpushしてGitHub Actions上で緑になることまで確認するのが望ましい。

### 16.3 本番反映

- `d3b47d2`→`092d525`→`547341a`(グラフ再設計)→`350f8fb`(CI修正)の順でコミット・push済み。
  GitHub Actions `Test`ワークフローは`350f8fb`で成功(緑)を確認。
- `az acr build`→`az containerapp update`(新リビジョン`--0000004`)で本番反映。
  `smoke-test.sh`全項目成功、配信バンドルに新コード由来の`feDropShadow`文字列が含まれることを
  確認、認証あり`/api/risk-ranking`・`/api/language-graph`とも200。
- **ユーザーによるブラウザでの目視確認はこのセッション終了時点でまだ実施されていない**
  (16.1参照)。次回セッション冒頭、または本日中に確認予定。

### 16.4 次回セッション(2026-07-12予定)の申し送り

1. **次回はPdM(プロダクトマネージャー)の要望に沿った、よりビジネス寄りの改修を行う予定**。
   ユーザーがWebから情報を網羅的に収集した上で着手する意向。本ドキュメント(HANDOFF.md)の
   技術的な経緯とは別に、要件そのものは次回セッション開始時にユーザーから提示される見込みなので、
   着手前に前提(対象画面・優先度・期限等)をユーザーに確認すること。
2. 16.1の言語関係グラフ再設計について、ユーザーからブラウザでの見た目フィードバック
   (レイアウトの適切さ、ホバー挙動、曲線エッジの見え方等)が来ている場合はそれを最優先で反映すること。
   まだ確認されていない場合は、次回セッション冒頭で確認を促すこと。
3. 15.6/15.5の教訓(新規テーブル追加時は本番DBへのcollector実行を忘れずセットで計画すること)は
   引き続き有効。
4. CI(`test.yml`)は`350f8fb`以降グリーンになったが、今後もワークフローや依存関係を変更した際は
   ローカルの`npm test`だけでなく実際のpush結果(GitHub Actions画面)まで確認する習慣を継続すること。

## 17. Phase 3: ユースケース別アーキテクチャガイド MVP + 平均値の分布可視化改善(2026-07-12実施)

`PHASE3-INSTRUCTIONS-MVP.md`(ユーザーDownloads)に基づき、「効率化・生産性向上」「業務自動化」の
2カテゴリに絞ったアーキテクチャガイドMVPを実装した。

### 17.1 実装内容

- 新規テーブル3つ(`use_case_categories`/`architecture_patterns`/`architecture_pattern_components`、
  collector側SQLAlchemyモデル、既存`qiita_articles`と同じ`create_all`方式)。
- 冪等な投入スクリプト`collector/scripts/seed_usecase_guide.py`を新規作成。通常のバッチ収集
  (`main.py`)とは別経路。カテゴリ・パターンは`slug`でupsert、コンポーネントは一意キーが無いため
  パターン単位で洗い替え(全削除→再insert)。
- 新規API: `GET /api/usecase-categories`、`GET /api/usecase-categories/:slug/patterns`、
  `GET /api/architecture-patterns/:slug`(各コンポーネントの`component_name`を実リポジトリの
  `primary_language`・Qiita記事の`tag`と突き合わせ、`MAX(calculated_at)`相関サブクエリパターンを踏襲)。
  括弧書き部分を除去してトークン化する方式("PostgreSQL (Supabase)"→"PostgreSQL")で、実データとの
  突き合わせと人間向けの補足表記を両立させている。
  **既知の制約**: Vercel/Docker/Zapier等のインフラ・SaaSツール名は収集対象言語(Python/TypeScript/
  Ruby/Go)の語彙に存在しないため、これらのコンポーネントは実データ0件になるのが正常。
- 新規フロント`/guide`(3ステップ: カテゴリ→パターン→詳細のウィザード)。
- **追加スコープ**: ユーザーが言語関係グラフを見て気づいた「平均値が個々のリポジトリのばらつきを
  隠してしまう(最大公約数化する)」問題への対応。`/api/language-graph`にMIN/MAXを追加し、
  平均が低くても要注意リポジトリが混ざっている言語には赤い破線リングを表示。ダッシュボードカードにも
  min-max範囲バーと「⚠n件が要注意」バッジを追加。

### 17.2 デプロイで踏んだ落とし穴

- `collector/Dockerfile`が`scripts/`ディレクトリをCOPYしておらず、ACIジョブ用イメージに
  `seed_usecase_guide.py`が含まれていなかった(15.5と同種の「ビルド構成の見落とし」)。
  `COPY scripts ./scripts`を追加して修正。
- 手順: サーバー+collectorイメージをビルド→`az containerapp update`→ACIジョブ(使い捨て)で
  `seed_usecase_guide.py`を本番Postgresに実行、というPhase3以降繰り返すことになるパターンを確立。

## 18. ガイド付きストーリー導線の実装(2026-07-12実施)

ユーザー要望: 「READING-tech-category-patterns.md(6カテゴリの技術選定あるある解説)を最初の
ガイダンスとして案内し、アーキテクチャガイド→プランナー(スキップ可)→言語関係グラフ→
リスクランキング→ダッシュボードを一連のストーリーとして関連付け、戻る/進むボタンと動線マップを追加する」。

### 18.1 実装内容

- 新規`/reading`ページ。READINGガイドの内容を`server/client/src/data/readingGuide.js`に構造化データとして
  書き起こし(markdownレンダリングライブラリは追加せず、既存の`LanguageGraphChart`/`GanttChart`と同じ
  「軽量な内容は自前データ+JSX」の方針を踏襲)。
- 新規`JourneyNav`ステッパーコンポーネント。固定ステップ(はじめに→ガイド→プランナー→言語グラフ→
  リスクランキング→ダッシュボード)を全ページ共通で表示し、戻る/次へボタン+どのステップへも
  直接ジャンプできるクリック可能なマップとして機能する。
- 選択したパターンをURLクエリパラメータ(`?pattern=<slug>&language=<lang>`)でページ間に伝播する方式
  (React ContextやグローバルStoreは導入せず、既存の`?language=`と同じ考え方を踏襲)。
- `GET /api/architecture-patterns/:slug`にパターン全体の`matchedLanguages`(実際に収集済みの言語との
  一致)を追加し、下流ページ(プランナー/言語グラフ/リスクランキング/ダッシュボード)がこれを使って
  ハイライト表示する。
- プランナーは選択パターンの`matchedLanguages`を候補技術スタックへ自動反映、言語関係グラフは該当言語
  ノードを青いリングでハイライト(赤い要注意リングとは別要素、同心円で共存)、ダッシュボードは該当
  言語のカード・バブルをハイライト。

## 19. UXフィードバック対応(2026-07-12実施)

ユーザーからの実画面確認後のフィードバック2点に対応。

1. **Guideの数値・コンポーネントの意味が分かりにくい**: 総合リスクスコアの説明文+`RiskLegend`を
   構成要素セクションに追加。各コンポーネントに実際の使用場面の説明文(`description`)を追加し
   (`seed_usecase_guide.py`に8コンポーネント分実データとして記述)、実リポジトリ一覧に
   「リスク上位/下位」のラベルを追加して単なる数値の羅列にならないようにした。
2. **トップナビの並びがジャーニーと不一致**: `App.jsx`のナビをジャーニー順
   (はじめに→アーキテクチャガイド→プランナー→言語関係グラフ→リスクランキング→ダッシュボード)に
   並び替え。

## 20. アーキテクチャガイド残り4カテゴリ追加 + Qiita週次AIレビュー(定点観測)機能(2026-07-12実施)

ユーザー要望: 「アーキテクチャガイドに残りのカテゴリも加え、Qiitaレビューの定期実行メニューを追加して
AIが学習して定点観測により解像度を上げていく仕組みを作ってほしい」(当初「残り3つ」と言われたが
実際には4つ残っていたことを確認の上、4つ全て追加)。

### 20.1 実装内容

- 残り4カテゴリ(情報共有・ナレッジ共有/データ分析・市場予測/省人化/リスク検知・不正検知)を追加。
  既存2カテゴリと全く同じ構造(category→patterns[light/enterprise]→components)。READINGガイドで
  既に整理済みの一次情報(あるある・統計)を`risk_notes`に反映。6カテゴリ全体の`display_order`を
  READINGガイドの並びに合わせて再採番。
- 新規テーブル`qiita_ai_reviews`(`tag`/`summary`/`trend_direction`/`data_points_count`/
  `previous_review_id`(自己参照)/`created_at`)。
- 新規Python Anthropicクライアント(`collector/src/clients/anthropic_client.py`)。`anthropic`パッケージは
  追加せず、既存の`github_client.py`/`qiita_client.py`と同じ`requests`直叩きスタイルで統一。
  コードフェンス除去→JSONパース、失敗時は1回だけ強調プロンプトで再試行(`analyze.js`の挙動をPython側でも踏襲)。
- `collector/src/analysis/qiita_ai_review.py`: 週次`collect.yml`実行時に、収集できた各Qiitaタグの
  `qiita_tag_trends`全履歴+**そのタグの直前のAIレビュー(前回自分が書いた要約)**をプロンプトに含めて
  再分析させる。これが「AIが学習して定点観測により解像度を上げていく」の実体で、
  `previous_review_id`でレビュー同士を連鎖させ、時系列で「前回はこう結論したが、今回のデータでは
  こう修正する」という更新型の分析になる。ユーザーの意向確認により手動実行ボタンは設けず、
  週次自動分析+履歴蓄積のみを実装。
- 新規ページ`/qiita-reviews`。ユースケース選択のジャーニーとは別系統の「定点観測」機能のため
  `JourneyNav`には含めず、独立したナビ項目として追加。

### 20.2 実データでの検証とセキュリティインシデント

- ローカルdocker-compose上で実際の`ANTHROPIC_API_KEY`(ユーザー提供、リポジトリルートの`.env`に保管)を
  使い2回collectorを実行。2回目のレビューが1回目の結論(「関心減退」)を引用した上で
  「実質横ばいであり、安定傾向と修正するのが妥当」と修正する挙動を実際のAPIレスポンスで確認できた。
- **インシデント**: このライブ検証中、リポジトリルートの`.env`(GITHUB_TOKENの値末尾にCRLF由来の`\r`が
  混入していた)を誤って丸ごと`source`したところ、`requests`ライブラリのヘッダー検証エラーの例外メッセージに
  トークン本体が含まれ、会話ログに露出する事故が発生した。ユーザーに即座に報告し、該当トークンの
  失効・再発行を依頼した。**教訓: 複数の`.env`が存在する環境(このプロジェクトはルート/collector/server
  各階層に`.env`がある)で、目的の1変数だけが必要な場合はファイル全体を`source`せず、
  `grep '^KEY=' file | cut -d= -f2- | tr -d '\r\n'`のように該当行だけを安全に抽出すること。**

### 20.3 本番反映で踏んだ落とし穴

- サーバー+collectorイメージをビルド・デプロイ、6カテゴリをACIジョブで再投入(手順は17.2と同じ)。
- `collect.yml`はpushでは自動起動しない(`schedule`/`workflow_dispatch`のみのトリガー)。
  ユーザーが「pushしたのに新しいアクションが無い」と混乱する場面があり、この仕様(pushトリガーが
  無いのは意図的な設計であること)を説明した。
- GitHub CLIが環境に無く、collector用PATにも`actions:write`権限が無かったため、
  `workflow_dispatch`のAPI経由トリガーもできず、**ユーザーに手動でActions画面から`Run workflow`を
  押してもらう運用**になった(今後も同様)。
- **1回目の`workflow_dispatch`は成功したが、`QIITA_TOKEN`(GitHub Secrets)が失効しており
  Qiitaトレンド収集が5タグ全て401 Unauthorizedで失敗**。収集できたタグが0件だったため、
  AIレビュー処理自体は「対象0件」として正しく何もせず終了した(バグではなく設計通りの挙動)。
  ユーザーがQiitaで新規トークンを発行しGitHub Secretsを更新後、再度`workflow_dispatch`を実行し、
  5タグ全てで実際のAIレビュー生成に成功。
- 実データの興味深い検証結果: `vue`タグは4回連続で記事数・いいね数が0件のままだったため、AIが
  「タグ活動の実質停止よりも、データ収集経路自体に不備がある可能性を強く示唆しており、収集システムの
  点検が急務」と指摘した。単なるトレンド判定にとどまらず、データ品質の異常にも気づける実例になった。

## 21. 最終UX微修正(2026-07-12実施)

ユーザーからの実画面確認後のフィードバック2点に対応。

1. `/reading`の「ガイドで選択可」バッジと「効率化・業務自動化の2カテゴリのみ選べる」注記が、
   20章で6カテゴリ全対応した後も古いまま残っていた → バッジ・注記・`readingGuide.js`の
   `guideSlug`フィールドを削除(全カテゴリが選択可能になった以上、区別する意味が無いため)。
2. ダッシュボードのリスク分布バブルチャートをクリックしてもリスクランキングへ遷移しなかった →
   言語関係グラフのノードクリック・言語別サマリカードのクリックと同じ挙動(該当言語でフィルタした
   リスクランキングへ遷移)を追加。`RiskBubbleChart`が`useNavigate`を使うようになったため、
   既存テスト(`RiskBubbleChart.test.jsx`)は`MemoryRouter`で包む必要が生じ、あわせて修正した。

## 22. 次回セッションへの申し送り

1. 2026-07-12時点で、本セッションの全コミット(Phase3ガイドMVP・ジャーニー導線・残り4カテゴリ・
   Qiita週次AIレビュー・UX微修正)は本番反映・動作確認済み。
2. Qiita週次AIレビューは`collect.yml`の週次cron(毎週月曜3時UTC)で今後自動的に履歴が蓄積されていく。
   次回セッションでは複数回分のレビュー履歴が`/qiita-reviews`で見られるはずなので、
   `previous_review_id`の連鎖が正しく積み上がっているか確認するとよい。
3. 20.2のGITHUB_TOKEN露出インシデントを受け、ユーザーは該当トークンを失効・再発行済みと想定されるが、
   次回セッション開始時に念のため状況を確認すること。また、複数の`.env`ファイルを扱う際は
   ファイル全体の`source`を避け、必要な変数だけを抽出する習慣を継続すること。
4. 16.4で予告されていた「PdM(プロダクトマネージャー)要望に沿ったビジネス寄りの改修」は、
   本セッションで扱った内容(ユーザー自身の要望への直接対応)とは別に、まだ着手されていない。
   次回はその観点の要件が提示される可能性がある。
5. `collect.yml`は現状ローカルのGitHub CLI等が使えずAPI経由でのworkflow_dispatchトリガーができないため、
   今後もユーザー本人によるActions画面からの手動実行が必要になる(20.3参照)。
