import { NavLink } from 'react-router';
import { Icon } from '../ui/Icon';
import { cn } from '../../lib/cn';
import { navItems } from './navItems';

/** モバイル用ボトムナビ（md 以上では非表示） */
export function BottomNav() {
  return (
    // 画面が 6 つあるので、1 項目あたりの幅を切り詰める。
    // アイコンの丸みを px-6 のままにすると 1 項目 72px 必要になり、
    // 360px 幅の端末で 6 項目 (432px) が収まらず溢れる。
    //
    // **下端の余白は env(safe-area-inset-bottom) を足す。**
    // fixed bottom-0 なので、そのままだとラベルが画面のいちばん下に貼り付き、
    // 角丸のかかった端末では文字が丸みに食われて読みにくい。
    // ホームインジケータ / ジェスチャーバーのある端末ではその下に潜り込む。
    // 横向きのノッチ側（left/right）も同様に避ける。
    //
    // 辺ごとに **1 回だけ** 指定する（px-1 py-2 と混ぜると同じプロパティの
    // クラスが 2 つ出て、cn は競合を解決しないので CSS の出力順に依存する）。
    // env() は該当しない端末では 0 なので、PC の見た目は変わらない。
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center rounded-t-xl border-t border-black/5 bg-white pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[calc(0.25rem+env(safe-area-inset-left))] pr-[calc(0.25rem+env(safe-area-inset-right))] pt-2 shadow-lg md:hidden">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1"
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'flex items-center justify-center rounded-xl px-3 py-0.5',
                  isActive && 'bg-custom-accent/20',
                )}
              >
                <Icon
                  name={item.icon}
                  filled={isActive}
                  className={isActive ? 'text-custom-accent' : 'text-custom-text/70'}
                />
              </span>
              <span
                className={cn(
                  'w-full truncate text-center font-label-sm text-[10px] leading-tight',
                  isActive ? 'font-bold text-custom-accent' : 'text-custom-text/70',
                )}
              >
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
