/**
 * Cloudflare Workers ограничивает число подзапросов (fetch) за одно
 * исполнение — 50 на Bundled-тарифе (используем его, см. wrangler.toml —
 * Unbound не подключен). Раньше именно превышение похожего лимита на
 * "горячем" пути пользователя (15-20+ параллельных fetch на одну страницу
 * гонки) приводило к "A stalled HTTP response was canceled to prevent
 * deadlock". Внутри cron той же беды в принципе не должно случиться:
 * каждая фаза синка ЗАРАНЕЕ грубо оценивает, сколько подзапросов ей
 * потребуется, и просто откладывает работу до следующего тика (через 15
 * минут), если бюджета не хватает — вместо того чтобы упереться в лимит
 * на середине постраничной агрегации карьерной статистики.
 *
 * Если аккаунт когда-нибудь перейдёт на Workers Unbound (лимит 1000) —
 * поднять BUNDLED_SUBREQUEST_LIMIT ниже.
 */
const BUNDLED_SUBREQUEST_LIMIT = 50;
const SAFETY_MARGIN = 5;

export class SubrequestBudget {
  private remaining: number;

  constructor(limit: number = BUNDLED_SUBREQUEST_LIMIT - SAFETY_MARGIN) {
    this.remaining = limit;
  }

  /** true и списывает `cost` из бюджета, если он позволяет; иначе false и бюджет не трогается. */
  tryConsume(cost: number): boolean {
    if (cost > this.remaining) return false;
    this.remaining -= cost;
    return true;
  }

  get left(): number {
    return this.remaining;
  }
}
