import { appRoutes } from '../../app/routes';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

/**
 * ナビ項目はルート定義から導出する。
 * 手で二重管理すると、ルートを足したのにナビに載せ忘れて
 * 「存在するのに到達できない機能」が生まれる（サブスクとグラフで実際に起きた）。
 */
export const navItems: NavItem[] = appRoutes
  .filter((route) => route.nav !== undefined)
  .map((route) => ({ to: route.path, label: route.nav!.label, icon: route.nav!.icon }));
