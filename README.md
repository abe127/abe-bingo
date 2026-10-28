# 共通点ビンゴ

社内イベント向けの交流ビンゴ。参加者は20問に答えてカードを作り、話した相手とQRコード（または4けたのコード）を交換すると、二人の共通点に当てはまるマスを1つ開けられる。1人につき開けられるのは1マスだけ。

## 構成

| 役割 | 技術 |
|---|---|
| フロントエンド | TypeScript + React + Vite（`web/`） |
| ホスティング | Firebase Hosting |
| データベース | Cloud Firestore（asia-northeast1） |
| 認証 | Firebase Authentication（匿名認証）＋ イベントごとの合言葉 |
| サーバー処理 | Cloud Functions for Firebase 2nd gen（`functions/`） |
| ゲームロジック | `shared/game.ts`（フロントと関数で共有） |

```
shared/game.ts            質問・マス・判定ロジック（質問を変えるならここだけ）
functions/src/index.ts    joinEvent / previewPartner / openCell / adminAction
web/src/views/Play.tsx    参加者画面（登録・カード・みんな・遊び方）
web/src/views/Screen.tsx  会場スクリーン（#/screen）
web/src/views/Admin.tsx   主催者画面（#/admin）
firestore.rules           ブラウザは読むだけ。回答とコードは本人のみ
scripts/                  イベント作成、難易度シミュレーション、エミュレーター試験
```

### データ

```
events/{eventId}                 name, status（playing / finished）
events/{eventId}/players/{uid}   nickname, card, opened, openedCount, lines, bingoAt   … 参加者全員が読める
events/{eventId}/private/{uid}   answers, code                                       … 本人だけ読める
events/{eventId}/codes/{code}    uid                                                 … 誰も読めない（関数のみ）
events/{eventId}/secret/config   passphraseHash, adminKeyHash                        … 誰も読めない（関数のみ）
```

書き込みはすべて Cloud Functions 経由。マスを開ける条件（共通点があるか、その相手をすでに使っていないか）はサーバー側のトランザクション内で確かめる。

## ローカルで動かす

必要なもの：Node.js 20 以上、Java 11 以上（Firestore エミュレーター用）

```bash
npm run setup          # 依存パッケージを入れる（ルート・web・functions）
npm test               # ゲームロジックのテスト
npm run sim:balance    # 難易度シミュレーション（Firebase 不要）

# ターミナル1
npm run emulators      # Auth / Firestore / Functions のエミュレーター（UI: http://localhost:4000）
# ターミナル2
npm run seed:emu       # demo イベントを作成（合言葉: もみじ、主催者キー: admin）
npm run dev:emu        # http://localhost:5173 で Web アプリ
npm run sim:emu        # 30体のボットで登録・照合・マス開けを同時実行
```

スマホから試すときは `npm --prefix web run dev -- --host` で同じLANから開ける（カメラはHTTPSか localhost でないと使えないので、QR読み取りの確認は本番環境で）。

## 本番環境を作る

1. **GCPプロジェクトに Firebase を追加**（Firebase コンソールで既存の GCP プロジェクトを選択）。料金プランは Blaze（Functions に必要）。予算アラートを設定しておく。
2. **Authentication** で「匿名」ログインを有効にする。
3. **Firestore** をネイティブモード・`asia-northeast1` で作成する。
4. **ウェブアプリを登録**し、設定値を `web/.env.local` に書く（`web/.env.example` を参照）。
5. `.firebaserc` の `default` を実際のプロジェクトIDに変える。
6. デプロイ：
   ```bash
   npx firebase login
   npm run deploy
   ```
7. イベントを作る（`gcloud auth application-default login` 済みの状態で）：
   ```bash
   GCLOUD_PROJECT=<プロジェクトID> npm run create-event -- --id autumn-2026 --name "秋の懇親会" --passphrase もみじ
   ```
   主催者キーが表示されるので控えておく。

URL：
- 参加用 `https://<ホスト>/?e=autumn-2026`
- 会場スクリーン `https://<ホスト>/?e=autumn-2026#/screen`
- 主催者画面 `https://<ホスト>/?e=autumn-2026#/admin`

### GitHub Actions で自動デプロイする場合

`.github/workflows/ci.yml` は、PR で型チェック・テスト・ビルドを行い、master へのマージで `firebase deploy` する。認証は Workload Identity 連携（鍵ファイル不要）。リポジトリの Variables に次を設定する。

- `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` / `VITE_DEFAULT_EVENT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`（`projects/<番号>/locations/global/workloadIdentityPools/<プール>/providers/<プロバイダ>`）
- `GCP_DEPLOY_SERVICE_ACCOUNT`（Firebase 管理者、Cloud Functions 管理者、サービス アカウント ユーザーなどのロールを付けたもの）

## 当日の流れ

1. 主催者画面で状態が「受付・プレイ中」になっていることを確認する。
2. プロジェクターで会場スクリーンを映す（参加用QRとランキングが出る）。
3. 参加者はQRを読み取り、ニックネーム・合言葉・20問に答えて参加。
4. 終わりの時間に主催者画面で「終了する」。以降は登録もマス開けもできない。
5. リハーサルのあとは主催者画面の「全員のデータを削除」でリセットできる。

## 質問やマスを変えるとき

`shared/game.ts` の `QUESTIONS` と `CELLS` を編集し、`npm test` と `npm run sim:balance` で確かめる。

- `same` マス：回答が同じなら開く
- `opp` マス：回答が違えば開く（2択の質問にだけ使う）
- `adj` マス：誕生月が隣り合えば開く
- カードには `CELLS` から24種類がランダムに並ぶので、`CELLS` は24種類以上必要

イベント途中で質問やマスを変えると、すでに作られたカードと食い違うので、変更は開催前に行う。

## 既知の制約

- 匿名認証なので、ブラウザを変えたり履歴を消したりすると別の参加者になる（同じブラウザなら続きから遊べる）。
- コードは4けたで、照合関数を総当たりで呼べば会わずにマスを開けることは理論上できる。社内イベントの想定では許容し、気になる場合は `previewPartner` に呼び出し回数の上限を加える。
- 1イベントあたり数百人までを想定（参加者一覧を全員がリアルタイム購読するため）。
