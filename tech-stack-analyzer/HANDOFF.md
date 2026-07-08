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

- [ ] `DASHBOARD_PASSWORD` / `POSTGRES_PASSWORD` を本番用の強いパスワードに変更(現状は動作確認用の仮パスワード)
- [ ] セルフホストランナーのサービス化(`svc.sh install`、sudo権限が必要)
- [ ] 本番でインターネット公開する場合はHTTPS終端(リバースプロキシ等)を追加
- [ ] `helmet()` は `contentSecurityPolicy: false` にしている(社内限定公開の想定。外部公開時は見直すこと)
- [ ] Reactクライアントのビルド成果物(571KB, 500KB超の警告あり)のコード分割を検討してもよい
- [ ] ブラウザでの実画面確認は、このセッションの環境にsudo権限がなくPlaywright用の共有ライブラリ
      (`libnspr4`等)を追加インストールできなかったため未実施。API契約とコンポーネントの
      フィールド参照の突合のみで検証済み。次回、ブラウザ確認できる環境があれば実施するとより確実。
