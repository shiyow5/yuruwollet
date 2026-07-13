import { useState } from 'react';
import { cn } from '../../lib/cn';
import { avatarToneClass, initialOf, isDisplayableAvatarUrl } from '../../lib/avatar';

interface Props {
  /** 表示名。画像が出せないときは頭文字にフォールバックする */
  name: string;
  /** メンバー色の決定に使う */
  memberId: string;
  /** Google のプロフィール画像。無いことの方が普通（Access の picture は best-effort） */
  src?: string;
  className?: string;
}

/**
 * メンバーのアバター。
 *
 * フォールバックが 3 系統ある。**画像が出ないのが異常ではない。**
 *   1. src が渡ってこない（Access の picture クレームが届かない = 公式に best-effort）
 *   2. src が https でない（isDisplayableAvatarUrl が弾く）
 *   3. 画像の読み込みに失敗する（onError）
 * いずれも頭文字 + メンバー色にする。
 */
export function Avatar({ name, memberId, src, className }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = isDisplayableAvatarUrl(src) && !failed;

  return (
    <span
      className={cn(
        'flex h-full w-full items-center justify-center overflow-hidden rounded-full font-label-sm text-label-sm font-medium',
        showImage ? 'bg-surface-container-high' : avatarToneClass(memberId),
        className,
      )}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          // 装飾。読み上げ対象の名前は、包む側（TopAppBar のリンク等）が aria-label で持つ
          alt=""
          src={src}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
