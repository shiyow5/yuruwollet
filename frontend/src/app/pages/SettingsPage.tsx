import { AccountCard } from '../../features/settings/AccountCard';
import { AppInfoCard } from '../../features/settings/AppInfoCard';

/**
 * アプリ全体の設定。
 *
 * マイページ（その人のもの: プロフィール / 初期残高 / 目標貯金）とは分ける。
 * これまで TopAppBar の歯車が /mypage を指しており、ボトムナビと完全に重複していた。
 */
export function SettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="font-headline-md text-headline-md font-bold text-custom-text">設定</h2>
        <p className="text-body-md text-custom-text/60">アカウントとアプリの情報。</p>
      </header>

      <AccountCard />
      <AppInfoCard />
    </section>
  );
}
