import { getProduct, getSettings, markNewLowNotified } from '../shared/storage';

export interface MaybeNotifyNewLowOptions {
  notify?: (notificationId: string, options: chrome.notifications.NotificationOptions<true>) => Promise<void> | void;
}

export async function maybeNotifyNewLow(
  productId: string,
  options: MaybeNotifyNewLowOptions = {}
): Promise<boolean> {
  const product = await getProduct(productId);
  if (!product) return false;

  const settings = await getSettings();
  if (!settings.globalNotifications || !product.notifyOnNewLow) return false;

  const snapshot = product.currentSnapshot;
  if (snapshot.status !== 'ok' || snapshot.price === null) return false;

  const allTimeLow = product.stats.allTimeLow;
  if (!allTimeLow) return false;
  if (allTimeLow.price !== snapshot.price) return false;
  if (allTimeLow.ts !== snapshot.ts) return false;
  if (snapshot.ts < product.lastCheckedAt) return false;

  const marked = await markNewLowNotified(productId, snapshot.price, snapshot.ts);
  if (!marked) return false;

  const notify = options.notify ?? defaultNotify;
  await notify(`musinsa-price-tracker:new-low:${productId}:${snapshot.price}`, {
    type: 'basic',
    iconUrl: product.thumbnail || 'icon-128.png',
    title: 'New Musinsa low price',
    message: `${product.name}: ${snapshot.price.toLocaleString('ko-KR')}원`,
  });

  return true;
}

async function defaultNotify(
  notificationId: string,
  options: chrome.notifications.NotificationOptions<true>
): Promise<void> {
  await chrome.notifications.create(notificationId, options);
}
