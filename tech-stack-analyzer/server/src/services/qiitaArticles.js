import { query } from '../db/pool.js';

const MAX_ARTICLES_PER_TAG = 3;

// primary_language(や本ガイドのcomponent_name)とqiita_articles.tagを突き合わせる。
// 14.2 #8のmatchedTagsと同じ考え方で、大文字小文字の表記ゆれによるサイレントな0件ヒットを防ぐため
// 両辺をlower()で正規化して比較する。risk.js/usecaseGuide.jsどちらもこの関数を共有し、
// 14.1の教訓(ローカル複製を作らない)をここでも踏襲する。
export async function fetchArticlesByTag(tags) {
  if (!tags.length) return {};
  const params = tags.map((t) => t.toLowerCase());
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
  const sql = `SELECT tag, title, url, likes_count, article_created_at
               FROM qiita_articles
               WHERE LOWER(tag) IN (${placeholders})
               ORDER BY likes_count DESC`;
  const articles = await query(sql, params);
  const byTag = {};
  for (const article of articles) {
    const key = article.tag.toLowerCase();
    if (!byTag[key]) byTag[key] = [];
    if (byTag[key].length < MAX_ARTICLES_PER_TAG) byTag[key].push(article);
  }
  return byTag;
}
