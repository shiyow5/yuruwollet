export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export const navItems: NavItem[] = [
  { to: '/', label: 'ホーム', icon: 'home' },
  { to: '/ledger', label: '家計簿', icon: 'account_balance_wallet' },
  { to: '/wishlist', label: 'ウィッシュリスト', icon: 'favorite' },
  { to: '/mypage', label: 'マイページ', icon: 'person' },
];
